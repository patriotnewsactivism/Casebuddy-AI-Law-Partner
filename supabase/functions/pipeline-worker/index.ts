import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callDeepSeek(apiKey: string, systemPrompt: string, userPrompt: string) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from DeepSeek');
  return JSON.parse(content);
}

async function callGroq(apiKey: string, systemPrompt: string, userPrompt: string) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from Groq');
  return JSON.parse(content);
}

/** DeepSeek first (best quality), Groq as a fast/free fallback if DeepSeek is
 * out of credits, rate-limited, or otherwise erroring — so a single exhausted
 * key doesn't fail the whole entity_extraction step. */
async function extractEntities(deepseekKey: string, groqKey: string, systemPrompt: string, userPrompt: string) {
  const errors: string[] = [];
  if (deepseekKey) {
    try {
      return await callDeepSeek(deepseekKey, systemPrompt, userPrompt);
    } catch (err) {
      errors.push(`DeepSeek: ${err instanceof Error ? err.message : String(err)}`);
      console.warn('DeepSeek entity extraction failed, falling back to Groq:', err);
    }
  }
  if (groqKey) {
    try {
      return await callGroq(groqKey, systemPrompt, userPrompt);
    } catch (err) {
      errors.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Entity extraction failed on all providers. ${errors.join('; ')}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();
    if (!jobId) throw new Error("Missing jobId");

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
    const groqKey = Deno.env.get('GROQ_API_KEY') ?? Deno.env.get('VITE_GROQ_API_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch the job and lock it
    const { data: job, error: jobError } = await supabase
      .from('pipeline_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select('*, documents(*)')
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found or already processing" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    const document = job.documents;
    if (!document) throw new Error("Job has no associated document");

    try {
      // 2. Process based on job_type
      if (job.job_type === 'ocr') {

        // 'case-documents' is a PRIVATE bucket. document.file_url may be a
        // stale bare storage path (legacy rows) or a stored "public" URL that
        // isn't actually fetchable against a private bucket. Always mint a
        // fresh short-lived signed URL from storage_path when we have one —
        // that's the only reliably fetchable link for ocr-document to fetch().
        let ocrFileUrl: string | null = document.file_url || null;
        if (document.storage_path) {
          const { data: signedData, error: signError } = await supabase
            .storage
            .from('case-documents')
            .createSignedUrl(document.storage_path, 600); // 10 minutes, plenty for OCR fetch
          if (signError) {
            console.warn(`Failed to sign storage URL for ${document.storage_path}: ${signError.message}`);
          } else if (signedData?.signedUrl) {
            ocrFileUrl = signedData.signedUrl;
          }
        }

        if (ocrFileUrl) {
          // Invoke existing OCR edge function
          const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-document', {
            body: { documentId: document.id, fileUrl: ocrFileUrl }
          });
          
          if (ocrError) throw new Error(`OCR function failed: ${ocrError.message}`);
          
          await supabase
            .from('documents')
            .update({ 
              ocr_text: ocrData?.text?.slice(0, 100000) || null,
              summary: ocrData?.summary || null,
              key_facts: ocrData?.keyFacts || null,
              favorable_findings: ocrData?.favorableFindings || null,
              adverse_findings: ocrData?.adverseFindings || null,
              action_items: ocrData?.actionItems || null,
              status: 'analyzed',
              ai_analyzed: true
            })
            .eq('id', document.id);
        } else {
           await supabase.from('documents').update({ status: 'analyzed' }).eq('id', document.id);
        }

        // Queue next step: entity extraction
        await supabase
          .from('pipeline_jobs')
          .insert({
            case_id: job.case_id,
            document_id: document.id,
            job_type: 'entity_extraction',
            status: 'pending'
          });
          
      } else if (job.job_type === 'entity_extraction') {
        if (!deepseekKey && !groqKey) throw new Error("No entity-extraction provider configured (DEEPSEEK_API_KEY / GROQ_API_KEY missing)");
        
        if (document.ocr_text) {
          const systemPrompt = "You are a legal data extractor. Read the provided document text and extract lists of people, organizations, and key dates mentioned. Return valid JSON: { \"people\": [\"name1\"], \"orgs\": [\"org1\"], \"dates\": [\"date1\"] }.";
          const entities = await extractEntities(deepseekKey, groqKey, systemPrompt, document.ocr_text.slice(0, 20000));
          
          await supabase
            .from('documents')
            .update({ 
              entities: entities
            })
            .eq('id', document.id);
        }
        
        // Queue next step: chronology
        await supabase
          .from('pipeline_jobs')
          .insert({
            case_id: job.case_id,
            document_id: document.id,
            job_type: 'chronology',
            status: 'pending'
          });
          
      } else if (job.job_type === 'chronology') {
         // DeepSeek call to organize events for the case timeline based on this document.
         // In a full implementation, we would insert rows into a `case_events` table here.
         // For now, we will mark the document as fully processed.
      }

      // 3. Mark job as completed
      await supabase
        .from('pipeline_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', jobId);

      return new Response(JSON.stringify({ success: true, jobId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (processError) {
      // Handle processing error
      await supabase
        .from('pipeline_jobs')
        .update({ 
          status: 'failed', 
          error_log: processError instanceof Error ? processError.message : String(processError),
          attempts: job.attempts + 1
        })
        .eq('id', jobId);
        
      throw processError;
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

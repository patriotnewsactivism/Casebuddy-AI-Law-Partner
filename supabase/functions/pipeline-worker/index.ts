import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
});

const env = (name: string): string => (Deno.env.get(name) ?? '').trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_BUCKETS = ['case-documents', 'discovery-files'] as const;

async function callDeepSeek(apiKey: string, systemPrompt: string, userPrompt: string) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    console.error('[pipeline-worker] DeepSeek request failed', { status: response.status });
    throw new Error('DeepSeek provider failed');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek returned no content');
  return JSON.parse(content);
}

async function callGroq(apiKey: string, systemPrompt: string, userPrompt: string) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    console.error('[pipeline-worker] Groq request failed', { status: response.status });
    throw new Error('Groq provider failed');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no content');
  return JSON.parse(content);
}

async function extractEntities(
  deepseekKey: string,
  groqKey: string,
  systemPrompt: string,
  userPrompt: string,
) {
  if (deepseekKey) {
    try {
      return await callDeepSeek(deepseekKey, systemPrompt, userPrompt);
    } catch {
      console.warn('[pipeline-worker] primary entity provider failed; trying fallback');
    }
  }
  if (groqKey) return callGroq(groqKey, systemPrompt, userPrompt);
  throw new Error('No entity extraction provider available');
}

async function resolvePrivateFileUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
  existingUrl: string | null | undefined,
): Promise<string> {
  if (storagePath) {
    for (const bucket of STORAGE_BUCKETS) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 600);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    throw new Error('Document storage object could not be signed');
  }

  const candidate = String(existingUrl || '').trim();
  if (!candidate) throw new Error('Document has no resolvable file location');

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Document file location is invalid');
  }
  if (parsed.protocol !== 'https:') throw new Error('Document file location must use HTTPS');

  // Never allow a legacy Supabase public-object URL to bypass private storage.
  if (parsed.pathname.includes('/storage/v1/object/public/')) {
    throw new Error('Public storage URLs are not accepted by the pipeline');
  }

  return candidate;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = env('SUPABASE_URL');
  const supabaseKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const workerSecret = env('PIPELINE_WORKER_SECRET');
  if (!supabaseUrl || !supabaseKey || !workerSecret) {
    console.error('[pipeline-worker] required server configuration missing');
    return json({ error: 'Pipeline service unavailable' }, 503);
  }

  const callerSecret = (req.headers.get('x-pipeline-secret') ?? '').trim();
  if (!callerSecret || callerSecret !== workerSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let jobId = '';
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json() as { jobId?: unknown };
    jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
    if (!UUID_RE.test(jobId)) return json({ error: 'Invalid job identifier' }, 400);

    const deepseekKey = env('DEEPSEEK_API_KEY');
    const groqKey = env('GROQ_API_KEY');

    // Atomically claim only an existing pending job. Callers cannot choose a
    // document or case independently of the server-side job record.
    const { data: job, error: jobError } = await supabase
      .from('pipeline_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select('*, documents(*)')
      .single();

    if (jobError || !job) return json({ error: 'Job unavailable' }, 409);

    const document = job.documents;
    if (!document || document.id !== job.document_id) {
      throw new Error('Pipeline job document association is invalid');
    }

    try {
      if (job.job_type === 'ocr') {
        const ocrFileUrl = await resolvePrivateFileUrl(
          supabase,
          document.storage_path,
          document.file_url,
        );

        const { data: ocrData, error: ocrError } = await supabase.functions.invoke('ocr-document', {
          body: { documentId: document.id, fileUrl: ocrFileUrl },
        });
        if (ocrError) throw new Error('OCR function failed');

        const { error: updateError } = await supabase
          .from('documents')
          .update({
            ocr_text: ocrData?.text?.slice(0, 100000) || null,
            summary: ocrData?.summary || null,
            key_facts: ocrData?.keyFacts || null,
            favorable_findings: ocrData?.favorableFindings || null,
            adverse_findings: ocrData?.adverseFindings || null,
            action_items: ocrData?.actionItems || null,
            status: 'analyzed',
            ai_analyzed: true,
          })
          .eq('id', document.id);
        if (updateError) throw new Error('Could not persist OCR results');

        const { error: queueError } = await supabase.from('pipeline_jobs').insert({
          case_id: job.case_id,
          document_id: document.id,
          job_type: 'entity_extraction',
          status: 'pending',
        });
        if (queueError) throw new Error('Could not queue entity extraction');
      } else if (job.job_type === 'entity_extraction') {
        if (!deepseekKey && !groqKey) throw new Error('No entity extraction provider configured');

        if (document.ocr_text) {
          const systemPrompt = 'You are a legal data extractor. Read the provided document text and extract lists of people, organizations, and key dates mentioned. Return valid JSON: { "people": ["name1"], "orgs": ["org1"], "dates": ["date1"] }.';
          const entities = await extractEntities(
            deepseekKey,
            groqKey,
            systemPrompt,
            document.ocr_text.slice(0, 20000),
          );

          const { error: entityUpdateError } = await supabase
            .from('documents')
            .update({ entities })
            .eq('id', document.id);
          if (entityUpdateError) throw new Error('Could not persist extracted entities');
        }

        const { error: queueError } = await supabase.from('pipeline_jobs').insert({
          case_id: job.case_id,
          document_id: document.id,
          job_type: 'chronology',
          status: 'pending',
        });
        if (queueError) throw new Error('Could not queue chronology step');
      } else if (job.job_type === 'chronology') {
        // Chronology work is intentionally bounded here until its dedicated
        // implementation is reviewed. The job can still complete safely.
      } else {
        throw new Error('Unsupported pipeline job type');
      }

      const { error: completeError } = await supabase
        .from('pipeline_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', jobId);
      if (completeError) throw new Error('Could not mark pipeline job complete');

      return json({ success: true, jobId });
    } catch (processError) {
      const safeMessage = processError instanceof Error
        ? processError.message.slice(0, 500)
        : 'Unknown pipeline processing error';
      const attempts = Number(job.attempts || 0) + 1;
      await supabase
        .from('pipeline_jobs')
        .update({ status: 'failed', error_log: safeMessage, attempts })
        .eq('id', jobId);
      throw processError;
    }
  } catch (error) {
    console.error('[pipeline-worker] request failed', {
      jobId: jobId || undefined,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json({ error: 'Pipeline worker failed' }, 500);
  }
});

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch pending jobs up to a concurrency limit (e.g., 10)
    // We order by created_at to process oldest jobs first
    const { data: jobs, error: fetchError } = await supabase
      .from('pipeline_jobs')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) throw fetchError;

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "No pending jobs" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Invoke pipeline-worker asynchronously for each job
    const workerUrl = `${supabaseUrl}/functions/v1/pipeline-worker`;
    
    // We don't await these requests so they run in parallel and the orchestrator finishes quickly
    jobs.forEach((job) => {
      fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}` // use service role to invoke
        },
        body: JSON.stringify({ jobId: job.id })
      }).catch(err => console.error(`Failed to invoke worker for job ${job.id}`, err));
    });

    return new Response(JSON.stringify({ message: `Invoked worker for ${jobs.length} jobs` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

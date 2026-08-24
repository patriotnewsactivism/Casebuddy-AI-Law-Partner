import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const WORKER_DISPATCH_TIMEOUT_MS = 60_000;

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
});

const configuredSecret = (name: string): string => (Deno.env.get(name) ?? '').trim();

async function loadInternalSecret(supabase: SupabaseClient, name: 'pipeline_orchestrator_secret' | 'pipeline_worker_secret') {
  const { data, error } = await supabase.rpc('get_pipeline_internal_secret', { p_name: name });
  const secret = typeof data === 'string' ? data.trim() : '';
  if (error || secret.length < 32) throw new Error('Pipeline internal authentication unavailable');
  return secret;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = configuredSecret('SUPABASE_URL');
  const supabaseKey = configuredSecret('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    console.error('[pipeline-orchestrator] required server configuration missing');
    return json({ error: 'Pipeline service unavailable' }, 503);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const orchestratorSecret = await loadInternalSecret(supabase, 'pipeline_orchestrator_secret');
    const callerSecret = (req.headers.get('x-pipeline-secret') ?? '').trim();
    if (!callerSecret || callerSecret !== orchestratorSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const workerSecret = await loadInternalSecret(supabase, 'pipeline_worker_secret');

    const { data: jobs, error: fetchError } = await supabase
      .from('pipeline_jobs')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) throw new Error('Could not load pending jobs');
    if (!jobs?.length) return json({ message: 'No pending jobs', invoked: 0 });

    const workerUrl = `${supabaseUrl}/functions/v1/pipeline-worker`;
    const results = await Promise.allSettled(jobs.map(async (job) => {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pipeline-secret': workerSecret,
        },
        body: JSON.stringify({ jobId: job.id }),
        signal: AbortSignal.timeout(WORKER_DISPATCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`worker returned ${response.status}`);
      return job.id;
    }));

    const invoked = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - invoked;
    if (failed) console.error('[pipeline-orchestrator] worker dispatch failures', { failed });

    return json({ message: 'Pipeline dispatch complete', invoked, failed }, failed ? 207 : 200);
  } catch (error) {
    console.error('[pipeline-orchestrator] request failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return json({ error: 'Pipeline orchestration failed' }, 500);
  }
});
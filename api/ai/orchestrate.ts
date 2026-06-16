/**
 * Vercel Edge Function — Server-side Firm Command orchestration.
 *
 * Returns 200 immediately, then runs the full agent pipeline
 * (Maya → parallel team → Sierra) in the background via waitUntil.
 * All results are persisted in Supabase; the client watches via Realtime.
 *
 * POST /api/ai/orchestrate
 * Headers: { Authorization: Bearer <supabase_jwt> }
 * Body: { runId, caseContext, specialist? }
 */

import { waitUntil } from '@vercel/functions';

export const config = { runtime: 'edge' };

/* ── helpers ────────────────────────────────────────────────────────────────── */

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/* ── Gemini ─────────────────────────────────────────────────────────────────── */

const gemini = async (apiKey: string, prompt: string): Promise<string> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6 },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Gemini ${resp.status}`);
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
};

/* ── Supabase REST ──────────────────────────────────────────────────────────── */

const sbPatch = async (
  supabaseUrl: string,
  anonKey: string,
  jwt: string,
  path: string,
  body: Record<string, unknown>,
) => {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Supabase PATCH /${path}: ${resp.status} ${txt}`);
  }
};

/* ── Prompt templates ───────────────────────────────────────────────────────── */

const FMT =
  'Format as tight, scannable markdown: a one-line takeaway, then short **bold** sub-headers with 2-4 bullet points each. No preamble, no sign-off, under 220 words. Be concrete and practical, not generic.';

const P = {
  maya: (ctx: string) =>
    `You are Maya, the firm's intake specialist. Read this new case and produce an intake summary the rest of the firm will work from.\nCover: the core facts, the parties, the legal issues/claims you spot, what's strong, and what critical information is still missing.\n${FMT}\n\nCASE:\n${ctx}`,

  lex: (ctx: string, maya: string) =>
    `You are Lex, the firm's legal research lead. Based on the case and Maya's summary, give a research memo: the controlling law and doctrines, the elements that must be proven, and the kinds of leading cases/precedent that govern. Name doctrines specifically; flag the jurisdiction if known.\n${FMT}\n\nCASE:\n${ctx}\n\nMAYA'S SUMMARY:\n${maya}`,

  sol: (ctx: string, maya: string) =>
    `You are Sol, the firm's deadlines and statute-of-limitations tracker. Identify the applicable limitations period(s) for these claims, estimate the filing deadline window, and list any other looming dates. If the SOL may have run, say so loudly. Note assumptions where dates are unknown.\n${FMT}\n\nCASE:\n${ctx}\n\nMAYA'S SUMMARY:\n${maya}`,

  doc: (ctx: string, maya: string) =>
    `You are Doc, the firm's document lab director. Decide the single most useful first document for this case right now (e.g. demand letter, engagement memo, complaint outline, or preservation letter) and draft a strong opening of it — enough to show structure and the key arguments. Start by naming the document type in the takeaway line.\n${FMT}\n\nCASE:\n${ctx}\n\nMAYA'S SUMMARY:\n${maya}`,

  jules: (ctx: string, maya: string) =>
    `You are Jules, the firm's jury psychologist. Give a read on how a jury/venue will hear this case: the sympathetic and unsympathetic angles, likely juror biases to manage, and the one narrative frame that wins. If it's unlikely to ever see a jury, say so and pivot to negotiation leverage.\n${FMT}\n\nCASE:\n${ctx}\n\nMAYA'S SUMMARY:\n${maya}`,

  rex: (ctx: string, maya: string) =>
    `You are Rex, the firm's trial coach. Lay out an early strategy: the case theme in one sentence, the key witnesses/evidence to lock down, the biggest risks to neutralize, and the first three moves you'd make. Be direct and tactical.\n${FMT}\n\nCASE:\n${ctx}\n\nMAYA'S SUMMARY:\n${maya}`,

  specialist: (
    ctx: string,
    maya: string,
    spec: { name: string; title: string; practiceArea: string; systemInstruction: string },
  ) =>
    `You are ${spec.name}, ${spec.title}. ${(spec.systemInstruction || '').split('\n')[0]}\nBased on the case and Maya's summary, give YOUR department's action plan: the specific theories/claims to pursue in ${spec.practiceArea}, the evidence to gather, and the next concrete steps. Speak in your voice.\n${FMT}\n\nCASE:\n${ctx}\n\nMAYA'S SUMMARY:\n${maya}`,

  sierra: (ctx: string, teamWork: string) =>
    `You are Sierra, the firm's client-relations lead. Using the team's work below, write a warm, plain-English update letter to the client: what the firm has assessed, what it means for them, and the clear next steps. Reassuring and professional, no legalese, no false promises.\n${FMT}\n\nCASE:\n${ctx}\n\nTEAM WORK:\n${teamWork}`,
};

/* ── Handler ────────────────────────────────────────────────────────────────── */

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── env ──
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';
  if (!supabaseUrl || !anonKey || !geminiKey)
    return json({ error: 'Server not configured.' }, 503);

  // ── auth ──
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer '))
    return json({ error: 'Unauthorized.' }, 401);
  const jwt = auth.slice(7);

  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
    });
    if (!userResp.ok)
      return json({ error: 'Invalid or expired session.' }, 401);
  } catch {
    return json({ error: 'Auth verification failed.' }, 500);
  }

  // ── body ──
  let body: {
    runId: string;
    caseContext: string;
    specialist?: {
      name: string;
      title: string;
      practiceArea: string;
      systemInstruction: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }
  const { runId, caseContext, specialist } = body;
  if (!runId || !caseContext)
    return json({ error: 'Missing runId or caseContext.' }, 400);

  // ── Run the pipeline in the background ──
  // Return 200 immediately; the client watches Supabase Realtime for updates.
  const pipeline = async () => {
    const patch = (path: string, data: Record<string, unknown>) =>
      sbPatch(supabaseUrl, anonKey, jwt, path, data);

    const updateWp = (taskId: string, data: Record<string, unknown>) =>
      patch(`work_products?run_id=eq.${runId}&task_id=eq.${taskId}`, data);

    const ERR_MSG = 'This step hit an error. You can re-deploy the firm to retry.';

    const runAgent = async (taskId: string, prompt: string): Promise<string> => {
      await updateWp(taskId, { status: 'working', started_at: Date.now() });
      try {
        const content = await gemini(geminiKey, prompt);
        await updateWp(taskId, {
          status: 'done',
          content,
          completed_at: Date.now(),
        });
        return content;
      } catch {
        await updateWp(taskId, {
          status: 'error',
          content: ERR_MSG,
          completed_at: Date.now(),
        }).catch(() => {});
        return ERR_MSG;
      }
    };

    try {
      // Mark run as running
      await patch(`firm_runs?id=eq.${runId}`, { status: 'running' });

      // Phase 1 — Maya
      const maya = await runAgent('maya-summary', P.maya(caseContext));

      // Phase 2 — parallel agents
      const specPrompt = specialist
        ? P.specialist(caseContext, maya, specialist)
        : P.lex(caseContext, maya);

      const parallelIds = [
        'lex-research',
        'sol-deadlines',
        'doc-draft',
        'jules-jury',
        'rex-strategy',
      ] as const;
      const parallelPrompts = [
        P.lex(caseContext, maya),
        P.sol(caseContext, maya),
        P.doc(caseContext, maya),
        P.jules(caseContext, maya),
        P.rex(caseContext, maya),
      ];

      const results = await Promise.allSettled([
        ...parallelIds.map((id, i) => runAgent(id, parallelPrompts[i])),
        runAgent('specialist-plan', specPrompt),
      ]);

      // Phase 3 — Sierra synthesizes
      const names = ['Lex', 'Sol', 'Doc', 'Jules', 'Rex', specialist?.name || 'Specialist'];
      const titles = [
        'Legal Research Memo',
        'Deadlines & SOL',
        'First Draft on the Page',
        'Jury & Venue Read',
        'Trial Strategy Outline',
        `${specialist?.practiceArea || 'Specialist'} Action Plan`,
      ];
      const teamWork = [
        `### Maya — Case Summary & Issue Spotting\n${maya}`,
        ...results.map((r, i) => {
          const content = r.status === 'fulfilled' ? r.value : ERR_MSG;
          return `### ${names[i]} — ${titles[i]}\n${content}`;
        }),
      ].join('\n\n');

      await runAgent('sierra-update', P.sierra(caseContext, teamWork));

      // Done
      await patch(`firm_runs?id=eq.${runId}`, {
        status: 'done',
        completed_at: new Date().toISOString(),
      });
    } catch {
      try {
        await patch(`firm_runs?id=eq.${runId}`, { status: 'error' });
      } catch {
        /* best effort */
      }
    }
  };

  // Fire-and-forget: waitUntil keeps the function alive after response is sent
  waitUntil(pipeline());

  return json({ ok: true, runId });
}

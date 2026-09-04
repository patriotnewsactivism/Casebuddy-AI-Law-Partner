/**
 * Railway/Node production server for CaseBuddy AI (Casebuddy-AI-Law-Partner).
 *
 * This repo was built for Vercel: a Vite SPA + per-file serverless functions
 * under api/ (mixed Node-style (req,res) handlers and Fetch-style
 * (Request)=>Response edge handlers), plus vercel.json cron entries.
 *
 * This server reproduces that exact behavior on a single long-running Node
 * process for Railway:
 *   - serves the built Vite static assets + SPA fallback
 *   - mounts every api/*.ts handler at the same URL Vercel would have used
 *   - runs the same 5 cron jobs in-process on the same schedule, calling the
 *     cron handler internally with the same CRON_SECRET bearer-token auth
 *     it already enforces (nothing new/looser than prod on Vercel)
 *
 * Handlers themselves are untouched — this file only adapts the transport.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type Request as ExRequest, type Response as ExResponse, type NextFunction } from 'express';
import cron from 'node-cron';

// Node-style (req, res) handlers — these already expect an Express-shaped res.
import adminHandler from '../api/admin';
import twilioVoiceHandler from '../api/twilio-voice';
import extractAudioHandler from '../api/media/extract-audio';
import webhooksIndexHandler from '../api/webhooks/index';

// Fetch-style (Request) => Promise<Response> edge handlers.
import twilioActionsHandler from '../api/twilio-actions';
import aiChatHandler from '../api/ai/chat';
import aiGeminiHandler from '../api/ai/gemini';
import aiOcrHandler from '../api/ai/ocr';
import aiOrchestrateHandler from '../api/ai/orchestrate';
import aiVoiceKeysPublicHandler from '../api/ai/voice-keys-public';
import aiVoiceKeysHandler from '../api/ai/voice-keys';
import aiChatCompletionsHandler from '../api/ai/v1/chat/completions';
import cronHandler from '../api/cron/index';
import emailSendHandler from '../api/email/send';
import stripeCreateCheckoutHandler from '../api/stripe/create-checkout';
import webhooksUserSignupHandler from '../api/webhooks/user-signup';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

const app = express();
app.set('trust proxy', 1);

// Capture the raw body for every request without consuming/parsing it, so
// both handler styles below can each interpret it their own way (JSON,
// urlencoded, or raw bytes for a Fetch Request body / signature checks).
app.use((req: ExRequest, _res: ExResponse, next: NextFunction) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    (req as any).rawBody = Buffer.concat(chunks);
    next();
  });
  req.on('error', () => next());
});

function parseBodyForContentType(raw: Buffer, contentType: string | undefined): any {
  if (!raw || raw.length === 0) return undefined;
  const ct = (contentType || '').toLowerCase();
  try {
    if (ct.includes('application/json')) return JSON.parse(raw.toString('utf8'));
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw.toString('utf8'));
      const out: Record<string, string> = {};
      for (const [k, v] of params.entries()) out[k] = v;
      return out;
    }
  } catch {
    // fall through — leave body unparsed rather than crash the request
  }
  return raw.toString('utf8');
}

/** Mount a classic Vercel Node handler: (req: VercelRequest, res: VercelResponse) */
function mountNode(routePath: string, handler: (req: any, res: any) => any) {
  app.all(routePath, (req: ExRequest, res: ExResponse) => {
    (req as any).body = parseBodyForContentType((req as any).rawBody, req.headers['content-type']);
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error(`[${routePath}] handler error:`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    });
  });
}

/** Mount a Vercel Edge-style handler: (req: Request) => Promise<Response> */
function mountEdge(routePath: string, handler: (req: Request) => Promise<Response>) {
  app.all(routePath, async (req: ExRequest, res: ExResponse) => {
    try {
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const host = req.headers.host || 'localhost';
      const url = `${protocol}://${host}${req.originalUrl}`;

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v == null) continue;
        headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
      }

      const raw: Buffer = (req as any).rawBody;
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && raw && raw.length > 0;
      const webRequest = new Request(url, {
        method: req.method,
        headers,
        body: hasBody ? raw : undefined,
      });

      const webResponse = await handler(webRequest);
      res.status(webResponse.status);
      webResponse.headers.forEach((value, key) => {
        // Node sets its own transfer-encoding/content-length; let Express handle those.
        if (key.toLowerCase() === 'content-encoding') return;
        res.setHeader(key, value);
      });
      const buf = Buffer.from(await webResponse.arrayBuffer());
      res.end(buf);
    } catch (err) {
      console.error(`[${routePath}] edge handler error:`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// ── Node-style routes ────────────────────────────────────────────────────────
mountNode('/api/admin', adminHandler as any);
mountNode('/api/twilio-voice', twilioVoiceHandler as any);
mountNode('/api/media/extract-audio', extractAudioHandler as any);
mountNode('/api/webhooks/index', webhooksIndexHandler as any);
mountNode('/api/webhooks', webhooksIndexHandler as any); // vercel.json rewrite alias

// ── Edge-style routes ────────────────────────────────────────────────────────
mountEdge('/api/twilio-actions', twilioActionsHandler as any);
mountEdge('/api/ai/chat', aiChatHandler as any);
mountEdge('/api/ai/gemini', aiGeminiHandler as any);
mountEdge('/api/ai/ocr', aiOcrHandler as any);
mountEdge('/api/ai/orchestrate', aiOrchestrateHandler as any);
mountEdge('/api/ai/voice-keys-public', aiVoiceKeysPublicHandler as any);
mountEdge('/api/ai/voice-keys', aiVoiceKeysHandler as any);
mountEdge('/api/ai/v1/chat/completions', aiChatCompletionsHandler as any);
mountEdge('/api/cron/index', cronHandler as any);
mountEdge('/api/cron', cronHandler as any); // vercel.json rewrite alias
mountEdge('/api/email/send', emailSendHandler as any);
mountEdge('/api/stripe/create-checkout', stripeCreateCheckoutHandler as any);
mountEdge('/api/webhooks/user-signup', webhooksUserSignupHandler as any);

// ── Health check (Railway) ──────────────────────────────────────────────────
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', ts: new Date().toISOString() }));

// ── Static SPA ───────────────────────────────────────────────────────────────
app.use(express.static(DIST_DIR, { index: false }));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// ── In-process cron (replicates vercel.json's `crons` block exactly) ────────
async function runCronAction(action: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(`[cron] skipping "${action}" — CRON_SECRET not set`);
    return;
  }
  try {
    const req = new Request(`http://internal/api/cron/index?action=${encodeURIComponent(action)}`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    const res = await (cronHandler as any)(req);
    const body = await res.text();
    console.log(`[cron] ${action} -> ${res.status}: ${body.slice(0, 300)}`);
  } catch (err) {
    console.error(`[cron] ${action} failed:`, err);
  }
}

// Times below match vercel.json's crons verbatim (server runs in UTC on Railway,
// same as Vercel cron, so no offset conversion needed).
cron.schedule('0 12 * * *', () => runCronAction('send-pending-emails'));
cron.schedule('0 14 * * *', () => runCronAction('daily-briefing'));
cron.schedule('0 8 * * *', () => runCronAction('case-status-monitor'));
cron.schedule('0 9 * * *', () => runCronAction('intake-processor'));
cron.schedule('0 15 * * 5', () => runCronAction('weekly-client-updates'));

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () => {
  console.log(`CaseBuddy server listening on :${PORT}`);
});

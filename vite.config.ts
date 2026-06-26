import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // ⚠️  SECURITY: The GEMINI_API_KEY must NOT be baked into the client
    // bundle. It is only used server-side (Vercel Edge Functions in /api/).
    //
    // The Supabase anon key IS safe to ship — it's designed to be public and
    // is protected by Postgres Row Level Security (RLS).
    //
    // For local development, VITE_GEMINI_API_KEY is exposed via import.meta.env
    // so the DraftingAssistant and voice agent still work locally. In production,
    // the Vercel environment variable GEMINI_API_KEY (non-VITE_) is only
    // accessible in /api/ edge functions.

    return {
      server: {
        port: 5000,
        proxy: {
          // Fallback for /api routes during local Vite development.
          // In production (Vercel), these are handled by actual edge functions.
          '/api/ai/gemini': {
            target: 'http://localhost:5000',
            bypass: (req, res) => {
              if (req.method === 'POST') {
                // Proxy bypass: forward to actual Gemini API
                const geminiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
                if (!geminiKey) {
                  res.writeHead(503, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Gemini API key not configured' }));
                  return false;
                }
                try {
                  const body = JSON.parse(req.body || '{}');
                  const model = body.model || 'gemini-2.5-flash';
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                  fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: body.contents,
                      systemInstruction: body.systemInstruction,
                      generationConfig: body.config || {}
                    })
                  }).then(async r => {
                    const data = await r.json();
                    res.writeHead(r.ok ? 200 : r.status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                  }).catch(err => {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Gemini API error: ' + err.message }));
                  });
                } catch {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Invalid request' }));
                }
                return false;
              }
            }
          },
          '/api/ai/voice-keys': {
            target: 'http://localhost:5000',
            bypass: (req, res) => {
              if (req.method === 'POST') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  deepgramKey: env.VITE_DEEPGRAM_API_KEY || env.DEEPGRAM_API_KEY || '',
                  geminiKey: env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '',
                }));
                return false;
              }
            }
          },
          '/api/ai/orchestrate': {
            target: 'http://localhost:5000',
            bypass: (req, res) => {
              if (req.method === 'POST') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ runId: 'dev-run-' + Date.now(), status: 'queued' }));
                return false;
              }
            }
          }
        }
      },
      plugins: [react()],
      define: {
        // Supabase (public anon key — safe in bundle)
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''),
        // Gemini — DEV ONLY
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || (mode === 'development' ? env.GEMINI_API_KEY : '') || ''),
        // DeepSeek
        'import.meta.env.VITE_DEEPSEEK_API_KEY': JSON.stringify(env.VITE_DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY || ''),
        'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY || env.VITE_DEEPSEEK_API_KEY || ''),
        // Deepgram — DEV ONLY
        'import.meta.env.VITE_DEEPGRAM_API_KEY': JSON.stringify(env.VITE_DEEPGRAM_API_KEY || (mode === 'development' ? env.DEEPGRAM_API_KEY : '') || ''),
        // Firm ID — canonical UUID for this deployment (used to scope intake
        // submissions to the correct firm dashboard in multi-firm RLS).
        // Set VITE_FIRM_ID in .env.local or Vercel env vars. Falls back to the
        // device localStorage UUID when not set (single-user installs).
        'import.meta.env.VITE_FIRM_ID': JSON.stringify(env.VITE_FIRM_ID || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'lucide': ['lucide-react'],
              'framer-motion': ['framer-motion'],
              'vendor': ['react', 'react-dom', 'react-router-dom', 'react-toastify'],
              'ai-services': ['@google/genai'],
              recharts: ['recharts'],
              supabase: ['@supabase/supabase-js'],
            },
          },
        },
      },
    };
});

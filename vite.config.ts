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
      },
      plugins: [
        react(),
        {
          name: 'api-middleware',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.method === 'POST' && req.url === '/api/ai/gemini') {
                const geminiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
                if (!geminiKey) {
                  res.writeHead(503, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Gemini API key not configured' }));
                  return;
                }
                
                let bodyText = '';
                req.on('data', (chunk) => {
                  bodyText += chunk;
                });
                
                req.on('end', async () => {
                  try {
                    const body = JSON.parse(bodyText || '{}');
                    const model = body.model || 'gemini-2.5-flash';
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                    
                    const geminiBody: any = {
                      contents: body.contents,
                    };
                    if (body.systemInstruction) {
                      geminiBody.systemInstruction = body.systemInstruction;
                    }
                    if (body.config) {
                      geminiBody.generationConfig = body.config;
                    }

                    const r = await fetch(geminiUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(geminiBody),
                    });
                    
                    const data = await r.json();
                    res.writeHead(r.ok ? 200 : r.status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                  } catch (err: any) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Gemini API error: ' + err.message }));
                  }
                });
                
                req.on('error', (err) => {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Request stream error: ' + err.message }));
                });
                return;
              }
              
              if (req.method === 'POST' && req.url === '/api/ai/voice-keys') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  deepgramKey: env.VITE_DEEPGRAM_API_KEY || env.DEEPGRAM_API_KEY || '',
                  geminiKey: env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '',
                }));
                return;
              }
              
              if (req.method === 'POST' && req.url === '/api/ai/orchestrate') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ runId: 'dev-run-' + Date.now(), status: 'queued' }));
                return;
              }
              
              next();
            });
          }
        }
      ],
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

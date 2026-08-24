import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Provider credentials are server-only in every environment. The Vite dev
  // server may use them inside middleware, but it must never define them into
  // the browser bundle or return permanent credentials to the browser.
  const grantDeepgramToken = async () => {
    const apiKey = (env.DEEPGRAM_API_KEY || '').trim();
    if (!apiKey) throw new Error('Voice service not configured');

    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) throw new Error('Voice credential service unavailable');
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error('Voice credential service returned no token');
    return {
      deepgramKey: payload.access_token,
      tokenType: 'bearer' as const,
      expiresIn: Number(payload.expires_in) || 60,
    };
  };

  return {
    // Critical boundary: Vite must NOT automatically expose every VITE_* value.
    // Public browser configuration is allow-listed explicitly in `define` below.
    envPrefix: ['PUBLIC_'],
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
              const geminiKey = (env.GEMINI_API_KEY || '').trim();
              if (!geminiKey) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Gemini API key not configured' }));
                return;
              }

              let bodyText = '';
              req.on('data', chunk => { bodyText += chunk; });
              req.on('end', async () => {
                try {
                  const body = JSON.parse(bodyText || '{}');
                  const model = body.model || 'gemini-2.5-flash';
                  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                  const geminiBody: any = { contents: body.contents };
                  if (body.systemInstruction) geminiBody.systemInstruction = body.systemInstruction;
                  if (body.config) geminiBody.generationConfig = body.config;

                  const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiBody),
                    signal: AbortSignal.timeout(30_000),
                  });
                  const data = await response.json();
                  res.writeHead(response.ok ? 200 : response.status, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(data));
                } catch {
                  res.writeHead(502, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Gemini API unavailable' }));
                }
              });
              req.on('error', () => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Request stream error' }));
              });
              return;
            }

            if (
              req.method === 'POST' &&
              (req.url === '/api/ai/voice-keys' || req.url === '/api/ai/voice-keys-public')
            ) {
              grantDeepgramToken()
                .then(token => {
                  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                  res.end(JSON.stringify(token));
                })
                .catch(() => {
                  res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                  res.end(JSON.stringify({ error: 'Voice credential service unavailable' }));
                });
              return;
            }

            if (req.method === 'POST' && req.url === '/api/ai/orchestrate') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ runId: 'dev-run-' + Date.now(), status: 'queued' }));
              return;
            }

            next();
          });
        },
      },
    ],
    define: {
      // Explicit allow-list of public browser configuration.
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''),
      'import.meta.env.VITE_FIRM_ID': JSON.stringify(env.VITE_FIRM_ID || ''),
      'import.meta.env.VITE_AZURE_VISION_ENDPOINT': JSON.stringify(env.VITE_AZURE_VISION_ENDPOINT || env.AZURE_VISION_ENDPOINT || ''),
      'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_STRIPE_PUBLISHABLE_KEY || ''),

      // Legacy direct-provider references fail closed instead of inheriting Vercel env.
      'import.meta.env.VITE_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_GEMINI_KEY': JSON.stringify(''),
      'import.meta.env.VITE_GROQ_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_DEEPGRAM_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_DEEPGRAM_KEY': JSON.stringify(''),
      'import.meta.env.VITE_ELEVENLABS_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_DEEPSEEK_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_COHERE_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_MISTRAL_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_OPENROUTER_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_AZURE_VISION_KEY': JSON.stringify(''),
      'import.meta.env.VITE_COURTLISTENER_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_GITHUB_TOKEN': JSON.stringify(''),
      'process.env.API_KEY': JSON.stringify(''),
      'process.env.GEMINI_API_KEY': JSON.stringify(''),
      'process.env.GROQ_API_KEY': JSON.stringify(''),
      'process.env.DEEPGRAM_API_KEY': JSON.stringify(''),
      'process.env.ELEVENLABS_API_KEY': JSON.stringify(''),
      'process.env.OPENAI_API_KEY': JSON.stringify(''),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(''),
      'process.env.GITHUB_TOKEN': JSON.stringify(''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            lucide: ['lucide-react'],
            'framer-motion': ['framer-motion'],
            vendor: ['react', 'react-dom', 'react-router-dom', 'react-toastify'],
            'ai-services': ['@google/genai'],
            recharts: ['recharts'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});

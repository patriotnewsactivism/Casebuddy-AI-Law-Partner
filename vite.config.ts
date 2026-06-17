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
      plugins: [react()],
      define: {
<<<<<<< Updated upstream
        // Supabase (public anon key — safe in bundle)
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY),
        // Gemini — DEV ONLY. In production, remove VITE_GEMINI_API_KEY from env
        // and all Gemini calls should go through /api/ai/gemini proxy instead.
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || (mode === 'development' ? env.GEMINI_API_KEY : '')),
        // Deepgram — DEV ONLY. Same pattern as above.
        'import.meta.env.VITE_DEEPGRAM_API_KEY': JSON.stringify(env.VITE_DEEPGRAM_API_KEY || (mode === 'development' ? env.DEEPGRAM_API_KEY : '')),
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom', 'react-router-dom'],
              genai: ['@google/genai'],
              charts: ['recharts'],
              supabase: ['@supabase/supabase-js'],
              motion: ['framer-motion'],
            },
          },
        },
=======
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY),
        'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY),
>>>>>>> Stashed changes
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

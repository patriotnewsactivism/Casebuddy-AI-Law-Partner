import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5000,
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Supabase (anon key is public-safe — protected by row-level security).
        // Prefer VITE_-prefixed values, fall back to the unprefixed names in .env.local.
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY),
      },
      build: {
        rollupOptions: {
          output: {
            // Split heavy vendors into their own chunks so the initial load is
            // smaller and long-term caching is better.
            manualChunks: {
              react: ['react', 'react-dom', 'react-router-dom'],
              genai: ['@google/genai'],
              charts: ['recharts'],
              supabase: ['@supabase/supabase-js'],
              motion: ['framer-motion'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

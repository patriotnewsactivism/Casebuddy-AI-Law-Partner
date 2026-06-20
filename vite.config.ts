import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5000,
      },
      plugins: [tailwindcss(), react()],
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
            // Vendor chunks for deps genuinely needed on every page:
            //   react    — routing + rendering (always required)
            //   supabase — auth state initialised in App.tsx before any route
            //   genai    — CopilotSidebar (always-mounted shell) imports geminiService
            //   motion   — App.tsx itself uses AnimatePresence/motion for the sidebar
            //
            // recharts is intentionally omitted: it is only imported by Dashboard
            // (a lazy route), so Rollup's auto-chunking scopes it to that chunk
            // instead of preloading it on every page.
            manualChunks: {
              react: ['react', 'react-dom', 'react-router-dom'],
              genai: ['@google/genai'],
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

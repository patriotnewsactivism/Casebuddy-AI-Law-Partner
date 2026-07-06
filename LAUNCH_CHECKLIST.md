# CaseBuddy Launch Checklist

A concise pre-launch checklist. Check off each item before going to production.

---

## ✅ Build & Environment

- [ ] `npm run build` completes without errors or Tailwind node_modules warnings
- [ ] Bundle size is reasonable (check `dist/` — main JS chunk < 2MB)
- [ ] No API keys baked into the JS bundle (check `dist/assets/*.js` — grep for key patterns)
- [ ] `.env.local` is NOT tracked in git (`git ls-files .env.local` returns nothing)
- [ ] All required env vars are set in Vercel dashboard:
  - [ ] `GEMINI_API_KEY`
  - [ ] `DEEPGRAM_API_KEY`
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_URL` (for edge functions)
  - [ ] `SUPABASE_ANON_KEY` (for edge functions)

---

## ✅ Auth & Supabase

- [ ] Supabase project created and URL/anon key configured
- [ ] Email auth enabled in Supabase dashboard
- [ ] `intake_cases` table created (run `supabase_migration.sql`)
- [ ] `cases` table created (run `supabase_migration_cases.sql`)
- [ ] Row Level Security (RLS) enabled on user-scoped tables
- [ ] Auth redirect URL set to `https://casebuddy.live` in Supabase

---

## ✅ Domain & Deployment

- [ ] Custom domain `casebuddy.live` configured in Vercel
- [ ] HTTPS / SSL active
- [ ] Vercel SPA rewrite in place (`/((?!api/).*) → /index.html`)
- [ ] Cache-Control headers correct: HTML = no-cache, `/assets/*` = immutable
- [ ] Security headers active: HSTS, X-Frame-Options, X-Content-Type-Options

---

## ✅ Voice / AI Features

- [ ] Maya public intake page accessible at `/intake` without login
- [ ] `/api/ai/voice-keys-public` returns Deepgram + Gemini keys
- [ ] `/api/ai/voice-keys` returns keys for authenticated users
- [ ] Post-call intake processing (extractIntake + scoreIntake) works end-to-end
- [ ] Intake results appear in Intake Inbox (`/app/intake-inbox`)

---

## ✅ Legal & Compliance

- [ ] AI disclaimer present on all AI-powered pages
- [ ] Privacy Policy accessible at `/privacy`
- [ ] Terms of Service accessible at `/terms`
- [ ] "Not legal advice" language in agent system instructions
- [ ] No fabricated testimonials on landing page (remove or label as beta)

---

## ✅ Smoke Tests (Manual)

- [ ] Landing page loads with no console errors
- [ ] Sign up → email confirmation → login flow works
- [ ] Dashboard loads (empty state looks good)
- [ ] Create a case → appears in Case Files
- [ ] Talk to the Firm → Maya connects and responds
- [ ] Public intake (`/intake`) → Maya connects without login
- [ ] AI Lawyers → specialist chat works
- [ ] Transcriber → file upload + transcription works
- [ ] Settings → data export works
- [ ] Mobile layout → sidebar toggle, no overflow

---

## ✅ Post-Launch

- [ ] Vercel Analytics enabled
- [ ] Error monitoring in place (consider Sentry)
- [ ] Stripe configured (or "billing coming soon" banner shown)
- [ ] Support contact method in place (email / form)

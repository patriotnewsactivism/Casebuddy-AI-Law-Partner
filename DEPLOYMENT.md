# CaseBuddy AI — Deployment Guide

Deployed on **Vercel** (Hobby plan) with automatic deploys from GitHub `main`.

## Environment Variables Required

### AI Services
| Variable | Required | Notes |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ Yes | DeepSeek chat completions (all AI features) |
| `DEEPGRAM_API_KEY` | ✅ Yes | Voice STT + TTS |
| `GEMINI_API_KEY` | ✅ Yes | Deepgram Voice Agent "think" provider |
| `VITE_DEEPSEEK_API_KEY` | ✅ Yes | Client-side DeepSeek fallback |

### Supabase (Auth + Database)
| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ Yes | Project URL |
| `SUPABASE_ANON_KEY` | ✅ Yes | Public anon key (safe in bundle) |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ Crons only | Admin key for cron jobs |
| `VITE_SUPABASE_URL` | ✅ Yes | Exposed to client |
| `VITE_SUPABASE_ANON_KEY` | ✅ Yes | Exposed to client |

### Optional Integrations
| Variable | Notes |
|---|---|
| `SENDGRID_API_KEY` | Email notifications |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | SMS alerts |
| `TWILIO_FROM_NUMBER` | Twilio sender number |
| `FIRM_OWNER_EMAIL` | Briefing + alert destination |
| `FIRM_OWNER_PHONE` | SMS destination |
| `VITE_COURTLISTENER_API_KEY` | CourtListener case law search |
| `CRON_SECRET` | Protect cron endpoints |

## Architecture

```
React (Vite) → Vercel Edge Functions → DeepSeek API
                                     → Deepgram (Voice)
                                     → Gemini (Voice Agent brain)
                                     → Supabase (Auth + DB)
```

## Cron Jobs (Daily — Vercel Hobby compatible)
- `0 14 * * *` — Daily briefing (Sol + Maya)
- `0 15 * * 5` — Weekly client updates (Sierra)
- `0 8 * * *`  — Case status monitor (Rex + Sol)
- `0 9 * * *`  — Intake processor (Maya)

## Blank Screen Troubleshooting

If the app shows a blank screen:
1. Check Vercel function logs for build errors
2. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
3. The app falls back to local-only mode if Supabase is unconfigured
4. Auth loading timeout (5s) prevents infinite spinner

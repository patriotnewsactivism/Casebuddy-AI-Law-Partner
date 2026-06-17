<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CaseBuddy AI - Trial Prep Assistant

An AI-powered legal case management and trial preparation platform with secure, server-side API handling.

## Architecture Overview

CaseBuddy AI uses a modern, secure architecture with **Supabase** as the backend:

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **AI Integration**: Secure API proxying via Supabase Edge Functions

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   React App     │─────▶│  Supabase Edge   │─────▶│  External APIs  │
│   (Frontend)    │      │    Functions     │      │  (Gemini, etc.) │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                        │
        │                        │
        ▼                        ▼
┌─────────────────────────────────────────────────┐
│              Supabase Platform                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │  PostgreSQL │  │    Auth     │  │ Storage  │ │
│  │  Database   │  │   Service   │  │ Buckets  │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
└─────────────────────────────────────────────────┘
```

## Security Features

- **No exposed API keys**: All third-party API keys are stored server-side in Supabase secrets
- **Row Level Security (RLS)**: Database-level access control ensuring users can only access their own data
- **Authentication**: Built-in user authentication with Supabase Auth
- **Rate limiting**: Per-user rate limiting on all Edge Functions
- **Secure file storage**: User-isolated storage buckets

## Quick Start

**Prerequisites:**
- Node.js 18+
- Supabase account (free tier works)

### 1. Clone and Install

```bash
git clone <repository-url>
cd Casebuddy-AI-Trial-Prep
npm install
```

### 2. Set Up Supabase

See [SETUP.md](./SETUP.md) for detailed step-by-step instructions.

Quick setup:
1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the migration files in `supabase/migrations/`
3. Deploy Edge Functions from `supabase/functions/`
4. Configure secrets (API keys) in Supabase dashboard

### 3. Configure Environment

Create `.env.local`:
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5000`.

## Documentation

- **[SETUP.md](./SETUP.md)** - Detailed setup instructions
- **[SECURITY.md](./SECURITY.md)** - Security architecture and best practices
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture overview
- **[AGENTS.md](./AGENTS.md)** - Development guidelines for AI assistants

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 5000 |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build locally |

## Features

- **Case Management**: Create, organize, and track legal cases
- **Evidence Management**: Upload and analyze evidence with AI
- **Witness Lab**: AI-powered witness preparation simulations
- **Strategy Room**: AI-assisted case strategy analysis
- **Transcriber**: Audio transcription with AI analysis
- **Drafting Assistant**: AI-powered legal document drafting
- **Voice Features**: Text-to-speech and speech-to-text capabilities

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Build Tool**: Vite
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI**: Google Gemini, OpenAI GPT-4, ElevenLabs

## License

MIT

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# CaseBuddy AI Lawfirm

An AI-powered all in one agentic lawfirm with secure, server-side API handling.

## Architecture Overview

CaseBuddy AI Lawfirm uses a modern, secure architecture with **Convex** as the backend:

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Convex
- **AI Integration**
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

- **No exposed API keys**: All third-party API keys are stored server-side 
- **Row Level Security (RLS)**: Database-level access control ensuring users can only access their own data
- **Authentication**: Built-in user authentication 
- **Rate limiting**: Per-user rate limiting on all Edge Functions
- **Secure file storage**: User-isolated storage buckets

## Quick Start

**Prerequisites:**
- Node.js 18+

### 1. Clone and Install

```bash
git clone <repository-url>
cd Casebuddy-AI-Lawfirm
npm install
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
- **Backend**: Convex
- **AI**: Google Gemini, OpenAI GPT-4, Deepgram, ElevenLabs

## License

MIT

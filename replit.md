# CaseBuddy: AI-Powered Legal Trial Preparation

## Overview
CaseBuddy is an AI-powered legal trial preparation application built with React, TypeScript, and Vite. It provides lawyers with tools for case management, witness simulation, argument practice, strategy analysis, and legal document transcription using Google's Gemini AI.

## Live Domains
- **Main Application**: casebuddy.live
- **Transcription Service**: transcribe.casebuddy.live (external repository)

## Project Architecture

### Tech Stack
- **Frontend Framework**: React 19.2.0 with TypeScript
- **Build Tool**: Vite 6.2.0
- **UI Styling**: Tailwind CSS (CDN)
- **Routing**: React Router DOM
- **AI Integration**: Google Gemini AI (@google/genai)
- **Charts**: Recharts
- **Notifications**: React Toastify
- **Icons**: Lucide React

### Directory Structure
```
.
├── components/          # React components for each feature
│   ├── Dashboard.tsx
│   ├── CaseManager.tsx
│   ├── WitnessLab.tsx
│   ├── StrategyRoom.tsx
│   ├── ArgumentPractice.tsx
│   ├── Transcriber.tsx
│   └── ...
├── services/           # API and external service integrations
│   └── geminiService.ts
├── utils/              # Utility functions
│   ├── errorHandler.ts
│   ├── fileValidation.ts
│   └── storage.ts
├── App.tsx             # Main app component with routing
├── index.tsx           # App entry point
├── types.ts            # TypeScript type definitions
├── constants.ts        # App constants
├── vite.config.ts      # Vite configuration
└── index.html          # HTML template
```

## Development Setup

### Prerequisites
- Node.js (v18 or higher)
- Google Gemini API key

### Environment Variables
- `GEMINI_API_KEY`: Google Gemini API key (stored in Replit secrets)

### Running Locally
1. Dependencies are automatically installed via npm
2. The app runs on port 5000 (configured for Replit webview)
3. Development server: `npm run dev`
4. Build for production: `npm run build`

## Replit Configuration

### Workflow
- **Name**: Start application
- **Command**: `npm run dev`
- **Port**: 5000
- **Output Type**: Webview (for frontend preview)

### Deployment
- **Type**: Static site
- **Build Command**: `npm run build`
- **Public Directory**: `dist`

### Important Replit Settings
The Vite config is set up to work with Replit's proxy:
- Host: `0.0.0.0` (required for Replit)
- Port: `5000` (required for webview output)
- `allowedHosts: true` (required for Replit iframe proxy)

## Features

### Core Modules
1. **Dashboard**: Overview of active cases and trial readiness
2. **Case Files**: Manage legal cases and documents
3. **Evidence Vault** (`/app/evidence`): Upload, analyze, and organize evidence with AI relevance scoring
4. **Trial Simulator**: Practice oral arguments with AI opponent and live captioning
5. **Witness Lab**: Simulate witness examinations with three-column coaching layout
6. **Jury Analyzer** (`/app/jury`): Profile jurors, get bias scores and voir dire questions
7. **Deposition Prep** (`/app/deposition`): AI-generated question sets organized by topic
8. **Statement Builder** (`/app/statements`): Opening/closing statement generator with teleprompter mode
9. **Strategy & AI**: AI-powered case strategy insights
10. **Verdict Predictor** (`/app/verdict`): Win probability, damages range, settlement analysis
11. **Transcriber & OCR**: Audio transcription, document OCR, and AI legal analysis
12. **Drafting Assistant**: Legal document generation
13. **Client Updates** (`/app/client-update`): Professional client letter generator (8 letter types)

### AI Capabilities
- Document analysis and summarization
- Witness personality simulation (hostile, nervous, cooperative)
- Opposing counsel simulation
- Strategic predictions using Gemini's thinking model
- Real-time coaching and feedback
- Trial phase simulation (voir dire, opening/closing, cross-examination)

## Recent Changes (March 9, 2026)

### Enhanced AI Witness Simulation & Coaching
- Completely redesigned witness response generation with detailed personality-specific prompts:
  - **Hostile witnesses**: Short, clipped responses; frequent "I don't recall"; evasion tactics; sarcasm
  - **Nervous witnesses**: Stutter with "um/uh", second-guess answers, ramble, show stress signs, contradict self slightly
  - **Cooperative witnesses**: Direct honest answers, acknowledge knowledge limits, show concern for accuracy
  - All personality types now use natural speech patterns and emotional consistency
  
- Advanced `generateWitnessCoaching` function provides expert cross-examination strategy:
  - **Suggestion**: Tactical analysis of what witness revealed/evaded with actionable advice
  - **Follow-up**: Specific next question designed to pin down witness or expose contradiction
  - **Fallback**: Alternative question for when witness claims they don't know or becomes uncooperative
  - Coaching takes into account witness personality type for appropriate tactics

### WitnessLab Component - Three-Column Professional Layout
- **Left Sidebar**: Witness selection list with personality indicators
- **Center**: Chat conversation area showing full examination history
- **Right Panel**: Live coaching tips with color-coded sections:
  - Gold: Strategy coaching (tactical analysis)
  - Blue: Next question suggestion (follow-up prompt)
  - Orange: Fallback question (if witness uncooperative)
- Responsive design: coaching panel hidden on small screens, full visibility on desktop
- Real-time coaching generation after each witness response
- Professional error handling with clear fallback messages

### System Improvements
- Better temperature control (0.95) for more natural, varied responses
- Enhanced timeout handling and error visibility
- Consistent answer tracking within examination
- More realistic courtroom simulation experience

## Previous Setup (December 4, 2025)
- Configured Vite to run on port 5000 with `allowedHosts: true` for Replit compatibility
- Set up GEMINI_API_KEY as environment variable in Replit
- Installed project dependencies
- Fixed TypeScript errors
- Configured static deployment with dist as public directory

## User Preferences
- Real-time AI responses with intelligent, realistic coaching
- Organized layout with suggested scripts and fallback options throughout components
- Three-column layout for trial simulation and witness lab
- Simple, clean code with straightforward implementations

## Routing Architecture
- Clean HashRouter structure with public and app routes
- No conflicting routes - /app/witness-lab for witness simulator
- /app/practice for trial simulator with live voice AI
- All sub-routes properly nested under /app with sidebar layout
- Public routes (/, /privacy-policy, /tos) without sidebar

## Notes
- The app uses HashRouter for client-side routing
- Tailwind CSS is loaded via CDN for development (should consider PostCSS for production)
- API key is secured in Replit environment variables, not committed to git
- The .gitignore properly excludes .env.local files
- WitnessLab.tsx uses three-column layout: witness list, chat area, coaching panel
- ArgumentPractice.tsx has live voice AI integration with Gemini 2.5 Flash Native Audio

### Audio, Transcription & OCR Fixes (March 12, 2026)
- **Critical stream scoping bug fixed**: `micStream` now declared outside try block so it's accessible inside `onopen` callback — this was the root cause of audio input not working
- **API key fix**: vite.config now explicitly defines `import.meta.env.VITE_GEMINI_API_KEY` in the `define` block so it resolves at build time
- **Live captioning**: Real-time captions now update word-by-word as transcription streams in, displayed in a color-coded banner (blue = you, red = opponent). Fades 3s after turn completes.
- **Transcriber fully rebuilt**: No longer calls the dead `transcribe.casebuddy.live` external API. Now uses Gemini 2.5 Flash directly.
  - Audio transcription: speaker-labeled, handles inaudible portions
  - OCR mode: extracts text from images, PDFs, and scanned documents
  - AI legal analysis: runs automatically after processing — produces summary, key points, legal issues/risks, action items, identified speakers
  - Re-analyze button for existing transcriptions
  - Combined download includes transcript + AI analysis
- **geminiService.ts**: Added `performOCR()` and `analyzeTranscription()` functions

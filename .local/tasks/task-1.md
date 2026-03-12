---
title: Add Replit Auth
---
# Add Replit Auth

## What & Why
Add Replit Auth to CaseBuddy so users must log in before accessing the app. This uses Replit's built-in authentication system (supporting Google, GitHub, Apple, X, and email/password). Since the app is currently frontend-only, this requires adding a small Express backend to handle auth sessions and serve the frontend.

## Done looks like
- Unauthenticated visitors see a login prompt / are redirected to log in before they can access any app features
- After logging in, the user's real name and profile picture appear in the app header (replacing the hardcoded "Attorney J. Doe" placeholder)
- A logout option is available in the sidebar or header
- All app routes under `/app/*` are protected and only accessible when logged in

## Out of scope
- Storing user data or cases per-user in a database (no database required for basic auth)
- Role-based access control or team/firm-level permissions

## Tasks
1. **Install auth blueprint and set up Express backend** — Install the Replit Auth blueprint, which scaffolds an Express server. Configure it to serve the Vite frontend in development and handle auth API routes (`/api/auth/*`).

2. **Protect app routes** — Add an auth guard in the React app so all routes under `/app/*` require a logged-in user. Unauthenticated users should be redirected to a login screen or the landing page with a clear login prompt.

3. **Wire real user info into the UI** — Replace the hardcoded "Attorney J. Doe" name and placeholder avatar in the header with the authenticated user's name and profile picture from Replit Auth. Add a logout button to the sidebar or header.

## Relevant files
- `App.tsx`
- `App.tsx:87-99`
- `index.tsx`
- `index.html`
- `vite.config.ts`
- `package.json`
- `components/LandingPage.tsx`
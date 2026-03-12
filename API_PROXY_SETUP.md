# API Proxy Setup Guide - Securing Your Gemini API Key

## ⚠️ Critical Security Issue

**Current Status**: Your Gemini API key is exposed in the client-side JavaScript bundle, making it visible to anyone who inspects the application using browser DevTools.

**Risk Level**: HIGH - Anyone can extract your API key and abuse your quota, resulting in unauthorized charges.

---

## Solution: Backend API Proxy

To secure your API key, you need to create a backend proxy that:
1. Stores the API key server-side (never exposed to clients)
2. Receives requests from your frontend
3. Forwards requests to Gemini API with the key
4. Returns responses to the frontend

---

## Implementation Options

### Option 1: Node.js/Express Backend (Recommended)

#### Step 1: Create Backend Server

```bash
# In project root, create a new directory for backend
mkdir backend
cd backend
npm init -y
npm install express cors dotenv @google/genai
```

#### Step 2: Create `backend/server.js`

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting (optional but recommended)
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Proxy endpoints
app.post('/api/analyze-document', async (req, res) => {
  try {
    const { text, imagePart, responseSchema } = req.body;

    const parts = [];
    if (imagePart) parts.push(imagePart);
    parts.push({ text });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema
      }
    });

    res.json({ success: true, data: JSON.parse(response.text || '{}') });
  } catch (error) {
    console.error('Analyze document error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/generate-witness-response', async (req, res) => {
  try {
    const { history, systemInstruction } = req.body;

    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction, temperature: 0.9 },
      history
    });

    const lastMessage = history[history.length - 1].parts[0].text;
    const response = await chat.sendMessage({ message: lastMessage });

    res.json({ success: true, data: response.text });
  } catch (error) {
    console.error('Witness response error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/predict-strategy', async (req, res) => {
  try {
    const { contents, responseSchema } = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents,
      config: {
        thinkingConfig: { thinkingBudget: 2048 },
        responseMimeType: 'application/json',
        responseSchema
      }
    });

    res.json({ success: true, data: JSON.parse(response.text || '[]') });
  } catch (error) {
    console.error('Strategy prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/coaching-tip', async (req, res) => {
  try {
    const { contents, responseSchema } = req.body;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema
      }
    });

    res.json({ success: true, data: JSON.parse(response.text || '{}') });
  } catch (error) {
    console.error('Coaching tip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API Proxy server running on port ${PORT}`);
});
```

#### Step 3: Create `backend/.env`

```bash
GEMINI_API_KEY=your_actual_api_key_here
FRONTEND_URL=http://localhost:5173
PORT=3001
```

#### Step 4: Update `backend/package.json`

```json
{
  "name": "lexsim-backend",
  "version": "1.0.0",
  "description": "API proxy for LexSim",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "@google/genai": "^1.30.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

---

### Frontend Changes

#### Update `services/geminiService.ts`

Replace direct Gemini API calls with fetch to your backend:

```typescript
// Replace this:
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// With this:
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const analyzeDocument = async (text: string, imagePart?: any) => {
  const response = await fetch(`${API_BASE_URL}/api/analyze-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      imagePart,
      responseSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          entities: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } }
        }
      }
    })
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
};
```

#### Update `vite.config.ts`

```typescript
// REMOVE these lines that expose the API key:
// 'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
// 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),

// ADD this instead:
define: {
  'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3001')
}
```

#### Create `.env.local` (frontend)

```bash
VITE_API_URL=http://localhost:3001
```

---

### Option 2: Vercel Serverless Functions

If deploying to Vercel, you can use serverless functions:

#### Create `api/analyze-document.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const { text, imagePart, responseSchema } = req.body;

    const parts = [];
    if (imagePart) parts.push(imagePart);
    parts.push({ text });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema
      }
    });

    res.json({ success: true, data: JSON.parse(response.text || '{}') });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
}
```

Then set `GEMINI_API_KEY` in Vercel environment variables.

---

### Option 3: Netlify Functions

Similar to Vercel, create `.netlify/functions/analyze-document.ts`:

```typescript
import { Handler } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const { text, imagePart, responseSchema } = JSON.parse(event.body || '{}');

    const parts = [];
    if (imagePart) parts.push(imagePart);
    parts.push({ text });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: JSON.parse(response.text || '{}') })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: (error as Error).message })
    };
  }
};
```

---

## Deployment Checklist

- [ ] Remove API key from `vite.config.ts`
- [ ] Set up backend proxy (Express/Vercel/Netlify)
- [ ] Store API key in backend environment variables
- [ ] Update all geminiService functions to use proxy
- [ ] Add rate limiting to prevent abuse
- [ ] Test all API endpoints
- [ ] Update frontend `.env.local` with API proxy URL
- [ ] Deploy backend first, then frontend
- [ ] Verify API key is NOT in client bundle (check DevTools)

---

## Testing the Setup

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
npm run dev

# Test endpoint
curl -X POST http://localhost:3001/api/analyze-document \
  -H "Content-Type: application/json" \
  -d '{"text": "Test document"}'
```

---

## Additional Security Measures

1. **Add API key rotation**: Periodically rotate your Gemini API key
2. **Implement authentication**: Add user authentication to your backend
3. **Monitor usage**: Set up alerts for unusual API usage patterns
4. **Add request validation**: Validate all incoming requests
5. **Use HTTPS**: Always use HTTPS in production
6. **CORS configuration**: Restrict CORS to your frontend domain only
7. **Input sanitization**: Sanitize all user inputs before sending to API

---

## Cost Control

To prevent unexpected charges:

```javascript
// Add to backend
const dailyRequestLimit = 1000;
let requestCount = 0;
let resetDate = new Date();

app.use((req, res, next) => {
  if (new Date().getDate() !== resetDate.getDate()) {
    requestCount = 0;
    resetDate = new Date();
  }

  if (requestCount >= dailyRequestLimit) {
    return res.status(429).json({ error: 'Daily API limit reached' });
  }

  requestCount++;
  next();
});
```

---

## Troubleshooting

### Issue: CORS errors
**Solution**: Ensure backend CORS is configured correctly:
```javascript
app.use(cors({ origin: 'https://yourdomain.com', credentials: true }));
```

### Issue: 401 Unauthorized
**Solution**: Check that GEMINI_API_KEY is set in backend environment

### Issue: Timeout errors
**Solution**: Increase request timeout in backend:
```javascript
app.use(express.json({ limit: '10mb' }));
app.use(timeout('60s'));
```

---

## Migration Timeline

**Estimated Time**: 2-4 hours for full migration

1. **Phase 1 (30 min)**: Set up backend server
2. **Phase 2 (1 hour)**: Create proxy endpoints for all Gemini calls
3. **Phase 3 (30 min)**: Update frontend to use proxy
4. **Phase 4 (30 min)**: Testing and verification
5. **Phase 5 (30 min)**: Deploy and validate in production

---

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [Google Gemini API Best Practices](https://ai.google.dev/gemini-api/docs)

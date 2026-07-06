/**
 * Google Cloud Vision integration for OCR (Deno / Supabase Edge Functions)
 *
 * Uses a GCP service account (JSON key) to mint short-lived OAuth2 access
 * tokens via the standard JWT-bearer flow, then calls the Cloud Vision REST
 * API directly (no Node-only client libraries needed — pure Web Crypto).
 *
 * DOCUMENT_TEXT_DETECTION is purpose-built for dense text / scanned legal
 * documents and generally outperforms general vision-LLM OCR on tables,
 * stamps, and multi-column layouts.
 *
 * Setup:
 *   npx supabase secrets set GOOGLE_CLOUD_VISION_CREDENTIALS='<contents of service-account.json as one line>'
 *
 * The service account needs the "Cloud Vision API User" role (or broader)
 * and the Cloud Vision API must be enabled on the project.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('GOOGLE_CLOUD_VISION_CREDENTIALS');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch (err) {
    console.error('GOOGLE_CLOUD_VISION_CREDENTIALS is not valid JSON:', err);
    return null;
  }
}

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(sa: ServiceAccount, scope: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signingInput = `${encodedHeader}.${encodedClaimSet}`;

  const keyData = pemToArrayBuffer(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/** Fetches (and caches) a short-lived OAuth2 access token for the Vision API. */
export async function getGoogleVisionAccessToken(): Promise<string | null> {
  const sa = getServiceAccount();
  if (!sa) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const jwt = await signJwt(sa, 'https://www.googleapis.com/auth/cloud-vision');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

export function isGoogleVisionConfigured(): boolean {
  return !!getVisionApiKey() || getServiceAccount() !== null;
}

/** Simple API-key auth — works if the Cloud Vision API is enabled on the key's project. */
function getVisionApiKey(): string | null {
  return Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY') || null;
}

interface VisionAuth {
  headers: Record<string, string>;
  urlSuffix: string; // "?key=..." for API-key auth, "" for OAuth
}

async function getVisionAuth(): Promise<VisionAuth | null> {
  const apiKey = getVisionApiKey();
  if (apiKey) {
    return { headers: { 'Content-Type': 'application/json' }, urlSuffix: `?key=${apiKey}` };
  }
  const accessToken = await getGoogleVisionAccessToken();
  if (!accessToken) return null;
  return {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    urlSuffix: '',
  };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * OCR a single image via images:annotate (DOCUMENT_TEXT_DETECTION).
 */
async function visionAnnotateImage(base64Content: string, auth: VisionAuth): Promise<string> {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate${auth.urlSuffix}`, {
    method: 'POST',
    headers: auth.headers,
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Content },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['en'] },
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloud Vision images:annotate failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const response = data.responses?.[0];
  if (response?.error) throw new Error(`Cloud Vision error: ${response.error.message}`);
  return response?.fullTextAnnotation?.text ?? '';
}

/**
 * OCR a PDF via files:annotate (sync — supports up to 5 pages per request).
 * Batches pages in groups of 5 and concatenates with page markers.
 */
async function visionAnnotatePdf(base64Content: string, auth: VisionAuth, maxPages = 30): Promise<string> {
  const batches: number[][] = [];
  for (let start = 1; start <= maxPages; start += 5) {
    batches.push(Array.from({ length: Math.min(5, maxPages - start + 1) }, (_, i) => start + i));
  }

  const pageTexts: string[] = [];

  for (const pages of batches) {
    const res = await fetch(`https://vision.googleapis.com/v1/files:annotate${auth.urlSuffix}`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        requests: [
          {
            inputConfig: { mimeType: 'application/pdf', content: base64Content },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            pages,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // If we've asked for pages beyond the document's actual length, Google
      // returns an error for that batch — stop cleanly instead of throwing
      // once we already have at least one successful batch.
      if (pageTexts.length > 0) break;
      throw new Error(`Cloud Vision files:annotate failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    const responses = data.responses?.[0]?.responses ?? [];
    if (responses.length === 0) break;

    for (let i = 0; i < responses.length; i++) {
      const pageResp = responses[i];
      if (pageResp?.error) continue;
      const text = pageResp?.fullTextAnnotation?.text ?? '';
      if (text) pageTexts.push(`=== PAGE ${pages[i]} ===\n${text}`);
    }

    // Fewer responses than requested pages usually means we hit the end of doc.
    if (responses.length < pages.length) break;
  }

  return pageTexts.join('\n\n');
}

/**
 * Extract text from an image or PDF blob using Google Cloud Vision.
 * Throws if not configured or if the API call fails — callers should treat
 * this as one tier in a fallback chain.
 */
export async function googleVisionOcr(fileBlob: Blob, isImage: boolean): Promise<string> {
  const auth = await getVisionAuth();
  if (!auth) throw new Error('Google Cloud Vision not configured (set GOOGLE_CLOUD_VISION_API_KEY or GOOGLE_CLOUD_VISION_CREDENTIALS)');

  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64Content = arrayBufferToBase64(arrayBuffer);

  const text = isImage
    ? await visionAnnotateImage(base64Content, auth)
    : await visionAnnotatePdf(base64Content, auth);

  if (!text?.trim()) throw new Error('Google Cloud Vision returned empty OCR text');
  return text;
}

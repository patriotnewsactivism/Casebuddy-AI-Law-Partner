/**
 * POST /api/media/extract-audio
 *
 * Accepts a video file (multipart/form-data, field name "file"),
 * strips the audio track using @ffmpeg/ffmpeg (WASM), and returns
 * the audio as an mp3 blob.
 *
 * This runs on Vercel Node runtime (not Edge) because it needs
 * the Node Buffer API and larger memory for WASM.
 *
 * The extracted MP3 is then small enough for Groq Whisper (< 25MB)
 * for most recordings, OR can be sent directly to Deepgram.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { randomUUID } from 'crypto';

export const config = {
  api: {
    bodyParser: false,         // we parse multipart manually
    responseLimit: '50mb',
  },
  maxDuration: 60,             // 60s Vercel timeout
};

// ── Collect raw body from request ────────────────────────────────────────────
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Parse multipart/form-data (minimal, no dep needed) ───────────────────────
function parseMultipart(body: Buffer, boundary: string): { name: string; filename?: string; data: Buffer }[] {
  const sep = Buffer.from('--' + boundary);
  const parts: { name: string; filename?: string; data: Buffer }[] = [];
  let start = 0;
  while (start < body.length) {
    const sepIdx = body.indexOf(sep, start);
    if (sepIdx === -1) break;
    start = sepIdx + sep.length;
    if (body[start] === 45 && body[start + 1] === 45) break; // "--" = end
    if (body[start] === 13) start += 2; // CRLF
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headerStr = body.slice(start, headerEnd).toString();
    start = headerEnd + 4;
    const nextSep = body.indexOf(sep, start);
    const dataEnd = nextSep === -1 ? body.length : nextSep - 2; // strip trailing CRLF
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch?.[1],
        data: body.slice(start, dataEnd),
      });
    }
    start = nextSep === -1 ? body.length : nextSep;
  }
  return parts;
}

// ── Lazy-init ffmpeg (WASM loads once per cold start) ────────────────────────
let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    // Load core + WASM from CDN — avoids bundling the large WASM binary
    await ffmpegInstance.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    });
  }
  return ffmpegInstance;
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  if (!boundaryMatch) return res.status(400).json({ error: 'No boundary in multipart request' });

  try {
    const body = await getRawBody(req);
    const parts = parseMultipart(body, boundaryMatch[1].trim());
    const filePart = parts.find(p => p.name === 'file');
    if (!filePart) return res.status(400).json({ error: 'No file field in form data' });

    const ext = (filePart.filename || 'video.mp4').split('.').pop()?.toLowerCase() || 'mp4';
    const inputName = `input_${randomUUID()}.${ext}`;
    const outputName = `output_${randomUUID()}.mp3`;

    const ffmpeg = await getFFmpeg();

    // Write input to ffmpeg virtual FS
    await ffmpeg.writeFile(inputName, new Uint8Array(filePart.data));

    // Extract audio: -vn = no video, -ar 16000 = 16kHz (optimal for Whisper), -ac 1 = mono
    await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-ar', '16000',
      '-ac', '1',
      '-b:a', '64k',
      outputName,
    ]);

    const outputData = await ffmpeg.readFile(outputName) as Uint8Array;
    const outputBuffer = Buffer.from(outputData);

    // Clean up virtual FS
    try { await ffmpeg.deleteFile(inputName); } catch {}
    try { await ffmpeg.deleteFile(outputName); } catch {}

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="extracted_audio.mp3"`);
    res.setHeader('Content-Length', outputBuffer.length.toString());
    res.status(200).send(outputBuffer);

  } catch (err: any) {
    console.error('extract-audio error:', err);
    res.status(500).json({ error: err.message || 'Audio extraction failed' });
  }
}

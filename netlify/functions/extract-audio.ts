/**
 * Netlify Function — FFmpeg WASM audio extraction.
 * Ported from api/media/extract-audio.ts (VercelRequest/VercelResponse → Request/Response).
 *
 * POST /api/media/extract-audio  (multipart/form-data, field "file")
 * Returns: audio/mpeg (MP3) blob
 *
 * Uses @ffmpeg/ffmpeg WASM — no native binary needed.
 * Netlify Functions default to 10s timeout; set to 26s (max on free tier).
 * For large files, the client-side approach may be preferable.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    await ffmpegInstance.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    });
  }
  return ffmpegInstance;
}

function parseMultipart(body: Uint8Array, boundary: string): { name: string; filename?: string; data: Uint8Array }[] {
  const decoder = new TextDecoder();
  const sep = new TextEncoder().encode('--' + boundary);
  const parts: { name: string; filename?: string; data: Uint8Array }[] = [];

  // Simple boundary-based parsing
  const bodyStr = decoder.decode(body);
  const sections = bodyStr.split('--' + boundary);

  for (const section of sections) {
    if (section.trim() === '' || section.trim() === '--') continue;
    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerStr = section.slice(0, headerEnd);
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);

    if (nameMatch) {
      // Find binary data position in original buffer
      const headerBytes = new TextEncoder().encode(section.slice(0, headerEnd + 4));
      const sectionStart = findSubarray(body, new TextEncoder().encode(section.slice(0, 40)));
      if (sectionStart >= 0) {
        const dataStart = sectionStart + headerEnd + 4;
        // Find next boundary or end
        const nextBoundary = findSubarray(body, sep, dataStart);
        const dataEnd = nextBoundary > 0 ? nextBoundary - 2 : body.length; // -2 for CRLF
        parts.push({
          name: nameMatch[1],
          filename: filenameMatch?.[1],
          data: body.slice(dataStart, dataEnd),
        });
      }
    }
  }
  return parts;
}

function findSubarray(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });

  const contentType = req.headers.get('content-type') || '';
  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  if (!boundaryMatch)
    return new Response(JSON.stringify({ error: 'No boundary in multipart request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const parts = parseMultipart(rawBody, boundaryMatch[1].trim());
    const filePart = parts.find(p => p.name === 'file');
    if (!filePart)
      return new Response(JSON.stringify({ error: 'No file field in form data' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const ext = (filePart.filename || 'video.mp4').split('.').pop()?.toLowerCase() || 'mp4';
    const id = randomId();
    const inputName = `input_${id}.${ext}`;
    const outputName = `output_${id}.mp3`;

    const ffmpeg = await getFFmpeg();
    await ffmpeg.writeFile(inputName, filePart.data);
    await ffmpeg.exec(['-i', inputName, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k', outputName]);

    const outputData = await ffmpeg.readFile(outputName) as Uint8Array;

    try { await ffmpeg.deleteFile(inputName); } catch {}
    try { await ffmpeg.deleteFile(outputName); } catch {}

    return new Response(outputData, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="extracted_audio.mp3"',
        'Content-Length': outputData.length.toString(),
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Audio extraction failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const config = { path: "/api/media/extract-audio" };

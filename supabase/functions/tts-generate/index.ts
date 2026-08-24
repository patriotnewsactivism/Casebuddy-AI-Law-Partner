import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const TTS_MODEL = 'eleven_turbo_v2_5';
const DEFAULT_VOICE = '9BWtsw7tY7h4bXPiq3aY';

const VOICE_MAP: Record<string, string> = {
  judge: 'pNInz6obpgDQGcFmaJgB',
  witness: 'EXAVITQu4vr4xnSDxMaL',
  'opposing counsel': 'VR6AewLTigWG4xSOukaG',
  'court clerk': '21m00Tcm4TlvDq8ikWAM',
  'potential juror': 'AZnzlk1XvdvUeBnXmlld',
  deponent: 'ErXwobaYiN019PkySvjV',
  maya: 'EXAVITQu4vr4xnSDxMaL',
  rex: 'pNInz6obpgDQGcFmaJgB',
  doc: '21m00Tcm4TlvDq8ikWAM',
  lex: 'ErXwobaYiN019PkySvjV',
  sol: '21m00Tcm4TlvDq8ikWAM',
  sierra: 'EXAVITQu4vr4xnSDxMaL',
  jules: 'AZnzlk1XvdvUeBnXmlld',
  max: 'ErXwobaYiN019PkySvjV',
};

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = (Deno.env.get('ELEVENLABS_API_KEY') || '').trim();
  if (!apiKey) return json({ error: 'TTS service unavailable' }, 503);

  try {
    const body = await req.json() as {
      text?: string;
      character?: string;
      voiceId?: string;
      outputFormat?: 'pcm_24000' | 'pcm_16000' | 'mp3_44100_128';
      stability?: number;
      similarityBoost?: number;
    };

    const text = String(body.text || '').replace(/[*_`#>~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 5000);
    if (!text) return json({ error: 'text is required' }, 400);

    const character = String(body.character || '').toLowerCase().trim();
    const requestedVoice = String(body.voiceId || '').trim();
    const voiceId = /^[A-Za-z0-9]{10,40}$/.test(requestedVoice)
      ? requestedVoice
      : (VOICE_MAP[character] || DEFAULT_VOICE);
    const outputFormat = body.outputFormat || 'pcm_24000';

    const response = await fetch(
      `${ELEVENLABS_API}/text-to-speech/${voiceId}/stream?output_format=${encodeURIComponent(outputFormat)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: outputFormat.startsWith('mp3_') ? 'audio/mpeg' : 'application/octet-stream',
        },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: {
            stability: body.stability ?? 0.7,
            similarity_boost: body.similarityBoost ?? 0.8,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      console.error('[tts-generate] provider failed', { status: response.status });
      return json({ error: 'TTS generation failed' }, 502);
    }

    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': outputFormat.startsWith('mp3_') ? 'audio/mpeg' : 'application/octet-stream',
        'X-Audio-Format': outputFormat,
      },
    });
  } catch {
    return json({ error: 'TTS generation failed' }, 500);
  }
});
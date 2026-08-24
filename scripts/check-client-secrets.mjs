import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const excludedDirs = new Set([
  '.git', '.github', 'api', 'dist', 'docs', 'node_modules', 'scripts', 'server', 'supabase',
]);
const extensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

const forbidden = [
  /VITE_(?:API_KEY|GEMINI_API_KEY|GEMINI_KEY|GROQ_API_KEY|DEEPGRAM_API_KEY|DEEPGRAM_KEY|ELEVENLABS_API_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|AZURE_VISION_KEY|COURTLISTENER_API_KEY)/g,
  /__(?:GEMINI|GROQ|DEEPGRAM|ELEVENLABS|OPENAI|DEEPSEEK)_API_KEY/g,
  /\bsk-proj-[A-Za-z0-9_-]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{24,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).replaceAll('\\', '/');

    if (entry.isDirectory()) {
      if (!excludedDirs.has(relative.split('/')[0])) walk(full);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;

    const text = fs.readFileSync(full, 'utf8');
    for (const pattern of forbidden) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const line = text.slice(0, match.index).split('\n').length;
        findings.push(`${relative}:${line}: ${match[0]}`);
      }
    }
  }
}

walk(root);

if (findings.length) {
  console.error('Client-secret sentinel failed. Permanent provider credentials must remain server-side:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log('Client-secret sentinel passed.');

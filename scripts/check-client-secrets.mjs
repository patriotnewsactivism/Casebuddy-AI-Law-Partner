import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.error('Client-secret sentinel requires a completed dist build.');
  process.exit(1);
}

const sensitiveEnvNames = [
  'GEMINI_API_KEY', 'VITE_GEMINI_API_KEY', 'VITE_GEMINI_KEY', 'VITE_API_KEY',
  'GROQ_API_KEY', 'VITE_GROQ_API_KEY',
  'OPENAI_API_KEY', 'VITE_OPENAI_API_KEY',
  'DEEPGRAM_API_KEY', 'VITE_DEEPGRAM_API_KEY', 'VITE_DEEPGRAM_KEY',
  'ELEVENLABS_API_KEY', 'VITE_ELEVENLABS_API_KEY',
  'DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY',
  'COHERE_API_KEY', 'VITE_COHERE_API_KEY',
  'MISTRAL_API_KEY', 'VITE_MISTRAL_API_KEY',
  'OPENROUTER_API_KEY', 'VITE_OPENROUTER_API_KEY',
  'AZURE_VISION_KEY', 'VITE_AZURE_VISION_KEY',
  'COURTLISTENER_API_KEY', 'VITE_COURTLISTENER_API_KEY',
  'GITHUB_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY',
  'SENDGRID_API_KEY', 'RESEND_API_KEY', 'TWILIO_AUTH_TOKEN', 'STRIPE_SECRET_KEY',
  'CRON_SECRET', 'PIPELINE_WORKER_SECRET', 'PIPELINE_ORCHESTRATOR_SECRET',
];

const configuredSecrets = sensitiveEnvNames
  .map(name => [name, String(process.env[name] || '').trim()])
  .filter(([, value]) => value.length >= 12 && !/^(?:changeme|example|placeholder|your[_-]?key)/i.test(value));

const signaturePatterns = [
  ['OpenAI-style key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}/g],
  ['Groq API key', /\bgsk_[A-Za-z0-9_-]{20,}/g],
  ['GitHub token', /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/g],
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    const text = fs.readFileSync(full, 'utf8');
    const relative = path.relative(root, full).replaceAll('\\', '/');

    for (const [name, value] of configuredSecrets) {
      if (text.includes(value)) findings.push(`${relative}: contains configured ${name}`);
    }

    for (const [label, pattern] of signaturePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) findings.push(`${relative}: contains ${label} signature`);
    }
  }
}

walk(dist);

if (findings.length) {
  console.error('Client-secret sentinel failed. Built browser artifacts contain credential material:');
  for (const finding of [...new Set(findings)]) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`Client-secret sentinel passed (${configuredSecrets.length} configured sensitive values checked).`);

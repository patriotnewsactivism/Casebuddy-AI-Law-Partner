import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  PORT: z.coerce.number().int().positive().default(3000),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  WORKER_KIND: z.enum(["general", "media"]).default("general"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60000).default(2000),
  JOB_LEASE_SECONDS: z.coerce.number().int().min(30).max(86400).default(900),
  MEDIA_TRANSCRIBE_URL: z.string().url().optional(),
  MEDIA_TRANSCRIBE_TOKEN: z.string().min(16).optional()
});

export const config = schema.parse(process.env);

export const allowedOrigins = new Set(
  config.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

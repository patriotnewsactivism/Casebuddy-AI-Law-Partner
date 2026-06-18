/**
 * ⚠️  QUARANTINED — DO NOT IMPORT FROM CLIENT CODE
 *
 * This file references '@shared/schema' which does not exist in this project.
 * It is a leftover from a previous architecture and will cause build errors
 * if imported anywhere in the Vite/React client bundle.
 *
 * It is kept here for reference only. If a server-side DB layer is needed,
 * implement it in Vercel Edge Functions under /api/ using the Supabase client.
 */

// Original content below — intentionally NOT exported to prevent accidental use.
/*
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

*/
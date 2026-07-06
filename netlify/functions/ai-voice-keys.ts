import { Handler } from "@netlify/functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "Unauthorized." }) };

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "Supabase not configured." }) };

  try {
    const userResp = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + token, apikey: anonKey },
    });
    if (!userResp.ok) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "Invalid session." }) };
  } catch {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Auth check failed." }) };
  }

  const deepgramKey = (process.env.DEEPGRAM_API_KEY || "").trim();
  const geminiKey   = (process.env.GEMINI_API_KEY   || "").trim();

  if (!deepgramKey || !geminiKey) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "Voice API keys not configured." }) };

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ deepgramKey, geminiKey }) };
};

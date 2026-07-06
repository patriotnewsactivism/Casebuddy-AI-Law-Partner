import { Handler } from "@netlify/functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  let body: any = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }

  const { message, systemInstruction = "You are Maya, a warm legal intake assistant.", history = [], caseContext } = body;
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

  if (!geminiKey) return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "Gemini not configured." }) };
  if (!message)   return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "message is required" }) };

  const sysText = caseContext ? systemInstruction + "\n\nActive case context:\n" + caseContext : systemInstruction;
  const contents = [
    ...history.map((m: any) => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  try {
    const resp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiKey,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: sysText }] }, contents }) }
    );
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Empty Gemini response", raw: data }) };
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply: text }) };
  } catch (e: any) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};

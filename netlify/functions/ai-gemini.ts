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
    let text = "";
    try {
      const resp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiKey,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: sysText }] }, contents }) }
      );
      const data = await resp.json();
      text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (geminiError) {
      console.warn("Gemini failed, trying Mistral fallback:", geminiError);
    }

    if (!text) {
      // Mistral Fallback
      const mistralKey = (process.env.MISTRAL_API_KEY || "").trim();
      if (!mistralKey) {
        return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "Gemini failed and Mistral API key is not configured." }) };
      }

      // Format messages in OpenAI format for Mistral
      const messages = [
        { role: "system", content: sysText },
        ...history.map((m: any) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.text
        })),
        { role: "user", content: message }
      ];

      const mistralResp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
          model: "mistral-small-2506",
          messages,
          temperature: 0.6
        })
      });
      
      const mistralData = await mistralResp.json();
      text = (mistralData?.choices?.[0]?.message?.content || "").trim();
      if (!text) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Both Gemini and Mistral fallback failed", raw: mistralData }) };
      }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply: text }) };
  } catch (e: any) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};

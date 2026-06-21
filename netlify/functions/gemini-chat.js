exports.handler = async (event) => {
  var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }

  var message = body.message || '';
  var systemInstruction = body.systemInstruction || 'You are Maya, a warm and professional legal intake assistant.';
  var history = body.history || [];
  var caseContext = body.caseContext || '';

  var geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Gemini not configured.' }) };
  }
  if (!message) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'message is required' }) };
  }

  var sysText = caseContext
    ? systemInstruction + '\n\nActive case context:\n' + caseContext
    : systemInstruction;

  var contents = history.map(function(m) {
    return { role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] };
  });
  contents.push({ role: 'user', parts: [{ text: message }] });

  var apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey;

  try {
    var resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sysText }] },
        contents: contents
      })
    });

    var data = await resp.json();
    var text = (data && data.candidates && data.candidates[0] &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts[0] &&
                data.candidates[0].content.parts[0].text) || '';

    if (!text) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Empty Gemini response', raw: data }) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply: text }) };

  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

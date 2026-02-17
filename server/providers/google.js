const https = require('https');

const models = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
];

async function chat({ model, messages, temperature, maxTokens }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'Google API key is not configured. Set GOOGLE_API_KEY in your .env file.'
    );
    err.status = 503;
    throw err;
  }

  const selectedModel = model || 'gemini-2.0-flash';

  // Convert standard chat format to Gemini format
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  const contents = nonSystemMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const payload = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemMessages.length > 0) {
    payload.systemInstruction = {
      parts: [{ text: systemMessages.map((m) => m.content).join('\n') }],
    };
  }

  const body = JSON.stringify(payload);
  const path = `/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== 200) {
              const err = new Error(
                parsed.error?.message || 'Google Gemini API request failed'
              );
              err.status = res.statusCode;
              return reject(err);
            }
            const text =
              parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve({
              provider: 'google',
              model: selectedModel,
              content: text,
              usage: parsed.usageMetadata || null,
            });
          } catch (e) {
            reject(new Error('Failed to parse Google Gemini response'));
          }
        });
      }
    );
    req.on('error', (e) => reject(new Error(`Google Gemini request failed: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { chat, models };

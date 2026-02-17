const https = require('https');

const models = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

async function chat({ model, messages, temperature, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in your .env file.');
    err.status = 503;
    throw err;
  }

  const selectedModel = model || 'gpt-4o-mini';

  const body = JSON.stringify({
    model: selectedModel,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens: maxTokens,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== 200) {
              const err = new Error(parsed.error?.message || 'OpenAI API request failed');
              err.status = res.statusCode;
              return reject(err);
            }
            resolve({
              provider: 'openai',
              model: parsed.model,
              content: parsed.choices[0].message.content,
              usage: parsed.usage,
            });
          } catch (e) {
            reject(new Error('Failed to parse OpenAI response'));
          }
        });
      }
    );
    req.on('error', (e) => reject(new Error(`OpenAI request failed: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { chat, models };

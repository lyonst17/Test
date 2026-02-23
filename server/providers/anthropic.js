const https = require('https');

const models = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  //{ id: 'claude-sonnet-4-6', name: 'Claude 4.6 Sonnet' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku' },
];

async function chat({ model, messages, temperature, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'Anthropic API key is not configured. Set ANTHROPIC_API_KEY in your .env file.'
    );
    err.status = 503;
    throw err;
  }

  const selectedModel = model || 'claude-3-5-sonnet-20241022';

  // Anthropic uses a separate system parameter rather than a system message role
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');
  const systemPrompt = systemMessages.map((m) => m.content).join('\n') || undefined;

  const body = JSON.stringify({
    model: selectedModel,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);

            console.log(parsed)
            if (res.statusCode !== 200) {
              const err = new Error(parsed.error?.message || 'Anthropic API request failed');
              err.status = res.statusCode;
              return reject(err);
            }
            console.log(parsed)
            resolve({
              provider: 'anthropic',
              model: parsed.model,
              content: parsed.content[0].text,
              usage: parsed.usage,
            });
          } catch (e) {
            reject(new Error('Failed to parse Anthropic response'));
          }
        });
      }
    );
    req.on('error', (e) => reject(new Error(`Anthropic request failed: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

module.exports = { chat, models };

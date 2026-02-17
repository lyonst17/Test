const express = require('express');
const router = express.Router();
const openaiProvider = require('../providers/openai');
const anthropicProvider = require('../providers/anthropic');
const googleProvider = require('../providers/google');

const providers = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
};

router.post('/', async (req, res) => {
  const { provider, model, messages, temperature, maxTokens } = req.body;

  if (!provider || !providers[provider]) {
    return res.status(400).json({
      error: `Invalid provider. Choose from: ${Object.keys(providers).join(', ')}`,
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required and must not be empty.' });
  }

  try {
    const result = await providers[provider].chat({
      model,
      messages,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 2048,
    });
    res.json(result);
  } catch (err) {
    console.error(`[${provider}] Error:`, err.message);
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/models', (_req, res) => {
  res.json({
    openai: openaiProvider.models,
    anthropic: anthropicProvider.models,
    google: googleProvider.models,
  });
});

module.exports = router;

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config();

const chatRoutes = require('./routes/chat');
const historyRoutes = require('./routes/history');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});
app.use('/api/', limiter);

// --- Public routes (no auth required) ---

// Login page
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Auth routes
app.get('/auth/signin', auth.login);
app.get('/auth/callback', auth.callback);
app.get('/auth/signout', auth.logout);

// Static assets (CSS, JS, images) must be accessible for login page
app.use(express.static(path.join(__dirname, '..', 'public')));

// Expose lightweight public endpoints before auth middleware so the
// frontend can fetch models/health while the user is not signed in.
const openaiProvider = require('./providers/openai');
const anthropicProvider = require('./providers/anthropic');
const googleProvider = require('./providers/google');

app.get('/api/chat/models', (_req, res) => {
  res.json({
    openai: openaiProvider.models,
    anthropic: anthropicProvider.models,
    google: googleProvider.models,
  });
});

app.get('/api/health', (_req, res) => {
  const providers = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_API_KEY,
  };
  res.json({ status: 'ok', providers });
});

// --- Auth check: everything below requires login ---
app.use(auth.requireAuth);

// Current user info
app.get('/api/me', (req, res) => {
  res.json(req.session.user);
});

// Chat API (protected)
app.use('/api/chat', chatRoutes);

// Chat history API (protected)
app.use('/api/history', historyRoutes);

// Return 404 JSON for unmatched API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  next();
});

// SPA catch-all (only for authenticated users)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Marc Fisher AI Hub running on http://localhost:${PORT}`);
  if (!auth.isConfigured()) {
    console.warn('WARNING: Azure AD credentials not set. SSO login will not work.');
    console.warn('Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID in .env');
  }
});

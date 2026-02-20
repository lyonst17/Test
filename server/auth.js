const msal = require('@azure/msal-node');

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
};

let msalInstance = null;

function getMsalInstance() {
  if (!msalInstance) {
    msalInstance = new msal.ConfidentialClientApplication(msalConfig);
  }
  return msalInstance;
}

function getRedirectUri(req) {
  if (process.env.AZURE_REDIRECT_URI) {
    return process.env.AZURE_REDIRECT_URI;
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}/auth/callback`;
}

async function login(req, res) {
  try {
    const authUrl = await getMsalInstance().getAuthCodeUrl({
      scopes: ['user.read'],
      redirectUri: getRedirectUri(req),
    });
    res.redirect(authUrl);
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).send('Authentication error. Check Azure AD configuration.');
  }
}

async function callback(req, res) {
  try {
    const result = await getMsalInstance().acquireTokenByCode({
      code: req.query.code,
      scopes: ['user.read'],
      redirectUri: getRedirectUri(req),
    });
    req.session.user = {
      id: result.account.homeAccountId,
      name: result.account.name,
      email: result.account.username,
    };
    res.redirect('/');
  } catch (err) {
    console.error('Auth callback error:', err.message);
    res.redirect('/login');
  }
}

function logout(req, res) {
  const postLogoutUri = getRedirectUri(req).replace('/auth/callback', '/login');
  req.session.destroy(() => {
    const logoutUrl =
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}/oauth2/v2.0/logout` +
      `?post_logout_redirect_uri=${encodeURIComponent(postLogoutUri)}`;
    res.redirect(logoutUrl);
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  res.redirect('/login');
}

function isConfigured() {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

module.exports = { login, callback, logout, requireAuth, isConfigured };

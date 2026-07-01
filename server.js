'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const fs      = require('fs');
const path    = require('path');
require('dotenv').config();

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const CONTENT    = path.join(__dirname, 'data/content.json');
const ADMIN_FILE = path.join(__dirname, 'data/admin.json');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Auth middleware ────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

// ─── Simple brute-force guard ───────────────────────────────
const loginAttempts = new Map();

function guardLogin(req, res, next) {
  const ip  = req.ip;
  const now = Date.now();
  let rec   = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (now < rec.until) {
    const wait = Math.ceil((rec.until - now) / 1000);
    return res.status(429).json({ error: `Too many attempts. Wait ${wait}s.` });
  }
  if (now > rec.until && rec.count > 0 && now - rec.until > 300_000) rec.count = 0;
  req._loginRec = rec;
  req._ip       = ip;
  next();
}

// ─── Routes ────────────────────────────────────────────────

// Public: serve admin panel
app.get('/admin', (_req, res) =>
  res.sendFile(path.join(__dirname, 'admin/index.html'))
);

// Public: portfolio content
app.get('/api/content', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(CONTENT, 'utf8')));
  } catch {
    res.status(500).json({ error: 'Could not read content' });
  }
});

// Public: login
app.post('/api/admin/login', guardLogin, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  let admin;
  try { admin = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')); }
  catch { return res.status(500).json({ error: 'Admin config missing. Restart server.' }); }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    const rec = req._loginRec;
    rec.count++;
    if (rec.count >= 5) rec.until = Date.now() + 5 * 60_000;
    loginAttempts.set(req._ip, rec);
    return res.status(401).json({ error: 'Incorrect password' });
  }

  loginAttempts.delete(req._ip);
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// Protected: update all content
app.put('/api/admin/content', requireAuth, (req, res) => {
  try {
    fs.writeFileSync(CONTENT, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save content' });
  }
});

// Protected: change password
app.post('/api/admin/password', requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = await bcrypt.hash(newPassword, 10);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ passwordHash: hash }, null, 2));
  res.json({ success: true });
});

// ─── Startup ───────────────────────────────────────────────
(async () => {
  // Create data dir if missing
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

  // Auto-generate admin password on first run
  if (!fs.existsSync(ADMIN_FILE)) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
    const pw    = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const hash  = await bcrypt.hash(pw, 10);
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({ passwordHash: hash }, null, 2));
    console.log(`\n🔑  First-run admin password: ${pw}`);
    console.log(`    Change this in Settings after logging in.\n`);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀  Portfolio  → http://localhost:${PORT}`);
    console.log(`🛠   Admin panel → http://localhost:${PORT}/admin\n`);
  });
})();

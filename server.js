'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const fs      = require('fs');
const crypto  = require('crypto');
const path    = require('path');
require('dotenv').config();

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const CONTENT    = path.join(__dirname, 'data/content.json');
const ADMIN_FILE = path.join(__dirname, 'data/admin.json');
const PHOTO_DIR  = path.join(__dirname, 'uploads/wedding');
const PHOTO_DB   = path.join(__dirname, 'data/wedding-photos.json');

// Photo uploads arrive as base64 JPEGs, so they need a bigger body limit than
// the default. Registered first so the global parser below skips these requests.
app.use('/api/wedding/photos', express.json({ limit: '10mb' }));
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

// ─── Wedding guest photos ──────────────────────────────────
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const uploadLog       = new Map();

function readPhotos() {
  try { return JSON.parse(fs.readFileSync(PHOTO_DB, 'utf8')); }
  catch { return []; }
}

// Public: list guest photos, newest first
app.get('/api/wedding/photos', (_req, res) => {
  res.json({ photos: readPhotos().slice().reverse() });
});

// Public: guests upload a photo (client re-encodes to JPEG before sending)
app.post('/api/wedding/photos', (req, res) => {
  const now    = Date.now();
  const recent = (uploadLog.get(req.ip) || []).filter(t => now - t < 10 * 60_000);
  if (recent.length >= 40) return res.status(429).json({ error: 'Too many uploads. Try again shortly.' });

  const { image, name } = req.body || {};
  const match = typeof image === 'string' && image.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ error: 'Expected a JPEG image' });

  const buf = Buffer.from(match[1], 'base64');
  if (buf.length > MAX_PHOTO_BYTES) return res.status(413).json({ error: 'Photo is too large' });
  if (buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF)
    return res.status(400).json({ error: 'Not a valid JPEG' });

  const file = `${crypto.randomUUID()}.jpg`;
  try {
    fs.writeFileSync(path.join(PHOTO_DIR, file), buf);
    const photos = readPhotos();
    photos.push({
      url: `/uploads/wedding/${file}`,
      name: typeof name === 'string' ? name.trim().slice(0, 60) : '',
      uploadedAt: new Date(now).toISOString(),
    });
    fs.writeFileSync(PHOTO_DB, JSON.stringify(photos, null, 2));
  } catch {
    return res.status(500).json({ error: 'Could not save photo' });
  }

  recent.push(now);
  uploadLog.set(req.ip, recent);
  res.status(201).json({ success: true });
});

// ─── Startup ───────────────────────────────────────────────
(async () => {
  // Create data dir if missing
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.mkdirSync(PHOTO_DIR, { recursive: true });

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
    console.log(`🛠   Admin panel → http://localhost:${PORT}/admin`);
    console.log(`💍  Wedding     → http://localhost:${PORT}/wedding/\n`);
  });
})();

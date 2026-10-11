// تسجيل دخول الإدارة: كلمات سر مشفرة (scrypt) وجلسات محفوظة بقاعدة البيانات
const crypto = require('crypto');
const { db } = require('./db');

const SESSION_DAYS = 14;
const COOKIE = 'rk_admin';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

function ensureFirstAdmin() {
  const n = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (n > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'change-me-now';
  db.prepare('INSERT INTO admins(username, pass_hash, name, role) VALUES (?,?,?,?)')
    .run(username, hashPassword(password), 'المدير', 'owner');
  console.log(`[auth] أنشأنا حساب المدير: ${username} (غيّر كلمة السر من لوحة الإدارة)`);
}

function createSession(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions(token, admin_id, expires_at) VALUES (?,?,?)').run(token, adminId, expires);
  return { token, expires };
}
function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
function cleanSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  };
}

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'سجل دخولك أولاً' });
  const row = db.prepare(`SELECT a.id, a.username, a.name, a.role, s.expires_at FROM sessions s
    JOIN admins a ON a.id = s.admin_id WHERE s.token = ?`).get(token);
  if (!row || row.expires_at < new Date().toISOString()) {
    if (row) destroySession(token);
    return res.status(401).json({ error: 'انتهت الجلسة، سجل دخولك من جديد' });
  }
  req.admin = { id: row.id, username: row.username, name: row.name, role: row.role };
  next();
}
function requireOwner(req, res, next) {
  if (req.admin?.role !== 'owner') return res.status(403).json({ error: 'هذا الإجراء للمدير الرئيسي فقط' });
  next();
}

// حماية بسيطة من تخمين كلمة السر: 8 محاولات خاطئة كل 15 دقيقة لكل عنوان
const attempts = new Map();
function loginLimiter(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, t: now };
  if (now - rec.t > 15 * 60e3) { rec.n = 0; rec.t = now; }
  if (rec.n >= 8) return res.status(429).json({ error: 'محاولات كثيرة، جرب بعد ربع ساعة' });
  req._loginRec = rec; attempts.set(key, rec);
  next();
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, ensureFirstAdmin, createSession, destroySession,
  cleanSessions, cookieOptions, requireAdmin, requireOwner, loginLimiter,
};

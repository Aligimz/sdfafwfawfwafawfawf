// ركن الهاتف - نقطة تشغيل الموقع
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

require('./src/db');
const auth = require('./src/auth');
const reminders = require('./src/reminders');
const telegramBot = require('./src/telegramBot');

auth.ensureFirstAdmin();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// ترويسات أمان أساسية
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/public'));

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود' }));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'حجم الصورة أكبر من 6 ميكا.' });
  res.status(500).json({ error: 'صار خطأ بالخادم، جرب مرة ثانية.' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`✅ المتجر شغال على http://localhost:${PORT}`);
  console.log(`🔐 لوحة الإدارة: http://localhost:${PORT}/admin`);
  reminders.start();
  if (process.env.DISABLE_TELEGRAM_BOT !== 'true') telegramBot.start();
});

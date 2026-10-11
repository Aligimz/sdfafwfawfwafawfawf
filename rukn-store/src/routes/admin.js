// واجهة برمجية للوحة الإدارة (كلها محمية بتسجيل الدخول)
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, getSettings, setSettings, DEFAULT_SETTINGS } = require('../db');
const A = require('../auth');
const N = require('../notify');
const R = require('../reminders');
const { serialize, serializeMany } = require('../products');

const router = express.Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype] || '.jpg';
      cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

const clean = (s, max = 500) => (s == null ? null : String(s).trim().slice(0, max));
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

// ---------- الدخول ----------
router.post('/login', A.loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const a = db.prepare('SELECT * FROM admins WHERE username=?').get(String(username || '').trim());
  if (!a || !A.verifyPassword(String(password || ''), a.pass_hash)) {
    req._loginRec.n++;
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غلط.' });
  }
  req._loginRec.n = 0;
  A.cleanSessions();
  const { token } = A.createSession(a.id);
  res.cookie(A.COOKIE, token, A.cookieOptions());
  res.json({ ok: true, admin: { username: a.username, name: a.name, role: a.role } });
});

router.post('/logout', (req, res) => {
  const t = req.cookies[A.COOKIE];
  if (t) A.destroySession(t);
  res.clearCookie(A.COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.use(A.requireAdmin);

router.get('/me', (req, res) => {
  const s = getSettings();
  const hash = db.prepare('SELECT pass_hash FROM admins WHERE id=?').get(req.admin.id).pass_hash;
  res.json({ admin: req.admin, store_name: s.store_name, weak_password: A.verifyPassword('change-me-now', hash) });
});

router.put('/me/password', (req, res) => {
  const { current, next } = req.body || {};
  const a = db.prepare('SELECT * FROM admins WHERE id=?').get(req.admin.id);
  if (!A.verifyPassword(String(current || ''), a.pass_hash)) return res.status(400).json({ error: 'كلمة السر الحالية غلط.' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'كلمة السر الجديدة لازم تكون 8 أحرف أو أكثر.' });
  db.prepare('UPDATE admins SET pass_hash=? WHERE id=?').run(A.hashPassword(String(next)), a.id);
  db.prepare('DELETE FROM sessions WHERE admin_id=? AND token!=?').run(a.id, req.cookies[A.COOKIE]);
  res.json({ ok: true });
});

// ---------- الإحصائيات ----------
router.get('/stats', (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const today = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM orders WHERE date(created_at)=date('now') AND status!='cancelled'");
  const month = one("SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM orders WHERE created_at >= date('now','start of month') AND status!='cancelled'");
  const open = one("SELECT COUNT(*) n FROM orders WHERE status IN ('new','confirmed','preparing','shipped')").n;
  const fresh = one("SELECT COUNT(*) n FROM orders WHERE status='new'").n;
  const msgs = one("SELECT COUNT(*) n FROM messages WHERE status='new'").n;
  const remindersDue = one("SELECT COUNT(*) n FROM reminders WHERE status='pending'").n;
  const failed = one("SELECT COUNT(*) n FROM reminders WHERE status='failed'").n;

  const series = db.prepare(`SELECT date(created_at) d, COUNT(*) n, COALESCE(SUM(total),0) t FROM orders
    WHERE created_at >= date('now','-13 days') AND status!='cancelled' GROUP BY d`).all();
  const byDay = Object.fromEntries(series.map((r) => [r.d, r]));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ date: d, orders: byDay[d]?.n || 0, revenue: byDay[d]?.t || 0 });
  }
  const top = db.prepare(`SELECT name, SUM(qty) q, SUM(qty*unit_price) t FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE o.status!='cancelled' AND o.created_at >= date('now','-30 days') GROUP BY name ORDER BY q DESC LIMIT 5`).all();
  const lowStock = db.prepare(`SELECT p.id, p.name, p.stock FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.active=1 AND p.stock <= 3 ORDER BY p.stock LIMIT 8`).all();
  const recent = db.prepare('SELECT id, code, customer_name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 8').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all();
  res.json({ today, month, open, fresh, msgs, remindersDue, failed, days, top, lowStock, recent, byStatus });
});

// ---------- الأقسام ----------
router.get('/categories', (req, res) => {
  res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) AS count FROM categories c ORDER BY sort, id`).all());
});
router.post('/categories', (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 60);
  if (!name) return res.status(400).json({ error: 'اكتب اسم القسم.' });
  const slug = clean(b.slug, 60) || 'cat-' + Date.now().toString(36);
  const kinds = ['device', 'case', 'subscription', 'card', 'accessory'];
  try {
    const id = db.prepare('INSERT INTO categories(slug, name, kind, description, sort, active) VALUES (?,?,?,?,?,?)')
      .run(slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase(), name, kinds.includes(b.kind) ? b.kind : 'device', clean(b.description), int(b.sort), b.active === false ? 0 : 1).lastInsertRowid;
    res.json({ id });
  } catch (e) { res.status(400).json({ error: 'الرابط المختصر مستخدم لقسم ثاني.' }); }
});
router.put('/categories/:id', (req, res) => {
  const b = req.body || {};
  const kinds = ['device', 'case', 'subscription', 'card', 'accessory'];
  db.prepare('UPDATE categories SET name=?, kind=?, description=?, sort=?, active=? WHERE id=?')
    .run(clean(b.name, 60), kinds.includes(b.kind) ? b.kind : 'device', clean(b.description), int(b.sort), b.active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
router.delete('/categories/:id', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM products WHERE category_id=?').get(req.params.id).n;
  if (n) return res.status(400).json({ error: `القسم بيه ${n} منتج. انقلهم لقسم ثاني أو احذفهم أولاً.` });
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- المنتجات ----------
router.get('/products', (req, res) => {
  const where = ['1=1'], args = [];
  if (req.query.category) { where.push('p.category_id=?'); args.push(req.query.category); }
  if (req.query.q) { where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.sku LIKE ?)'); const q = `%${req.query.q}%`; args.push(q, q, q); }
  if (req.query.low) where.push('p.stock<=3');
  const rows = db.prepare(`SELECT p.*, c.name AS category_name, c.kind AS kind FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE ${where.join(' AND ')} ORDER BY p.id DESC`).all(...args);
  res.json(serializeMany(rows));
});
router.get('/products/:id', (req, res) => {
  const p = db.prepare('SELECT p.*, c.kind AS kind FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'غير موجود' });
  res.json(serialize(p));
});

function productFields(b) {
  const opts = Array.isArray(b.options) ? b.options
    .filter((o) => o && o.name && Array.isArray(o.values) && o.values.length)
    .map((o) => ({ name: String(o.name).slice(0, 40), values: o.values.filter((v) => v && v.label).map((v) => ({ label: String(v.label).slice(0, 40), delta: int(v.delta) })) })) : [];
  const specs = Array.isArray(b.specs) ? b.specs.map((s) => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [];
  return {
    category_id: b.category_id ? int(b.category_id) : null,
    name: clean(b.name, 120), brand: clean(b.brand, 60),
    condition: b.condition === 'used' ? 'used' : 'new', condition_note: clean(b.condition_note, 200),
    price: Math.max(0, int(b.price)), old_price: b.old_price ? Math.max(0, int(b.old_price)) : null,
    stock: Math.max(0, int(b.stock)), sku: clean(b.sku, 60), description: clean(b.description, 4000),
    specs: JSON.stringify(specs), options: JSON.stringify(opts),
    compatible: clean(b.compatible, 300), duration_days: b.duration_days ? int(b.duration_days) : null,
    featured: b.featured ? 1 : 0, active: b.active === false ? 0 : 1,
  };
}
router.post('/products', (req, res) => {
  const f = productFields(req.body || {});
  if (!f.name) return res.status(400).json({ error: 'اكتب اسم المنتج.' });
  const id = db.prepare(`INSERT INTO products(category_id,name,brand,condition,condition_note,price,old_price,stock,sku,description,specs,options,compatible,duration_days,featured,active)
    VALUES (@category_id,@name,@brand,@condition,@condition_note,@price,@old_price,@stock,@sku,@description,@specs,@options,@compatible,@duration_days,@featured,@active)`).run(f).lastInsertRowid;
  res.json({ id });
});
router.put('/products/:id', (req, res) => {
  const f = productFields(req.body || {});
  if (!f.name) return res.status(400).json({ error: 'اكتب اسم المنتج.' });
  db.prepare(`UPDATE products SET category_id=@category_id,name=@name,brand=@brand,condition=@condition,condition_note=@condition_note,price=@price,old_price=@old_price,
    stock=@stock,sku=@sku,description=@description,specs=@specs,options=@options,compatible=@compatible,duration_days=@duration_days,featured=@featured,active=@active,
    updated_at=datetime('now') WHERE id=@id`).run({ ...f, id: int(req.params.id) });
  res.json({ ok: true });
});
router.patch('/products/:id', (req, res) => {
  const b = req.body || {};
  if ('active' in b) db.prepare('UPDATE products SET active=? WHERE id=?').run(b.active ? 1 : 0, req.params.id);
  if ('stock' in b) db.prepare('UPDATE products SET stock=? WHERE id=?').run(Math.max(0, int(b.stock)), req.params.id);
  if ('featured' in b) db.prepare('UPDATE products SET featured=? WHERE id=?').run(b.featured ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
router.delete('/products/:id', (req, res) => {
  const imgs = db.prepare('SELECT path FROM product_images WHERE product_id=?').all(req.params.id);
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  for (const i of imgs) fs.unlink(path.join(UPLOAD_DIR, i.path), () => {});
  res.json({ ok: true });
});
router.post('/products/:id/images', upload.array('images', 10), (req, res) => {
  const p = db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id);
  if (!p) { for (const f of req.files || []) fs.unlink(f.path, () => {}); return res.status(404).json({ error: 'المنتج غير موجود' }); }
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'اختر صور بصيغة JPG أو PNG أو WEBP (أقل من 6 ميكا).' });
  let sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM product_images WHERE product_id=?').get(p.id).m;
  const ins = db.prepare('INSERT INTO product_images(product_id, path, sort) VALUES (?,?,?)');
  for (const f of req.files) ins.run(p.id, f.filename, ++sort);
  res.json(serialize(db.prepare('SELECT * FROM products WHERE id=?').get(p.id)).images);
});
router.delete('/images/:id', (req, res) => {
  const img = db.prepare('SELECT * FROM product_images WHERE id=?').get(req.params.id);
  if (img) { db.prepare('DELETE FROM product_images WHERE id=?').run(img.id); fs.unlink(path.join(UPLOAD_DIR, img.path), () => {}); }
  res.json({ ok: true });
});
router.put('/products/:id/images/order', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const st = db.prepare('UPDATE product_images SET sort=? WHERE id=? AND product_id=?');
  db.transaction(() => ids.forEach((id, i) => st.run(i, id, req.params.id)))();
  res.json({ ok: true });
});

// ---------- الطلبات ----------
router.get('/orders', (req, res) => {
  const where = ['1=1'], args = [];
  if (req.query.status) { where.push('o.status=?'); args.push(req.query.status); }
  if (req.query.q) { where.push('(o.code LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ?)'); const q = `%${req.query.q}%`; args.push(q, q, q); }
  if (req.query.phone) { where.push('o.phone=?'); args.push(req.query.phone); }
  const page = Math.max(1, int(req.query.page, 1)), per = 30;
  const total = db.prepare(`SELECT COUNT(*) n FROM orders o WHERE ${where.join(' AND ')}`).get(...args).n;
  const rows = db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) AS items_count,
      (SELECT GROUP_CONCAT(name, '، ') FROM order_items WHERE order_id=o.id) AS items_names
    FROM orders o WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  res.json({ rows, total, page, pages: Math.max(1, Math.ceil(total / per)) });
});

router.get('/orders.csv', (req, res) => {
  const rows = db.prepare(`SELECT o.code, o.created_at, o.customer_name, o.phone, o.governorate, o.address, o.status, o.subtotal, o.delivery_fee, o.total,
    (SELECT GROUP_CONCAT(name || ' x' || qty, ' | ') FROM order_items WHERE order_id=o.id) AS items FROM orders o ORDER BY o.id DESC`).all();
  const head = ['رقم الطلب', 'التاريخ', 'الزبون', 'الهاتف', 'المحافظة', 'العنوان', 'الحالة', 'المجموع', 'التوصيل', 'الإجمالي', 'المنتجات'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [head.map(q).join(','), ...rows.map((r) => [r.code, r.created_at, r.customer_name, r.phone, r.governorate, r.address, N.STATUS[r.status], r.subtotal, r.delivery_fee, r.total, r.items].map(q).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csv);
});

function orderDetail(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id);
  const events = db.prepare(`SELECT e.*, a.name AS admin_name FROM order_events e LEFT JOIN admins a ON a.id=e.admin_id WHERE order_id=? ORDER BY e.id`).all(id);
  const reminders = db.prepare('SELECT * FROM reminders WHERE order_id=? ORDER BY due_at').all(id);
  const history = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM orders WHERE phone=? AND status!=\'cancelled\'').get(o.phone);
  return {
    ...o, items, events, reminders, customer_history: history,
    wa_link: N.waLink(o.phone, N.customerStatusText(o)),
  };
}
router.get('/orders/:id', (req, res) => {
  const d = orderDetail(req.params.id);
  if (!d) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.json(d);
});

router.put('/orders/:id/status', ah(async (req, res) => {
  const { status, note, notify } = req.body || {};
  if (!N.STATUS[status]) return res.status(400).json({ error: 'حالة غير صحيحة' });
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود' });

  db.transaction(() => {
    // إرجاع الكمية للمخزن عند الإلغاء، وسحبها مرة ثانية إذا رجع الطلب
    if (status === 'cancelled' && o.status !== 'cancelled') {
      for (const it of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(o.id)) {
        db.prepare('UPDATE products SET stock=stock+?, sold_count=MAX(0, sold_count-?) WHERE id=?').run(it.qty, it.qty, it.product_id);
      }
    } else if (o.status === 'cancelled' && status !== 'cancelled') {
      for (const it of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(o.id)) {
        db.prepare('UPDATE products SET stock=MAX(0, stock-?), sold_count=sold_count+? WHERE id=?').run(it.qty, it.qty, it.product_id);
      }
    }
    db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").run(status, o.id);
    db.prepare('INSERT INTO order_events(order_id, status, note, admin_id) VALUES (?,?,?,?)').run(o.id, status, clean(note, 500), req.admin.id);
  })();

  const updated = db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);
  R.onStatusChanged(updated);
  let sent = null;
  if (notify && getSettings().notify_customer_status === '1') sent = await N.notifyCustomer(updated, N.customerStatusText(updated));
  res.json({ ...orderDetail(o.id), sent });
}));

router.put('/orders/:id', (req, res) => {
  const b = req.body || {};
  db.prepare(`UPDATE orders SET customer_name=COALESCE(?,customer_name), phone=COALESCE(?,phone), governorate=?, address=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
    .run(clean(b.customer_name, 80), clean(b.phone, 20), clean(b.governorate, 40), clean(b.address, 300), clean(b.admin_note, 2000), req.params.id);
  res.json(orderDetail(req.params.id));
});

router.post('/orders/:id/message', ah(async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود' });
  const text = clean(req.body?.text, 2000);
  if (!text) return res.status(400).json({ error: 'اكتب نص الرسالة.' });
  const r = await N.notifyCustomer(o, text, req.body?.channel || 'all');
  db.prepare('INSERT INTO order_events(order_id, status, note, admin_id) VALUES (?,?,?,?)').run(o.id, null, `رسالة للزبون: ${text.slice(0, 200)}${r.ok ? '' : ' (فشل الإرسال)'}`, req.admin.id);
  res.json({ ...r, wa_link: N.waLink(o.phone, text) });
}));

router.delete('/orders/:id', A.requireOwner, (req, res) => {
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- الزبائن ----------
router.get('/customers', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  res.json(db.prepare(`SELECT phone, MAX(customer_name) name, COUNT(*) orders, COALESCE(SUM(CASE WHEN status!='cancelled' THEN total END),0) spent,
      MAX(created_at) last_order, MAX(governorate) governorate, MAX(tg_chat_id IS NOT NULL) telegram
    FROM orders WHERE customer_name LIKE ? OR phone LIKE ? GROUP BY phone ORDER BY last_order DESC LIMIT 300`).all(q, q));
});

// ---------- الرسائل ----------
router.get('/messages', (req, res) => {
  const where = req.query.status ? 'WHERE status=?' : '';
  res.json(db.prepare(`SELECT * FROM messages ${where} ORDER BY id DESC LIMIT 300`).all(...(req.query.status ? [req.query.status] : [])));
});
router.put('/messages/:id', (req, res) => {
  const st = ['new', 'read', 'replied', 'archived'].includes(req.body?.status) ? req.body.status : 'read';
  db.prepare('UPDATE messages SET status=? WHERE id=?').run(st, req.params.id);
  res.json({ ok: true });
});
router.post('/messages/:id/reply', ah(async (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'غير موجودة' });
  const text = clean(req.body?.text, 2000);
  if (!text) return res.status(400).json({ error: 'اكتب الرد.' });
  const r = await N.sendWhatsApp(m.phone, text);
  db.prepare("UPDATE messages SET status='replied', reply=? WHERE id=?").run(text, m.id);
  res.json({ ok: r.ok, error: r.error, skipped: r.skipped, wa_link: N.waLink(m.phone, text) });
}));
router.delete('/messages/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- التذكيرات ----------
router.get('/reminders', (req, res) => {
  const where = req.query.status ? 'WHERE r.status=?' : '';
  res.json(db.prepare(`SELECT r.*, o.code AS order_code, o.customer_name, o.phone FROM reminders r LEFT JOIN orders o ON o.id=r.order_id
    ${where} ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'failed' THEN 1 ELSE 2 END, r.due_at ${req.query.status === 'sent' ? 'DESC' : 'ASC'} LIMIT 300`)
    .all(...(req.query.status ? [req.query.status] : [])));
});
router.post('/reminders', (req, res) => {
  const b = req.body || {};
  const body = clean(b.body, 2000);
  if (!body) return res.status(400).json({ error: 'اكتب نص التذكير.' });
  const due = new Date(b.due_at);
  if (isNaN(due)) return res.status(400).json({ error: 'اختر موعد صحيح.' });
  let orderId = null;
  if (b.order_code) {
    const o = db.prepare('SELECT id FROM orders WHERE code=?').get(String(b.order_code).trim().toUpperCase());
    if (!o) return res.status(400).json({ error: 'ما لقينا طلب بهذا الرقم.' });
    orderId = o.id;
  } else if (b.order_id) orderId = int(b.order_id);
  const target = b.target === 'admin' ? 'admin' : 'customer';
  if (target === 'customer' && !orderId) return res.status(400).json({ error: 'تذكير الزبون لازم يرتبط برقم طلب.' });
  const id = R.addReminder({ type: 'custom', order_id: orderId, target, channel: ['all', 'telegram', 'whatsapp'].includes(b.channel) ? b.channel : 'all', title: clean(b.title, 120), body, due_at: due });
  res.json({ id });
});
router.post('/reminders/:id/send', ah(async (req, res) => {
  db.prepare("UPDATE reminders SET status='pending', due_at=?, error=NULL WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), req.params.id);
  await R.tick();
  res.json(db.prepare('SELECT * FROM reminders WHERE id=?').get(req.params.id));
}));
router.put('/reminders/:id/cancel', (req, res) => {
  db.prepare("UPDATE reminders SET status='cancelled' WHERE id=? AND status IN ('pending','failed')").run(req.params.id);
  res.json({ ok: true });
});
router.delete('/reminders/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- الإعدادات ----------
const SECRET_KEYS = ['telegram_bot_token', 'whatsapp_token'];
router.get('/settings', (req, res) => {
  const s = getSettings();
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = SECRET_KEYS.includes(k) ? (s[k] ? '••••' + s[k].slice(-4) : '') : s[k];
  res.json(out);
});
router.put('/settings', A.requireOwner, (req, res) => {
  const b = { ...(req.body || {}) };
  for (const k of SECRET_KEYS) if (typeof b[k] === 'string' && b[k].startsWith('••••')) delete b[k];
  delete b.telegram_bot_username;
  setSettings(b);
  res.json({ ok: true });
});
router.post('/settings/test', ah(async (req, res) => {
  const ch = ['telegram', 'whatsapp'].includes(req.body?.channel) ? req.body.channel : 'all';
  const r = await N.notifyAdmin(`✅ رسالة تجريبية من لوحة إدارة ${getSettings().store_name}. الإرسال شغال.`, ch);
  res.json(r);
}));
router.get('/logs', (req, res) => {
  res.json(db.prepare('SELECT * FROM notification_log ORDER BY id DESC LIMIT 100').all());
});

// ---------- المشرفين ----------
router.get('/admins', (req, res) => res.json(db.prepare('SELECT id, username, name, role, created_at FROM admins ORDER BY id').all()));
router.post('/admins', A.requireOwner, (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(String(username || ''))) return res.status(400).json({ error: 'اسم المستخدم بالإنكليزي، من 3 إلى 30 حرف.' });
  if (String(password || '').length < 8) return res.status(400).json({ error: 'كلمة السر 8 أحرف أو أكثر.' });
  try {
    db.prepare('INSERT INTO admins(username, pass_hash, name, role) VALUES (?,?,?,?)').run(username, A.hashPassword(password), clean(name, 60), role === 'owner' ? 'owner' : 'staff');
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'اسم المستخدم موجود.' }); }
});
router.delete('/admins/:id', A.requireOwner, (req, res) => {
  if (int(req.params.id) === req.admin.id) return res.status(400).json({ error: 'ما تكدر تحذف حسابك.' });
  db.prepare('DELETE FROM admins WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

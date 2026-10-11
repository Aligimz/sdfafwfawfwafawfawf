// واجهة برمجية للزبائن: المنتجات، الطلب، التتبع، المراسلة
const express = require('express');
const crypto = require('crypto');
const { db, getSettings } = require('../db');
const { serialize, serializeMany, priceWithOptions } = require('../products');
const N = require('../notify');
const R = require('../reminders');

const router = express.Router();

const GOVERNORATES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'بابل', 'الأنبار', 'ديالى', 'ذي قار', 'السليمانية', 'دهوك', 'كركوك', 'صلاح الدين', 'واسط', 'ميسان', 'الديوانية', 'المثنى', 'حلبجة'];

// حد بسيط لعدد الطلبات والرسائل من نفس العنوان
const buckets = new Map();
function limit(name, max, windowMs) {
  return (req, res, next) => {
    const key = name + ':' + req.ip;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'طلبات كثيرة من نفس الجهاز، جرب بعد شوية' });
    arr.push(now); buckets.set(key, arr);
    next();
  };
}

function normPhone(p) { return String(p || '').replace(/[^\d]/g, '').replace(/^964/, '0'); }
function validPhone(p) { return /^07\d{9}$/.test(normPhone(p)); }
function clean(s, max = 300) { return String(s ?? '').trim().slice(0, max); }

router.get('/store', (req, res) => {
  const s = getSettings();
  const cats = db.prepare(`SELECT c.id, c.slug, c.name, c.kind, c.description,
      (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) AS count
    FROM categories c WHERE c.active=1 ORDER BY c.sort, c.id`).all();
  res.json({
    store: {
      name: s.store_name, tagline: s.store_tagline, phone: s.store_phone, whatsapp: s.store_whatsapp,
      address: s.store_address, hours: s.store_hours, announcement: s.announcement,
      hero_title: s.hero_title, hero_subtitle: s.hero_subtitle,
      delivery_baghdad: Number(s.delivery_baghdad) || 0, delivery_other: Number(s.delivery_other) || 0,
      free_delivery_over: Number(s.free_delivery_over) || 0,
      telegram_bot: s.telegram_bot_username || '',
    },
    categories: cats,
    governorates: GOVERNORATES,
    brands: db.prepare("SELECT DISTINCT brand FROM products WHERE active=1 AND brand IS NOT NULL AND brand!='' ORDER BY brand").all().map((r) => r.brand),
  });
});

router.get('/products', (req, res) => {
  const where = ['p.active=1'];
  const args = [];
  if (req.query.category) { where.push('c.slug=?'); args.push(req.query.category); }
  if (req.query.kind) { where.push('c.kind=?'); args.push(req.query.kind); }
  if (req.query.condition) { where.push('p.condition=?'); args.push(req.query.condition); }
  if (req.query.brand) { where.push('p.brand=?'); args.push(req.query.brand); }
  if (req.query.featured) where.push('p.featured=1');
  if (req.query.q) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.compatible LIKE ? OR p.description LIKE ?)');
    const q = `%${clean(req.query.q, 60)}%`; args.push(q, q, q, q);
  }
  const sorts = { low: 'p.price ASC', high: 'p.price DESC', new: 'p.id DESC', pop: 'p.featured DESC, p.sold_count DESC, p.id DESC' };
  const order = sorts[req.query.sort] || sorts.pop;
  const lim = Math.min(Number(req.query.limit) || 200, 200);
  const rows = db.prepare(`SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.kind AS kind
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${lim}`).all(...args);
  res.json(serializeMany(rows));
});

router.get('/products/:id', (req, res) => {
  const p = db.prepare(`SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.kind AS kind
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
  const related = db.prepare(`SELECT p.*, c.kind AS kind FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.active=1 AND p.category_id=? AND p.id!=? ORDER BY p.featured DESC, p.sold_count DESC LIMIT 4`).all(p.category_id, p.id);
  res.json({ ...serialize(p), related: serializeMany(related) });
});

router.post('/orders', limit('order', 8, 3600e3), (req, res) => {
  const b = req.body || {};
  const c = b.customer || {};
  const name = clean(c.name, 80);
  const phone = normPhone(c.phone);
  const governorate = clean(c.governorate, 40);
  const address = clean(c.address, 300);
  const notes = clean(c.notes, 500);
  const tgUser = clean(c.telegram_username, 60);

  if (name.length < 3) return res.status(400).json({ error: 'اكتب الاسم الكامل.' });
  if (!validPhone(phone)) return res.status(400).json({ error: 'رقم الهاتف لازم يبدي بـ 07 ويكون 11 رقم.' });
  if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'السلة فارغة.' });
  if (b.items.length > 30) return res.status(400).json({ error: 'عدد المنتجات كبير، قسم الطلب.' });

  const lines = [];
  let needsAddress = false, needsTg = false;
  for (const it of b.items) {
    const p = db.prepare(`SELECT p.*, c.kind AS kind FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1`).get(it.product_id);
    if (!p) return res.status(400).json({ error: 'أحد المنتجات بالسلة ما عاد متوفر. حدّث السلة.' });
    const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
    if (p.stock < qty) return res.status(400).json({ error: `الكمية المتوفرة من ${p.name} هي ${p.stock} فقط.` });
    const { price, optionsText } = priceWithOptions(p, it.options || {});
    if (p.kind !== 'subscription' && p.kind !== 'card') needsAddress = true;
    if (p.kind === 'subscription' && /تليكرام|telegram/i.test(p.name + p.brand)) needsTg = true;
    lines.push({ p, qty, price, optionsText });
  }
  if (needsAddress && (!GOVERNORATES.includes(governorate) || address.length < 3)) {
    return res.status(400).json({ error: 'اختر المحافظة واكتب العنوان حتى يوصلك المندوب.' });
  }
  if (needsTg && tgUser.length < 3) return res.status(400).json({ error: 'اكتب معرف حساب تليكرام حتى نفعل الاشتراك عليه.' });

  const s = getSettings();
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  let delivery = 0;
  if (needsAddress) {
    delivery = governorate === 'بغداد' ? Number(s.delivery_baghdad) || 0 : Number(s.delivery_other) || 0;
    const freeOver = Number(s.free_delivery_over) || 0;
    if (freeOver && subtotal >= freeOver) delivery = 0;
  }
  const total = subtotal + delivery;
  const tgToken = crypto.randomBytes(9).toString('base64url');

  const create = db.transaction(() => {
    const info = db.prepare(`INSERT INTO orders(tg_token, customer_name, phone, governorate, address, notes, telegram_username, subtotal, delivery_fee, total)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(tgToken, name, phone, needsAddress ? governorate : null, needsAddress ? address : null, notes || null, tgUser || null, subtotal, delivery, total);
    const id = info.lastInsertRowid;
    const code = 'RK-' + (10000 + Number(id));
    db.prepare('UPDATE orders SET code=? WHERE id=?').run(code, id);
    const insItem = db.prepare('INSERT INTO order_items(order_id, product_id, name, options_text, kind, duration_days, unit_price, qty) VALUES (?,?,?,?,?,?,?,?)');
    for (const l of lines) {
      insItem.run(id, l.p.id, l.p.name, l.optionsText || null, l.p.kind, l.p.duration_days, l.price, l.qty);
      const r = db.prepare('UPDATE products SET stock=stock-?, sold_count=sold_count+? WHERE id=? AND stock>=?').run(l.qty, l.qty, l.p.id, l.qty);
      if (!r.changes) throw new Error('STOCK');
    }
    db.prepare("INSERT INTO order_events(order_id, status, note) VALUES (?, 'new', 'تم استلام الطلب من الموقع')").run(id);
    return db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  });

  let order;
  try { order = create(); } catch (e) {
    if (e.message === 'STOCK') return res.status(409).json({ error: 'نفدت الكمية من أحد المنتجات قبل شوية. حدّث السلة.' });
    throw e;
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  R.onOrderCreated(order);
  if (s.notify_admin_new_order === '1') N.notifyAdmin(N.adminNewOrderText(order, items)).catch(() => {});
  if (s.notify_customer_status === '1') N.notifyCustomer(order, N.customerStatusText(order), 'whatsapp').catch(() => {});

  res.json({
    code: order.code, total: order.total, phone: order.phone,
    telegram_link: s.telegram_bot_username ? `https://t.me/${s.telegram_bot_username}?start=${order.tg_token}` : null,
  });
});

router.get('/orders/track', (req, res) => {
  const code = clean(req.query.code, 20).toUpperCase();
  const phone = normPhone(req.query.phone);
  const order = db.prepare('SELECT * FROM orders WHERE code=?').get(code);
  if (!order || normPhone(order.phone) !== phone) {
    return res.status(404).json({ error: 'ما لقينا طلب بهذا الرقم ورقم الهاتف. تأكد منهم وجرب مرة ثانية.' });
  }
  const items = db.prepare('SELECT name, options_text, unit_price, qty, kind FROM order_items WHERE order_id=?').all(order.id);
  const events = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id=? ORDER BY id').all(order.id);
  const s = getSettings();
  res.json({
    code: order.code, status: order.status, status_label: N.STATUS[order.status],
    customer_name: order.customer_name, governorate: order.governorate, address: order.address,
    subtotal: order.subtotal, delivery_fee: order.delivery_fee, total: order.total,
    created_at: order.created_at, items, events,
    telegram_linked: !!order.tg_chat_id,
    telegram_link: s.telegram_bot_username && !order.tg_chat_id ? `https://t.me/${s.telegram_bot_username}?start=${order.tg_token}` : null,
  });
});

router.post('/messages', limit('msg', 6, 3600e3), (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), phone = normPhone(b.phone), subject = clean(b.subject, 120), body = clean(b.body, 2000);
  if (name.length < 2) return res.status(400).json({ error: 'اكتب اسمك.' });
  if (!validPhone(phone)) return res.status(400).json({ error: 'رقم الهاتف لازم يبدي بـ 07 ويكون 11 رقم.' });
  if (body.length < 5) return res.status(400).json({ error: 'اكتب رسالتك.' });
  const id = db.prepare('INSERT INTO messages(name, phone, subject, body) VALUES (?,?,?,?)').run(name, phone, subject || null, body).lastInsertRowid;
  if (getSettings().notify_admin_new_message === '1') {
    N.notifyAdmin(`✉️ <b>رسالة جديدة</b>\nمن: ${N.esc(name)} (${phone})\n${subject ? `الموضوع: ${N.esc(subject)}\n` : ''}\n${N.esc(body)}`).catch(() => {});
  }
  res.json({ ok: true, id });
});

module.exports = router;

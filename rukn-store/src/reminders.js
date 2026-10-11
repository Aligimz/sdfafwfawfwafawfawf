// التذكيرات التلقائية والمجدولة: تنفحص كل دقيقة وتنرسل بوقتها
const { db, getSetting } = require('./db');
const N = require('./notify');

function iso(d) { return new Date(d).toISOString(); }

function addReminder({ type = 'custom', order_id = null, target = 'customer', channel = 'all', title = '', body, due_at }) {
  return db.prepare(`INSERT INTO reminders(type, order_id, target, channel, title, body, due_at)
    VALUES (?,?,?,?,?,?,?)`).run(type, order_id, target, channel, title, body, iso(due_at)).lastInsertRowid;
}

function cancelPendingFor(order_id, type) {
  db.prepare("UPDATE reminders SET status='cancelled' WHERE order_id=? AND type=? AND status='pending'").run(order_id, type);
}

// بعد إنشاء الطلب: تذكير للإدارة إذا ظل الطلب بدون تأكيد
function onOrderCreated(order) {
  const mins = Number(getSetting('remind_pending_minutes')) || 0;
  if (mins > 0) {
    addReminder({
      type: 'pending_order', order_id: order.id, target: 'admin',
      title: `طلب ${order.code} بانتظار التأكيد`,
      body: `⏰ الطلب ${order.code} من ${order.customer_name} (${order.phone}) صارله ${mins} دقيقة وما انأكد.`,
      due_at: Date.now() + mins * 60e3,
    });
  }
}

// بعد تغيير الحالة: طلب تقييم بعد التسليم، وتذكير انتهاء الاشتراكات
function onStatusChanged(order) {
  if (order.status !== 'new') cancelPendingFor(order.id, 'pending_order');

  if (order.status === 'cancelled') {
    db.prepare("UPDATE reminders SET status='cancelled' WHERE order_id=? AND status='pending' AND type!='custom'").run(order.id);
    return;
  }
  if (order.status !== 'delivered') return;

  const store = getSetting('store_name');
  const reviewDays = Number(getSetting('remind_review_days')) || 0;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  const hasPhysical = items.some((i) => i.kind !== 'subscription' && i.kind !== 'card');

  cancelPendingFor(order.id, 'review_request');
  if (reviewDays > 0 && hasPhysical) {
    addReminder({
      type: 'review_request', order_id: order.id, target: 'customer',
      title: `متابعة بعد التسليم ${order.code}`,
      body: `هلا ${order.customer_name} 👋\nشلونه الجهاز وياك؟ إذا عندك أي ملاحظة أو مشكلة راسلنا، ورأيك يهمنا.\n${store}`,
      due_at: Date.now() + reviewDays * 864e5,
    });
  }

  cancelPendingFor(order.id, 'subscription_expiry');
  const before = Number(getSetting('remind_sub_before_days')) || 0;
  for (const it of items) {
    if (it.kind !== 'subscription' || !it.duration_days) continue;
    // نحسب المدة الفعلية إذا اختار الزبون مدة أطول من خيارات المنتج
    const days = durationFromOptions(it.options_text, it.duration_days);
    const expires = Date.now() + days * 864e5;
    const due = Math.max(Date.now() + 60e3, expires - before * 864e5);
    const endDate = new Date(expires).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long' });
    addReminder({
      type: 'subscription_expiry', order_id: order.id, target: 'customer',
      title: `انتهاء اشتراك ${it.name}`,
      body: `تنبيه من ${store} 🔔\nاشتراك ${it.name} مالتك ينتهي يوم ${endDate}.\nجدده هسه حتى ما ينقطع، رد على هالرسالة أو اطلب من الموقع.`,
      due_at: due,
    });
    addReminder({
      type: 'subscription_expiry', order_id: order.id, target: 'admin',
      title: `اشتراك ينتهي: ${order.customer_name}`,
      body: `🔔 اشتراك ${it.name} للزبون ${order.customer_name} (${order.phone}) ينتهي ${endDate}. طلب ${order.code}.`,
      due_at: due,
    });
  }
}

function durationFromOptions(optionsText, fallback) {
  const t = String(optionsText || '');
  if (/سنة|12 شهر/.test(t)) return 365;
  const m = t.match(/(\d+)\s*(أشهر|شهر)/);
  if (m) return Number(m[1]) * 30;
  if (/شهر/.test(t)) return 30;
  return fallback;
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const due = db.prepare("SELECT * FROM reminders WHERE status='pending' AND due_at <= ? ORDER BY due_at LIMIT 25").all(new Date().toISOString());
    for (const r of due) {
      const order = r.order_id ? db.prepare('SELECT * FROM orders WHERE id=?').get(r.order_id) : null;
      if (r.type === 'pending_order' && (!order || order.status !== 'new')) {
        db.prepare("UPDATE reminders SET status='cancelled' WHERE id=?").run(r.id);
        continue;
      }
      let res;
      if (r.target === 'admin') res = await N.notifyAdmin(r.body, r.channel);
      else if (order) res = await N.notifyCustomer(order, r.body, r.channel);
      else res = { ok: false, errors: ['لا يوجد زبون مرتبط بالتذكير'] };

      if (res.ok) {
        db.prepare("UPDATE reminders SET status='sent', sent_at=?, error=NULL WHERE id=?").run(new Date().toISOString(), r.id);
      } else {
        const err = [...(res.errors || []), ...(res.skipped || [])].join(' | ') || 'لا توجد قناة إرسال مضبوطة';
        db.prepare("UPDATE reminders SET status='failed', error=? WHERE id=?").run(err, r.id);
      }
    }
  } catch (e) {
    console.error('[reminders]', e);
  } finally {
    running = false;
  }
}

function start() {
  setInterval(tick, 60e3);
  setTimeout(tick, 5e3);
}

module.exports = { addReminder, onOrderCreated, onStatusChanged, tick, start };

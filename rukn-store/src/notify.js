// إرسال الرسائل: تليكرام (Bot API) وواتساب (WhatsApp Cloud API من ميتا)
const { db, getSetting } = require('./db');

const STATUS = {
  new: 'جديد',
  confirmed: 'تم التأكيد',
  preparing: 'قيد التجهيز',
  shipped: 'مع المندوب',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

// يحول 07xxxxxxxxx إلى 9647xxxxxxxxx للواتساب
function intlPhone(phone) {
  let p = String(phone || '').replace(/[^\d]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '964' + p.slice(1);
  if (p.length === 10 && p.startsWith('7')) p = '964' + p;
  return p;
}

function waLink(phone, text) {
  return `https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(text)}`;
}

function log(channel, target, body, ok, error) {
  try {
    db.prepare('INSERT INTO notification_log(channel, target, body, ok, error) VALUES (?,?,?,?,?)')
      .run(channel, String(target || ''), String(body || '').slice(0, 2000), ok ? 1 : 0, error ? String(error).slice(0, 500) : null);
  } catch (e) { /* ignore */ }
}

async function sendTelegram(chatId, text, opts = {}) {
  const token = getSetting('telegram_bot_token');
  if (!token) return { ok: false, error: 'لم يتم ضبط توكن بوت تليكرام', skipped: true };
  if (!chatId) return { ok: false, error: 'لا يوجد معرف محادثة', skipped: true };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...opts }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.description || `HTTP ${r.status}`);
    log('telegram', chatId, text, true);
    return { ok: true };
  } catch (e) {
    log('telegram', chatId, text, false, e.message);
    return { ok: false, error: e.message };
  }
}

async function sendWhatsApp(phone, text) {
  const token = getSetting('whatsapp_token');
  const phoneId = getSetting('whatsapp_phone_id');
  if (!token || !phoneId) return { ok: false, error: 'لم يتم ضبط واتساب', skipped: true };
  const to = intlPhone(phone);
  if (!to) return { ok: false, error: 'رقم غير صالح', skipped: true };

  // إذا عندك قالب معتمد من ميتا (مطلوب للرسائل اللي تبدأها أنت بعد 24 ساعة من آخر رسالة للزبون)
  // القالب لازم يحتوي متغير واحد {{1}} ينحط بيه نص الرسالة
  const template = getSetting('whatsapp_template_name');
  const plain = text.replace(/<[^>]+>/g, '');
  const body = template
    ? { messaging_product: 'whatsapp', to, type: 'template',
        template: { name: template, language: { code: getSetting('whatsapp_template_lang') || 'ar' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: plain.replace(/\n+/g, ' · ').slice(0, 1000) }] }] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: plain, preview_url: false } };

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`);
    log('whatsapp', to, plain, true);
    return { ok: true };
  } catch (e) {
    log('whatsapp', to, plain, false, e.message);
    return { ok: false, error: e.message };
  }
}

// يرسل للمدير على تليكرام و/أو واتساب حسب المضبوط
async function notifyAdmin(text, channel = 'all') {
  const results = [];
  if (channel === 'all' || channel === 'telegram') {
    const chat = getSetting('telegram_admin_chat_id');
    if (chat) results.push(['telegram', await sendTelegram(chat, text)]);
  }
  if (channel === 'all' || channel === 'whatsapp') {
    const num = getSetting('whatsapp_admin_number');
    if (num) results.push(['whatsapp', await sendWhatsApp(num, text)]);
  }
  return summarize(results);
}

// يرسل للزبون: تليكرام إذا ربط طلبه بالبوت، وواتساب على رقمه
async function notifyCustomer(order, text, channel = 'all') {
  const results = [];
  if ((channel === 'all' || channel === 'telegram') && order.tg_chat_id) {
    results.push(['telegram', await sendTelegram(order.tg_chat_id, text)]);
  }
  if (channel === 'all' || channel === 'whatsapp') {
    results.push(['whatsapp', await sendWhatsApp(order.phone, text)]);
  }
  return summarize(results);
}

function summarize(results) {
  const sent = results.filter(([, r]) => r.ok).map(([c]) => c);
  const errors = results.filter(([, r]) => !r.ok && !r.skipped).map(([c, r]) => `${c}: ${r.error}`);
  const skipped = results.filter(([, r]) => r.skipped).map(([c, r]) => `${c}: ${r.error}`);
  return { ok: sent.length > 0, sent, errors, skipped, none: results.length === 0 };
}

// ---------- نصوص الرسائل ----------
function siteUrl() { return (process.env.SITE_URL || '').replace(/\/$/, ''); }
function trackUrl(order) { return `${siteUrl()}/#/track/${order.code}`; }

function orderSummaryText(order, items) {
  const lines = items.map((i) => `• ${i.name}${i.options_text ? ` (${i.options_text})` : ''} × ${i.qty} = ${fmt(i.unit_price * i.qty)}`);
  return lines.join('\n');
}

function adminNewOrderText(order, items) {
  return `🛒 <b>طلب جديد ${order.code}</b>\n` +
    `الزبون: ${esc(order.customer_name)}\nالهاتف: ${esc(order.phone)}\n` +
    `المحافظة: ${esc(order.governorate || '-')}\nالعنوان: ${esc(order.address || '-')}\n` +
    (order.telegram_username ? `معرف تليكرام: ${esc(order.telegram_username)}\n` : '') +
    (order.notes ? `ملاحظات: ${esc(order.notes)}\n` : '') +
    `\n${esc(orderSummaryText(order, items))}\n\n` +
    `التوصيل: ${fmt(order.delivery_fee)}\n<b>الإجمالي: ${fmt(order.total)} د.ع</b>`;
}

function customerStatusText(order) {
  const store = getSetting('store_name');
  const map = {
    new: `استلمنا طلبك رقم ${order.code} وراح نتصل بيك قريباً للتأكيد.`,
    confirmed: `تم تأكيد طلبك رقم ${order.code}. نجهزه هسه.`,
    preparing: `طلبك رقم ${order.code} قيد التجهيز.`,
    shipped: `طلبك رقم ${order.code} طلع مع المندوب وراح يوصلك قريباً. خلي تلفونك مفتوح.`,
    delivered: `تم تسليم طلبك رقم ${order.code}. شكراً لثقتك بـ ${store}.`,
    cancelled: `تم إلغاء طلبك رقم ${order.code}. إذا عندك سؤال راسلنا.`,
  };
  const url = siteUrl() ? `\nتابع طلبك: ${trackUrl(order)}` : '';
  return `${store}\n${map[order.status] || `حالة طلبك ${order.code}: ${STATUS[order.status] || order.status}`}${url}`;
}

function esc(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

module.exports = {
  STATUS, fmt, intlPhone, waLink, sendTelegram, sendWhatsApp, notifyAdmin, notifyCustomer,
  adminNewOrderText, customerStatusText, orderSummaryText, trackUrl, esc,
};

// بوت تليكرام: يربط الزبون بطلبه (رابط /start) ويرد على أوامر بسيطة
// يشتغل بطريقة long polling فما يحتاج إعداد webhook أو https
const { db, getSetting, setSettings } = require('./db');
const N = require('./notify');

let offset = 0;
let currentToken = '';
let stopped = false;

async function api(method, body) {
  const token = getSetting('telegram_bot_token');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  return r.json();
}

async function handle(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  const store = getSetting('store_name');

  if (text.startsWith('/start')) {
    const token = text.split(/\s+/)[1];
    if (token) {
      const order = db.prepare('SELECT * FROM orders WHERE tg_token=?').get(token);
      if (order) {
        db.prepare('UPDATE orders SET tg_chat_id=? WHERE id=?').run(chatId, order.id);
        await N.sendTelegram(chatId, `أهلاً ${N.esc(order.customer_name)} 👋\nتم ربط طلبك <b>${order.code}</b> بهذا البوت. راح توصلك هنا كل تحديثات الطلب والتذكيرات.\n\nالحالة الحالية: <b>${N.STATUS[order.status] || order.status}</b>`);
        return;
      }
      await N.sendTelegram(chatId, 'الرابط غير صالح أو منتهي. تأكد منه من صفحة الطلب.');
      return;
    }
    await N.sendTelegram(chatId, `أهلاً بيك ببوت ${N.esc(store)} 👋\nتكدر تتابع طلبك بإرسال رقمه، مثلاً: <code>RK-10001</code>\n\nمعرف محادثتك: <code>${chatId}</code>`);
    return;
  }

  if (text === '/id' || text === '/myid') {
    await N.sendTelegram(chatId, `معرف هذه المحادثة: <code>${chatId}</code>\nإذا أنت صاحب المتجر، حطه بلوحة الإدارة > الإعدادات > معرف محادثة المدير.`);
    return;
  }

  // أوامر المدير
  if (chatId === String(getSetting('telegram_admin_chat_id'))) {
    if (text === '/orders' || text === '/pending') {
      const rows = db.prepare("SELECT code, customer_name, total FROM orders WHERE status IN ('new','confirmed','preparing') ORDER BY id DESC LIMIT 15").all();
      const body = rows.length ? rows.map((o) => `${o.code} · ${N.esc(o.customer_name)} · ${N.fmt(o.total)}`).join('\n') : 'ماكو طلبات مفتوحة.';
      await N.sendTelegram(chatId, `<b>الطلبات المفتوحة</b>\n${body}`);
      return;
    }
    if (text === '/today') {
      const s = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM orders WHERE date(created_at)=date('now') AND status!='cancelled'").get();
      await N.sendTelegram(chatId, `طلبات اليوم: <b>${s.n}</b>\nالمبيعات: <b>${N.fmt(s.t)} د.ع</b>`);
      return;
    }
  }

  const code = text.toUpperCase().match(/RK-?\d{4,}/);
  if (code) {
    const c = code[0].includes('-') ? code[0] : code[0].replace('RK', 'RK-');
    const order = db.prepare('SELECT * FROM orders WHERE code=?').get(c);
    if (order) {
      // ما نعرض تفاصيل شخصية، بس الحالة
      await N.sendTelegram(chatId, `طلب <b>${order.code}</b>\nالحالة: <b>${N.STATUS[order.status] || order.status}</b>`);
    } else {
      await N.sendTelegram(chatId, 'ما لقينا طلب بهذا الرقم.');
    }
    return;
  }

  await N.sendTelegram(chatId, 'أرسل رقم طلبك (مثل RK-10001) حتى أعرضلك حالته، أو راسلنا من الموقع.');
}

async function loop() {
  while (!stopped) {
    const token = getSetting('telegram_bot_token');
    if (!token) { await sleep(15000); continue; }
    try {
      if (token !== currentToken) {
        currentToken = token;
        offset = 0;
        await api('deleteWebhook', {});
        const me = await api('getMe', {});
        if (me.ok && me.result.username) setSettings({ telegram_bot_username: me.result.username });
      }
      const r = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      if (!r.ok) { await sleep(10000); continue; }
      for (const u of r.result) {
        offset = u.update_id + 1;
        if (u.message && u.message.chat) {
          try { await handle(u.message); } catch (e) { console.error('[tg handle]', e.message); }
        }
      }
    } catch (e) {
      await sleep(10000);
    }
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function start() { loop(); }
function stop() { stopped = true; }

module.exports = { start, stop };

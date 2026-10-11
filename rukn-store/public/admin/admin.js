/* لوحة الإدارة - ركن الهاتف */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toDate = (s) => (s ? new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z') : null);
  const dt = (s, opt = { dateStyle: 'medium', timeStyle: 'short' }) => { const d = toDate(s); return d ? d.toLocaleString('ar-IQ', opt) : ''; };
  const ago = (s) => {
    const d = toDate(s); if (!d) return '';
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return 'هسه'; if (m < 60) return `قبل ${m} دقيقة`;
    const h = Math.round(m / 60); if (h < 24) return `قبل ${h} ساعة`;
    return dt(s, { dateStyle: 'medium' });
  };
  const STATUS = { new: 'جديد', confirmed: 'تم التأكيد', preparing: 'قيد التجهيز', shipped: 'مع المندوب', delivered: 'تم التسليم', cancelled: 'ملغي' };
  const KINDS = { device: 'أجهزة', case: 'كفرات وحمايات', subscription: 'اشتراكات', card: 'بطاقات', accessory: 'إكسسوارات' };
  const R_TYPES = { pending_order: 'طلب غير مؤكد', review_request: 'متابعة بعد التسليم', subscription_expiry: 'انتهاء اشتراك', custom: 'مخصص' };
  const R_STATUS = { pending: 'بالانتظار', sent: 'انرسل', failed: 'فشل', cancelled: 'ملغي' };
  const st = (s, map = STATUS) => `<span class="st ${esc(s)}">${esc(map[s] || s)}</span>`;
  let ME = null;

  async function api(path, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const r = await fetch('/api/admin' + path, {
      method: opts.method || 'GET',
      headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined,
      credentials: 'same-origin',
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { showLogin(); throw new Error(j.error || 'سجل دخولك'); }
    if (!r.ok) throw new Error(j.error || 'صار خطأ');
    return j;
  }

  let tt;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 2600); }
  function openModal(title, html) { $('#mTitle').textContent = title; $('#mBody').innerHTML = html; $('#modal').hidden = false; return $('#mBody'); }
  function closeModal() { $('#modal').hidden = true; $('#mBody').innerHTML = ''; }
  $('#mClose').onclick = closeModal;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  // ---------- الدخول ----------
  function showLogin() { $('#shell').hidden = true; $('#login').hidden = false; $('#lUser').focus(); }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lErr'); err.hidden = true;
    try {
      await api('/login', { method: 'POST', body: { username: $('#lUser').value, password: $('#lPass').value } });
      $('#lPass').value = '';
      boot();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin(); };
  $('#menuBtn').onclick = () => $('#side').classList.toggle('open');

  async function refreshBadges() {
    try {
      const s = await api('/stats');
      const set = (id, n) => { const el = $('#' + id); el.textContent = n; el.hidden = !n; };
      set('nNew', s.fresh); set('nMsg', s.msgs); set('nRem', s.failed);
      return s;
    } catch { return null; }
  }

  // ---------- لوحة التحكم ----------
  async function vDashboard() {
    setTitle('لوحة التحكم', `<a class="btn primary" href="#/products/new">+ منتج جديد</a>`);
    const s = await refreshBadges();
    if (!s) return;
    const max = Math.max(1, ...s.days.map((d) => d.revenue));
    const W = 700, H = 200, pad = 28, bw = (W - pad * 2) / s.days.length;
    const bars = s.days.map((d, i) => {
      const h = Math.round((d.revenue / max) * (H - 50));
      const x = W - pad - (i + 1) * bw + 4;
      const label = new Date(d.date).getDate();
      return `<rect x="${x}" y="${H - 24 - h}" width="${bw - 8}" height="${Math.max(h, d.revenue ? 2 : 0)}" rx="4" fill="var(--accent)" opacity="${i === s.days.length - 1 ? 1 : .7}"><title>${d.date}: ${fmt(d.revenue)} د.ع، ${d.orders} طلب</title></rect>
        <text x="${x + (bw - 8) / 2}" y="${H - 8}" text-anchor="middle">${label}</text>`;
    }).join('');
    view.innerHTML = `
      ${ME.weak_password ? `<div class="banner warn"><span>كلمة سر المدير هي الافتراضية. غيّرها هسه حتى محد يدخل للوحة.</span><a class="btn sm" href="#/settings">تغيير كلمة السر</a></div>` : ''}
      ${s.failed ? `<div class="banner warn"><span>${s.failed} تذكير فشل إرساله. تأكد من إعدادات تليكرام وواتساب.</span><a class="btn sm" href="#/reminders?status=failed">عرض</a></div>` : ''}
      <div class="kpis">
        <div class="kpi"><span>مبيعات اليوم</span><b class="num">${fmt(s.today.t)}</b><small>${s.today.n} طلب</small></div>
        <div class="kpi"><span>مبيعات هذا الشهر</span><b class="num">${fmt(s.month.t)}</b><small>${s.month.n} طلب</small></div>
        <div class="kpi ${s.fresh ? 'alert' : ''}"><span>طلبات جديدة تنتظر التأكيد</span><b class="num">${s.fresh}</b><small>${s.open} طلب مفتوح بالمجموع</small></div>
        <div class="kpi"><span>رسائل جديدة</span><b class="num">${s.msgs}</b><small>${s.remindersDue} تذكير مجدول</small></div>
      </div>
      <div class="cols">
        <div class="stack">
          <div class="panel chart"><h2>المبيعات آخر 14 يوم (د.ع)</h2>
            <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="مخطط المبيعات">
              <line x1="${pad}" x2="${W - pad}" y1="${H - 24}" y2="${H - 24}" stroke="var(--line)"/>
              <line x1="${pad}" x2="${W - pad}" y1="${H - 24 - (H - 50)}" y2="${H - 24 - (H - 50)}" stroke="var(--line)" stroke-dasharray="3 4"/>
              <text x="${W - pad}" y="${H - 24 - (H - 50) - 6}" text-anchor="start">${fmt(max)}</text>
              ${bars}
            </svg>
          </div>
          <div class="panel"><h2>آخر الطلبات</h2>
            ${s.recent.length ? `<div class="tbl-wrap"><table><thead><tr><th>الطلب</th><th>الزبون</th><th>الإجمالي</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>
              ${s.recent.map((o) => `<tr class="click" data-href="#/orders/${o.id}"><td class="num">${esc(o.code)}</td><td>${esc(o.customer_name)}</td><td class="num">${fmt(o.total)}</td><td>${st(o.status)}</td><td class="muted">${ago(o.created_at)}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="empty">ماكو طلبات بعد. أول ما يطلب زبون من المتجر يطلع هنا.</div>'}
          </div>
        </div>
        <div class="stack">
          <div class="panel"><h2>الأكثر مبيعاً (30 يوم)</h2>
            ${s.top.length ? s.top.map((t) => `<div class="list-row"><span>${esc(t.name)}</span><span class="num muted">${t.q} قطعة</span></div>`).join('') : '<p class="muted">ماكو مبيعات بعد.</p>'}
          </div>
          <div class="panel"><h2>مخزون قليل</h2>
            ${s.lowStock.length ? s.lowStock.map((p) => `<div class="list-row"><a href="#/products/${p.id}">${esc(p.name)}</a><span class="num" style="color:${p.stock ? 'var(--warn)' : 'var(--bad)'}">${p.stock ? `باقي ${p.stock}` : 'نفد'}</span></div>`).join('') : '<p class="muted">كل المنتجات متوفرة بكمية جيدة.</p>'}
          </div>
          <div class="panel"><h2>حالة الطلبات</h2>
            ${s.byStatus.length ? s.byStatus.map((b) => `<div class="list-row">${st(b.status)}<span class="num">${b.n}</span></div>`).join('') : '<p class="muted">—</p>'}
          </div>
        </div>
      </div>`;
  }

  // ---------- الطلبات ----------
  async function vOrders(params) {
    setTitle('الطلبات', `<a class="btn" href="/api/admin/orders.csv">تصدير Excel</a>`);
    const state = { status: params.get('status') || '', q: params.get('q') || '', page: 1 };
    view.innerHTML = `
      <div class="toolbar">
        <input class="input" id="oq" type="search" placeholder="بحث برقم الطلب، الاسم، الهاتف" value="${esc(state.q)}">
        <div class="tabs" id="otabs">${[['', 'الكل'], ...Object.entries(STATUS)].map(([k, v]) => `<button data-s="${k}" aria-pressed="${k === state.status}">${v}</button>`).join('')}</div>
      </div>
      <div id="olist"></div>`;
    async function load() {
      const qs = new URLSearchParams({ page: state.page });
      if (state.status) qs.set('status', state.status);
      if (state.q) qs.set('q', state.q);
      const d = await api('/orders?' + qs);
      $('#olist').innerHTML = d.rows.length ? `
        <div class="tbl-wrap"><table><thead><tr><th>الطلب</th><th>الزبون</th><th>المنتجات</th><th>المحافظة</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>
        ${d.rows.map((o) => `<tr class="click" data-href="#/orders/${o.id}">
          <td class="num"><b>${esc(o.code)}</b>${o.tg_chat_id ? '<span class="sub">تليكرام ✓</span>' : ''}</td>
          <td>${esc(o.customer_name)}<span class="sub num" dir="ltr" style="text-align:right">${esc(o.phone)}</span></td>
          <td style="max-width:260px">${esc(o.items_names || '')}</td>
          <td>${esc(o.governorate || 'رقمي')}</td>
          <td class="num">${fmt(o.total)}</td><td>${st(o.status)}</td><td class="muted">${ago(o.created_at)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="pager"><button class="btn sm" id="prev" ${d.page <= 1 ? 'disabled' : ''}>السابق</button><span class="muted">صفحة ${d.page} من ${d.pages} · ${d.total} طلب</span><button class="btn sm" id="next" ${d.page >= d.pages ? 'disabled' : ''}>التالي</button></div>`
        : '<div class="empty">ماكو طلبات بهذا الفلتر.</div>';
      const p = $('#prev'), n = $('#next');
      if (p) p.onclick = () => { state.page--; load(); };
      if (n) n.onclick = () => { state.page++; load(); };
    }
    let deb;
    $('#oq').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300); };
    $('#otabs').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; state.status = b.dataset.s; state.page = 1; $$('#otabs button').forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); };
    load();
  }

  async function vOrder(id) {
    setTitle('تفاصيل الطلب', `<a class="btn" href="#/orders">← كل الطلبات</a>`);
    let o;
    try { o = await api('/orders/' + id); } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const render = () => {
      setTitle(`طلب ${o.code}`, `<a class="btn" href="#/orders">← كل الطلبات</a>`);
      const quick = {
        confirmed: `هلا ${o.customer_name}، نأكد طلبك رقم ${o.code} بقيمة ${fmt(o.total)} د.ع. راح يوصلك خلال 24 إلى 48 ساعة.`,
        shipped: `طلبك ${o.code} طلع مع المندوب. خلي تلفونك مفتوح.`,
        code: `هلا ${o.customer_name}، هذا كود التفعيل/البطاقة مالتك لطلب ${o.code}: `,
      };
      view.innerHTML = `
      <div class="cols">
        <div class="stack">
          <div class="panel">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><h2 style="margin:0">حالة الطلب</h2>${st(o.status)}</div>
            <div class="status-btns" id="stBtns">${Object.entries(STATUS).map(([k, v]) => `<button data-s="${k}" aria-pressed="${k === o.status}">${v}</button>`).join('')}</div>
            <div class="grid2" style="margin-top:12px">
              <div class="field"><label for="stNote">ملاحظة مع التغيير (اختياري)</label><input id="stNote" placeholder="مثلاً: المندوب أحمد 0780…"></div>
              <label class="check" style="align-self:end;padding-bottom:8px"><input type="checkbox" id="stNotify" checked> أبلغ الزبون بالتغيير</label>
            </div>
          </div>
          <div class="panel"><h2>المنتجات</h2>
            <div class="tbl-wrap"><table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>
              ${o.items.map((i) => `<tr><td>${esc(i.name)}${i.options_text ? `<span class="sub">${esc(i.options_text)}</span>` : ''}${i.kind === 'subscription' ? '<span class="tag">اشتراك</span>' : i.kind === 'card' ? '<span class="tag">بطاقة</span>' : ''}</td><td class="num">${i.qty}</td><td class="num">${fmt(i.unit_price)}</td><td class="num">${fmt(i.unit_price * i.qty)}</td></tr>`).join('')}
            </tbody></table></div>
            <div style="display:grid;gap:4px;margin-top:12px;max-width:320px;margin-inline-start:auto">
              <div class="list-row"><span>المجموع</span><span class="num">${fmt(o.subtotal)}</span></div>
              <div class="list-row"><span>التوصيل</span><span class="num">${o.delivery_fee ? fmt(o.delivery_fee) : 'مجاني'}</span></div>
              <div class="list-row"><b>الإجمالي</b><b class="num">${fmt(o.total)} د.ع</b></div>
            </div>
          </div>
          <div class="panel"><h2>إرسال رسالة للزبون</h2>
            <div class="tabs" style="margin-bottom:8px">
              <button data-quick="confirmed">رسالة تأكيد</button><button data-quick="shipped">طلع للتوصيل</button><button data-quick="code">إرسال كود</button>
            </div>
            <div class="field"><textarea id="msgText" placeholder="اكتب الرسالة…"></textarea></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
              <select class="input" id="msgCh" style="width:auto"><option value="all">واتساب + تليكرام</option><option value="whatsapp">واتساب فقط</option><option value="telegram" ${o.tg_chat_id ? '' : 'disabled'}>تليكرام فقط</option></select>
              <button class="btn primary" id="msgSend">إرسال</button>
              <a class="btn" id="msgWa" href="#" target="_blank" rel="noopener">فتح بواتساب يدوياً</a>
            </div>
            <p class="muted" style="font-size:12px;margin:8px 0 0">الإرسال التلقائي يحتاج ضبط واتساب أو تليكرام من الإعدادات. "فتح بواتساب يدوياً" يفتح المحادثة من تلفونك أو كمبيوترك مع الرسالة جاهزة.</p>
          </div>
          <div class="panel"><h2>سجل الطلب</h2>
            <ul class="tl">${o.events.slice().reverse().map((e) => `<li>${e.status ? `<b>${esc(STATUS[e.status] || e.status)}</b>${e.note ? ' · ' : ''}` : ''}${esc(e.note || '')}<br><span class="muted">${dt(e.created_at)}${e.admin_name ? ' · ' + esc(e.admin_name) : ''}</span></li>`).join('')}</ul>
          </div>
        </div>
        <div class="stack">
          <div class="panel"><h2>الزبون</h2>
            <dl class="kv">
              <dt>الاسم</dt><dd>${esc(o.customer_name)}</dd>
              <dt>الهاتف</dt><dd class="num" dir="ltr" style="text-align:right">${esc(o.phone)}</dd>
              ${o.governorate ? `<dt>المحافظة</dt><dd>${esc(o.governorate)}</dd><dt>العنوان</dt><dd>${esc(o.address || '')}</dd>` : ''}
              ${o.telegram_username ? `<dt>تليكرام</dt><dd dir="ltr" style="text-align:right">${esc(o.telegram_username)}</dd>` : ''}
              ${o.notes ? `<dt>ملاحظات</dt><dd>${esc(o.notes)}</dd>` : ''}
              <dt>بوت تليكرام</dt><dd>${o.tg_chat_id ? 'مربوط ✓' : 'غير مربوط'}</dd>
              <dt>تاريخ الطلب</dt><dd>${dt(o.created_at)}</dd>
              <dt>طلباته</dt><dd><a href="#/orders?q=${encodeURIComponent(o.phone)}">${o.customer_history.n} طلب · ${fmt(o.customer_history.t)} د.ع</a></dd>
            </dl>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
              <a class="btn sm" href="https://wa.me/${esc(waNum(o.phone))}" target="_blank" rel="noopener">واتساب</a>
              <a class="btn sm" href="tel:${esc(o.phone)}">اتصال</a>
              <button class="btn sm" id="editCust">تعديل البيانات</button>
            </div>
          </div>
          <div class="panel"><h2>ملاحظة داخلية</h2>
            <div class="field"><textarea id="adminNote" placeholder="ما تظهر للزبون">${esc(o.admin_note || '')}</textarea></div>
            <button class="btn sm" id="saveNote" style="margin-top:8px">حفظ الملاحظة</button>
          </div>
          <div class="panel"><h2>تذكيرات هذا الطلب</h2>
            ${o.reminders.length ? o.reminders.map((r) => `<div class="list-row"><div><b style="font-size:13px">${esc(r.title || R_TYPES[r.type])}</b><br><span class="muted" style="font-size:12px">${r.target === 'admin' ? 'للإدارة' : 'للزبون'} · ${dt(r.due_at)}</span></div>${st(r.status, R_STATUS)}</div>`).join('') : '<p class="muted">ماكو تذكيرات. التذكيرات التلقائية تنضاف عند التسليم (متابعة وانتهاء الاشتراكات).</p>'}
            <button class="btn sm" id="addRem" style="margin-top:10px">+ تذكير جديد لهذا الطلب</button>
          </div>
          ${ME.admin.role === 'owner' ? `<div class="panel"><button class="btn danger sm" id="delOrder">حذف الطلب نهائياً</button></div>` : ''}
        </div>
      </div>`;
      bind(quick);
    };
    const bind = (quick) => {
      $('#stBtns').onclick = async (e) => {
        const b = e.target.closest('[data-s]'); if (!b || b.dataset.s === o.status) return;
        if (b.dataset.s === 'cancelled' && !confirm('تأكيد إلغاء الطلب؟ الكميات ترجع للمخزن.')) return;
        $$('#stBtns button').forEach((x) => (x.disabled = true));
        try {
          const r = await api(`/orders/${o.id}/status`, { method: 'PUT', body: { status: b.dataset.s, note: $('#stNote').value, notify: $('#stNotify').checked } });
          o = r;
          let msg = `صارت الحالة: ${STATUS[o.status]}`;
          if (r.sent) msg += r.sent.ok ? ` · انرسل للزبون (${r.sent.sent.join('، ')})` : r.sent.none || r.sent.skipped?.length && !r.sent.errors.length ? ' · ما انرسل إشعار (قنوات الإرسال غير مضبوطة)' : ' · فشل إرسال الإشعار';
          toast(msg); render(); refreshBadges();
        } catch (ex) { toast(ex.message); $$('#stBtns button').forEach((x) => (x.disabled = false)); }
      };
      $$('[data-quick]').forEach((b) => b.onclick = () => { $('#msgText').value = quick[b.dataset.quick]; $('#msgText').focus(); syncWa(); });
      const syncWa = () => { $('#msgWa').href = `https://wa.me/${waNum(o.phone)}?text=${encodeURIComponent($('#msgText').value)}`; };
      $('#msgText').oninput = syncWa; syncWa();
      $('#msgSend').onclick = async () => {
        const text = $('#msgText').value.trim(); if (!text) return toast('اكتب الرسالة');
        $('#msgSend').disabled = true;
        try {
          const r = await api(`/orders/${o.id}/message`, { method: 'POST', body: { text, channel: $('#msgCh').value } });
          toast(r.ok ? `انرسلت (${r.sent.join('، ')})` : `ما انرسلت: ${[...r.errors, ...r.skipped].join(' | ') || 'لا توجد قناة مضبوطة'}. استخدم "فتح بواتساب يدوياً".`);
          if (r.ok) $('#msgText').value = '';
          o = await api('/orders/' + o.id); render();
        } catch (ex) { toast(ex.message); $('#msgSend').disabled = false; }
      };
      $('#saveNote').onclick = async () => { await api('/orders/' + o.id, { method: 'PUT', body: { governorate: o.governorate, address: o.address, admin_note: $('#adminNote').value } }); toast('انحفظت الملاحظة'); };
      $('#editCust').onclick = () => {
        const m = openModal('تعديل بيانات الزبون', `<form id="ecForm" class="grid2">
          <div class="field"><label>الاسم</label><input id="ecName" value="${esc(o.customer_name)}"></div>
          <div class="field"><label>الهاتف</label><input id="ecPhone" dir="ltr" value="${esc(o.phone)}"></div>
          <div class="field"><label>المحافظة</label><input id="ecGov" value="${esc(o.governorate || '')}"></div>
          <div class="field"><label>العنوان</label><input id="ecAddr" value="${esc(o.address || '')}"></div>
          <div class="modal-actions full"><button class="btn primary">حفظ</button></div></form>`);
        $('#ecForm', m).onsubmit = async (e) => {
          e.preventDefault();
          o = await api('/orders/' + o.id, { method: 'PUT', body: { customer_name: $('#ecName').value, phone: $('#ecPhone').value, governorate: $('#ecGov').value, address: $('#ecAddr').value, admin_note: o.admin_note } });
          closeModal(); render(); toast('انحفظت التعديلات');
        };
      };
      $('#addRem').onclick = () => reminderForm({ order_code: o.code }, async () => { o = await api('/orders/' + o.id); render(); });
      const del = $('#delOrder');
      if (del) del.onclick = async () => { if (!confirm(`حذف الطلب ${o.code} نهائياً؟ ما يرجع.`)) return; await api('/orders/' + o.id, { method: 'DELETE' }); toast('انحذف الطلب'); location.hash = '#/orders'; };
    };
    render();
  }
  function waNum(p) { let s = String(p || '').replace(/\D/g, ''); if (s.startsWith('0')) s = '964' + s.slice(1); return s; }

  // ---------- المنتجات ----------
  let CATS = [];
  async function loadCats() { CATS = await api('/categories'); return CATS; }

  async function vProducts(params) {
    setTitle('المنتجات', `<a class="btn primary" href="#/products/new">+ منتج جديد</a>`);
    await loadCats();
    const state = { category: params.get('category') || '', q: '', low: false };
    view.innerHTML = `
      <div class="toolbar">
        <input class="input" id="pq" type="search" placeholder="بحث بالاسم أو الماركة">
        <select class="input" id="pcat" style="max-width:220px"><option value="">كل الأقسام</option>${CATS.map((c) => `<option value="${c.id}" ${String(c.id) === state.category ? 'selected' : ''}>${esc(c.name)} (${c.count})</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="plow"> مخزون قليل فقط</label>
      </div>
      <div id="plist"></div>`;
    async function load() {
      const qs = new URLSearchParams();
      if (state.category) qs.set('category', state.category);
      if (state.q) qs.set('q', state.q);
      if (state.low) qs.set('low', '1');
      const rows = await api('/products?' + qs);
      $('#plist').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th></th><th>المنتج</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>مميز</th><th>ظاهر</th></tr></thead><tbody>
        ${rows.map((p) => `<tr>
          <td>${p.images[0] ? `<img class="thumb" src="${esc(p.images[0].url)}" alt="">` : '<div class="thumb"></div>'}</td>
          <td><a href="#/products/${p.id}"><b>${esc(p.name)}</b></a><span class="sub">${esc(p.brand || '')} ${p.condition === 'used' ? '<span class="tag used">مستعمل</span>' : ''} ${p.images.length ? '' : '<span class="tag">بدون صورة</span>'}</span></td>
          <td>${esc(p.category_name || '—')}</td>
          <td class="num">${fmt(p.price)}${p.old_price ? `<span class="sub"><s>${fmt(p.old_price)}</s></span>` : ''}</td>
          <td><input class="input num" type="number" min="0" value="${p.stock}" data-stock="${p.id}" style="width:80px;padding:5px 8px;${p.stock <= 3 ? 'border-color:var(--warn)' : ''}" aria-label="المخزون"></td>
          <td><input type="checkbox" data-feat="${p.id}" ${p.featured ? 'checked' : ''} aria-label="مميز"></td>
          <td><input type="checkbox" data-act="${p.id}" ${p.active ? 'checked' : ''} aria-label="ظاهر بالمتجر"></td>
        </tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">ماكو منتجات. اضغط "منتج جديد" حتى تضيف أول منتج.</div>';
    }
    $('#plist').addEventListener('change', async (e) => {
      const t = e.target;
      try {
        if (t.dataset.stock) { await api('/products/' + t.dataset.stock, { method: 'PATCH', body: { stock: t.value } }); toast('انحدث المخزون'); }
        if (t.dataset.feat) { await api('/products/' + t.dataset.feat, { method: 'PATCH', body: { featured: t.checked } }); toast(t.checked ? 'صار مميز بالرئيسية' : 'انشال من المميز'); }
        if (t.dataset.act) { await api('/products/' + t.dataset.act, { method: 'PATCH', body: { active: t.checked } }); toast(t.checked ? 'المنتج ظاهر بالمتجر' : 'المنتج مخفي'); }
      } catch (ex) { toast(ex.message); }
    });
    let deb;
    $('#pq').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300); };
    $('#pcat').onchange = (e) => { state.category = e.target.value; load(); };
    $('#plow').onchange = (e) => { state.low = e.target.checked; load(); };
    load();
  }

  async function vProductEdit(id) {
    await loadCats();
    const isNew = id === 'new';
    let p = isNew ? { name: '', brand: '', condition: 'new', price: 0, stock: 1, specs: [], options: [], images: [], active: true, featured: false, category_id: CATS[0]?.id } : await api('/products/' + id);
    let pending = []; // صور مختارة قبل الحفظ لمنتج جديد
    setTitle(isNew ? 'منتج جديد' : 'تعديل منتج', `<a class="btn" href="#/products">← المنتجات</a>`);

    const optHTML = (o, i) => `<div class="opt-row" data-opt="${i}">
      <div class="head"><input class="input" data-oname placeholder="اسم الخيار: السعة، اللون، المدة…" value="${esc(o.name)}"><button type="button" class="btn sm danger" data-odel>حذف</button></div>
      <textarea class="input" data-ovals rows="3" placeholder="كل قيمة بسطر: الاسم | الزيادة بالسعر&#10;256GB | 0&#10;512GB | 150000">${esc(o.values.map((v) => `${v.label} | ${v.delta || 0}`).join('\n'))}</textarea>
    </div>`;

    view.innerHTML = `
      <form id="pForm" class="cols" novalidate>
        <div class="stack">
          <div class="panel"><h2>المعلومات الأساسية</h2>
            <div class="grid2">
              <div class="field full"><label for="fName">اسم المنتج</label><input id="fName" value="${esc(p.name)}" required></div>
              <div class="field"><label for="fCat">القسم</label><select id="fCat">${CATS.map((c) => `<option value="${c.id}" data-kind="${c.kind}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
              <div class="field"><label for="fBrand">الماركة / الشركة</label><input id="fBrand" value="${esc(p.brand || '')}" placeholder="Apple، Samsung، Telegram…"></div>
              <div class="field"><label for="fPrice">السعر (د.ع)</label><input id="fPrice" type="number" min="0" step="250" value="${p.price}" class="num"></div>
              <div class="field"><label for="fOld">السعر قبل الخصم (اختياري)</label><input id="fOld" type="number" min="0" step="250" value="${p.old_price || ''}" class="num"></div>
              <div class="field"><label for="fStock">الكمية بالمخزن</label><input id="fStock" type="number" min="0" value="${p.stock}" class="num"><small>للاشتراكات والبطاقات حط رقم كبير مثل 999</small></div>
              <div class="field"><label for="fSku">رمز المنتج (اختياري)</label><input id="fSku" value="${esc(p.sku || '')}" dir="ltr"></div>
            </div>
          </div>
          <div class="panel" id="condPanel"><h2>الحالة</h2>
            <div class="grid2">
              <div class="field"><label for="fCond">جديد أو مستعمل</label><select id="fCond"><option value="new" ${p.condition !== 'used' ? 'selected' : ''}>جديد</option><option value="used" ${p.condition === 'used' ? 'selected' : ''}>مستعمل</option></select></div>
              <div class="field"><label for="fCondNote">وصف حالة المستعمل</label><input id="fCondNote" value="${esc(p.condition_note || '')}" placeholder="نظافة 95%، بطارية 88%، بدون صيانة"></div>
            </div>
          </div>
          <div class="panel"><h2>الصور</h2>
            <div class="imgs" id="imgs"></div>
            <input type="file" id="fileIn" accept="image/jpeg,image/png,image/webp" multiple hidden>
            <p class="muted" style="font-size:12px;margin:10px 0 0">أول صورة هي الصورة الرئيسية. اسحب الصور للمربع أو اضغط عليه. JPG أو PNG أو WEBP لحد 6 ميكا.</p>
          </div>
          <div class="panel"><h2>الخيارات (سعة، لون، مدة، فئة…)</h2>
            <div id="opts" class="stack" style="gap:10px">${p.options.map(optHTML).join('')}</div>
            <button type="button" class="btn sm" id="addOpt" style="margin-top:10px">+ إضافة خيار</button>
            <p class="muted" style="font-size:12px;margin:8px 0 0">"الزيادة" تنضاف على السعر الأساسي. أول قيمة هي الافتراضية.</p>
          </div>
          <div class="panel"><h2>الوصف والمواصفات</h2>
            <div class="field"><label for="fSpecs">المواصفات (كل وحدة بسطر)</label><textarea id="fSpecs" placeholder="شاشة 6.7 إنچ&#10;بطارية 5000mAh">${esc(p.specs.join('\n'))}</textarea></div>
            <div class="field" style="margin-top:12px"><label for="fDesc">الوصف</label><textarea id="fDesc" style="min-height:120px">${esc(p.description || '')}</textarea></div>
          </div>
        </div>
        <div class="stack">
          <div class="panel"><h2>النشر</h2>
            <label class="check"><input type="checkbox" id="fActive" ${p.active ? 'checked' : ''}> ظاهر بالمتجر</label>
            <label class="check" style="margin-top:8px"><input type="checkbox" id="fFeat" ${p.featured ? 'checked' : ''}> مميز (يطلع بالرئيسية)</label>
            <p class="err" id="pErr" hidden style="margin-top:10px"></p>
            <button class="btn primary block" id="pSave" style="margin-top:14px">${isNew ? 'إضافة المنتج' : 'حفظ التعديلات'}</button>
            ${!isNew ? `<a class="btn block" style="margin-top:8px" href="/#/p/${p.id}" target="_blank" rel="noopener">عرض بالمتجر ↗</a><button type="button" class="btn danger block" id="pDel" style="margin-top:8px">حذف المنتج</button>` : ''}
          </div>
          <div class="panel" id="casePanel"><h2>الكفرات</h2>
            <div class="field"><label for="fCompat">يناسب الموديلات</label><input id="fCompat" value="${esc(p.compatible || '')}" placeholder="iPhone 17 Pro, Galaxy S26"><small>يظهر للزبون ويدخل بالبحث</small></div>
          </div>
          <div class="panel" id="subPanel"><h2>الاشتراك</h2>
            <div class="field"><label for="fDur">مدة الاشتراك الأساسية (يوم)</label><input id="fDur" type="number" min="1" value="${p.duration_days || ''}" placeholder="30"><small>نستخدمها لإرسال تذكير قبل الانتهاء. إذا عندك خيار "المدة" (3 أشهر، سنة) تنحسب تلقائياً.</small></div>
          </div>
        </div>
      </form>`;

    const kindOf = () => $('#fCat').selectedOptions[0]?.dataset.kind;
    const syncPanels = () => {
      const k = kindOf();
      $('#condPanel').hidden = k !== 'device' && k !== 'accessory';
      $('#casePanel').hidden = k !== 'case';
      $('#subPanel').hidden = k !== 'subscription';
    };
    $('#fCat').onchange = syncPanels; syncPanels();

    function drawImgs() {
      const items = isNew ? pending.map((f, i) => ({ id: 'p' + i, url: URL.createObjectURL(f) })) : p.images;
      $('#imgs').innerHTML = items.map((im, i) => `<div class="img-item"><img src="${esc(im.url)}" alt="">${i === 0 ? '<span class="first">رئيسية</span>' : ''}
        <div class="ops">${i > 0 ? `<button type="button" data-first="${i}">رئيسية</button>` : '<span></span>'}<button type="button" data-rmimg="${i}">حذف</button></div></div>`).join('')
        + `<label class="drop" id="drop" for="fileIn">+ إضافة صور</label>`;
      const drop = $('#drop');
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); };
    }
    async function addFiles(files) {
      files = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
      if (!files.length) return toast('اختر صور JPG أو PNG أو WEBP');
      if (isNew) { pending.push(...files); drawImgs(); return; }
      const fd = new FormData(); files.forEach((f) => fd.append('images', f));
      toast('جاري رفع الصور…');
      try { p.images = await api(`/products/${p.id}/images`, { method: 'POST', body: fd }); drawImgs(); toast('انرفعت الصور'); } catch (ex) { toast(ex.message); }
    }
    $('#fileIn').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
    $('#imgs').addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rmimg]'), first = e.target.closest('[data-first]');
      if (rm) {
        const i = +rm.dataset.rmimg;
        if (isNew) { pending.splice(i, 1); drawImgs(); return; }
        if (!confirm('حذف الصورة؟')) return;
        await api('/images/' + p.images[i].id, { method: 'DELETE' }); p.images.splice(i, 1); drawImgs();
      }
      if (first) {
        const i = +first.dataset.first;
        if (isNew) { pending.unshift(pending.splice(i, 1)[0]); drawImgs(); return; }
        p.images.unshift(p.images.splice(i, 1)[0]);
        await api(`/products/${p.id}/images/order`, { method: 'PUT', body: { ids: p.images.map((x) => x.id) } }); drawImgs();
      }
    });
    drawImgs();

    $('#addOpt').onclick = () => { $('#opts').insertAdjacentHTML('beforeend', optHTML({ name: '', values: [] }, $$('#opts .opt-row').length)); };
    $('#opts').addEventListener('click', (e) => { const d = e.target.closest('[data-odel]'); if (d) d.closest('.opt-row').remove(); });

    const readOpts = () => $$('#opts .opt-row').map((row) => ({
      name: $('[data-oname]', row).value.trim(),
      values: $('[data-ovals]', row).value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, delta] = l.split('|').map((x) => x.trim()); return { label, delta: parseInt((delta || '0').replace(/[,\s]/g, ''), 10) || 0 }; }),
    })).filter((o) => o.name && o.values.length);

    $('#pForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pErr'); err.hidden = true;
      const body = {
        name: $('#fName').value, category_id: $('#fCat').value, brand: $('#fBrand').value,
        price: $('#fPrice').value, old_price: $('#fOld').value, stock: $('#fStock').value, sku: $('#fSku').value,
        condition: $('#condPanel').hidden ? 'new' : $('#fCond').value, condition_note: $('#fCondNote').value,
        compatible: $('#casePanel').hidden ? '' : $('#fCompat').value, duration_days: $('#subPanel').hidden ? '' : $('#fDur').value,
        specs: $('#fSpecs').value.split('\n'), description: $('#fDesc').value, options: readOpts(),
        active: $('#fActive').checked, featured: $('#fFeat').checked,
      };
      if (!body.name.trim()) { err.textContent = 'اكتب اسم المنتج.'; err.hidden = false; return; }
      $('#pSave').disabled = true;
      try {
        if (isNew) {
          const r = await api('/products', { method: 'POST', body });
          if (pending.length) {
            const fd = new FormData(); pending.forEach((f) => fd.append('images', f));
            await api(`/products/${r.id}/images`, { method: 'POST', body: fd }).catch((ex) => toast('انحفظ المنتج بس فشل رفع الصور: ' + ex.message));
          }
          toast('انضاف المنتج'); location.hash = '#/products/' + r.id;
        } else {
          await api('/products/' + p.id, { method: 'PUT', body });
          toast('انحفظت التعديلات'); $('#pSave').disabled = false;
        }
      } catch (ex) { err.textContent = ex.message; err.hidden = false; $('#pSave').disabled = false; }
    });
    const del = $('#pDel');
    if (del) del.onclick = async () => { if (!confirm(`حذف ${p.name} نهائياً؟ الطلبات القديمة تبقى محفوظة.`)) return; await api('/products/' + p.id, { method: 'DELETE' }); toast('انحذف المنتج'); location.hash = '#/products'; };
  }

  // ---------- الأقسام ----------
  async function vCategories() {
    setTitle('الأقسام', `<button class="btn primary" id="newCat">+ قسم جديد</button>`);
    await loadCats();
    view.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>الترتيب</th><th>القسم</th><th>النوع</th><th>المنتجات</th><th>ظاهر</th><th></th></tr></thead><tbody>
      ${CATS.map((c) => `<tr><td class="num">${c.sort}</td><td><b>${esc(c.name)}</b><span class="sub">${esc(c.description || '')}</span></td><td>${KINDS[c.kind]}</td><td class="num"><a href="#/products?category=${c.id}">${c.count}</a></td><td>${c.active ? 'نعم' : 'مخفي'}</td>
        <td><button class="btn sm" data-edit="${c.id}">تعديل</button> <button class="btn sm danger" data-del="${c.id}">حذف</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted" style="margin-top:12px;font-size:13px">"النوع" يحدد شكل المنتج بالمتجر: الأجهزة تحتاج عنوان توصيل وحالة جديد/مستعمل، الاشتراكات تنرسل لها تذكيرات قبل الانتهاء، والبطاقات والاشتراكات ما تحتاج عنوان.</p>`;
    const form = (c = { name: '', kind: 'device', description: '', sort: CATS.length + 1, active: 1, slug: '' }) => {
      const m = openModal(c.id ? 'تعديل قسم' : 'قسم جديد', `<form id="cForm" class="grid2">
        <div class="field"><label>الاسم</label><input id="cName" value="${esc(c.name)}"></div>
        <div class="field"><label>النوع</label><select id="cKind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === c.kind ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        ${c.id ? '' : '<div class="field"><label>الرابط المختصر (إنكليزي)</label><input id="cSlug" dir="ltr" placeholder="headphones"></div>'}
        <div class="field"><label>الترتيب</label><input id="cSort" type="number" value="${c.sort}"></div>
        <div class="field full"><label>وصف قصير</label><input id="cDesc" value="${esc(c.description || '')}"></div>
        <label class="check"><input type="checkbox" id="cActive" ${c.active ? 'checked' : ''}> ظاهر بالمتجر</label>
        <p class="err full" id="cErr" hidden></p>
        <div class="modal-actions full"><button class="btn primary">حفظ</button></div></form>`);
      $('#cForm', m).onsubmit = async (e) => {
        e.preventDefault();
        const body = { name: $('#cName').value, kind: $('#cKind').value, slug: $('#cSlug')?.value, sort: $('#cSort').value, description: $('#cDesc').value, active: $('#cActive').checked };
        try { await api('/categories' + (c.id ? '/' + c.id : ''), { method: c.id ? 'PUT' : 'POST', body }); closeModal(); vCategories(); toast('انحفظ القسم'); }
        catch (ex) { $('#cErr').textContent = ex.message; $('#cErr').hidden = false; }
      };
    };
    $('#newCat').onclick = () => form();
    view.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
      if (ed) form(CATS.find((c) => c.id === +ed.dataset.edit));
      if (del) { if (!confirm('حذف القسم؟')) return; try { await api('/categories/' + del.dataset.del, { method: 'DELETE' }); vCategories(); } catch (ex) { toast(ex.message); } }
    };
  }

  // ---------- الزبائن ----------
  async function vCustomers() {
    setTitle('الزبائن');
    view.innerHTML = `<div class="toolbar"><input class="input" id="cq" type="search" placeholder="بحث بالاسم أو الهاتف"></div><div id="clist"></div>`;
    async function load(q = '') {
      const rows = await api('/customers?q=' + encodeURIComponent(q));
      $('#clist').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>الزبون</th><th>الهاتف</th><th>المحافظة</th><th>الطلبات</th><th>مجموع الشراء</th><th>آخر طلب</th><th></th></tr></thead><tbody>
        ${rows.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.telegram ? '<span class="sub">تليكرام ✓</span>' : ''}</td><td class="num" dir="ltr" style="text-align:right">${esc(c.phone)}</td><td>${esc(c.governorate || '—')}</td>
          <td class="num"><a href="#/orders?q=${encodeURIComponent(c.phone)}">${c.orders}</a></td><td class="num">${fmt(c.spent)}</td><td class="muted">${ago(c.last_order)}</td>
          <td><a class="btn sm" href="https://wa.me/${esc(waNum(c.phone))}" target="_blank" rel="noopener">واتساب</a></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">ماكو زبائن بعد. كل من يطلب يطلع هنا تلقائياً.</div>';
    }
    let deb; $('#cq').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => load(e.target.value.trim()), 300); };
    load();
  }

  // ---------- الرسائل ----------
  async function vMessages() {
    setTitle('الرسائل');
    const state = { status: '' };
    view.innerHTML = `<div class="toolbar"><div class="tabs" id="mtabs">${[['', 'الكل'], ['new', 'جديدة'], ['replied', 'تم الرد'], ['archived', 'مؤرشفة']].map(([k, v]) => `<button data-s="${k}" aria-pressed="${k === ''}">${v}</button>`).join('')}</div></div><div id="mlist" class="stack"></div>`;
    async function load() {
      const rows = await api('/messages' + (state.status ? '?status=' + state.status : ''));
      $('#mlist').innerHTML = rows.length ? rows.map((m) => `<div class="panel" data-id="${m.id}">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>${esc(m.name)}</b> · <span class="num" dir="ltr">${esc(m.phone)}</span>${m.subject ? ` · <span class="muted">${esc(m.subject)}</span>` : ''}</div>
          <div style="display:flex;gap:8px;align-items:center">${st(m.status, { new: 'جديدة', read: 'مقروءة', replied: 'تم الرد', archived: 'مؤرشفة' })}<span class="muted">${ago(m.created_at)}</span></div></div>
        <p style="white-space:pre-line;margin:10px 0">${esc(m.body)}</p>
        ${m.reply ? `<p class="muted" style="border-right:3px solid var(--accent);padding-right:10px;white-space:pre-line">ردك: ${esc(m.reply)}</p>` : ''}
        <div class="field"><textarea data-reply placeholder="اكتب الرد…" style="min-height:60px"></textarea></div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn sm primary" data-send>إرسال الرد على واتساب</button>
          <a class="btn sm" data-wa href="https://wa.me/${esc(waNum(m.phone))}" target="_blank" rel="noopener">فتح واتساب يدوياً</a>
          <button class="btn sm" data-arch>${m.status === 'archived' ? 'إرجاع' : 'أرشفة'}</button>
          <button class="btn sm danger" data-delm>حذف</button>
        </div></div>`).join('') : '<div class="empty">ماكو رسائل.</div>';
      for (const m of rows.filter((x) => x.status === 'new')) api('/messages/' + m.id, { method: 'PUT', body: { status: 'read' } }).catch(() => {});
      setTimeout(refreshBadges, 500);
    }
    $('#mtabs').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; state.status = b.dataset.s; $$('#mtabs button').forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); };
    $('#mlist').addEventListener('input', (e) => {
      if (!e.target.matches('[data-reply]')) return;
      const card = e.target.closest('[data-id]'); const a = $('[data-wa]', card);
      a.href = a.href.split('?')[0] + '?text=' + encodeURIComponent(e.target.value);
    });
    $('#mlist').addEventListener('click', async (e) => {
      const card = e.target.closest('[data-id]'); if (!card) return; const id = card.dataset.id;
      if (e.target.closest('[data-send]')) {
        const text = $('[data-reply]', card).value.trim(); if (!text) return toast('اكتب الرد');
        const r = await api(`/messages/${id}/reply`, { method: 'POST', body: { text } });
        toast(r.ok ? 'انرسل الرد على واتساب' : 'واتساب غير مضبوط، انحفظ الرد. استخدم "فتح واتساب يدوياً".');
        load();
      }
      if (e.target.closest('[data-arch]')) { await api('/messages/' + id, { method: 'PUT', body: { status: e.target.textContent.includes('إرجاع') ? 'read' : 'archived' } }); load(); }
      if (e.target.closest('[data-delm]')) { if (!confirm('حذف الرسالة؟')) return; await api('/messages/' + id, { method: 'DELETE' }); load(); }
    });
    load();
  }

  // ---------- التذكيرات ----------
  function reminderForm(pre = {}, after) {
    const d = new Date(Date.now() + 864e5); d.setMinutes(0, 0, 0);
    const local = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const m = openModal('تذكير جديد', `<form id="rForm" class="grid2">
      <div class="field"><label>يوصل إلى</label><select id="rTarget"><option value="customer">الزبون</option><option value="admin">الإدارة (أنا)</option></select></div>
      <div class="field"><label>رقم الطلب</label><input id="rOrder" dir="ltr" placeholder="RK-10001" value="${esc(pre.order_code || '')}"><small>مطلوب إذا التذكير للزبون</small></div>
      <div class="field"><label>موعد الإرسال</label><input id="rDue" type="datetime-local" value="${local}"></div>
      <div class="field"><label>القناة</label><select id="rCh"><option value="all">واتساب + تليكرام</option><option value="whatsapp">واتساب</option><option value="telegram">تليكرام</option></select></div>
      <div class="field full"><label>عنوان (لك فقط)</label><input id="rTitle" placeholder="مثلاً: تجديد نتفلكس"></div>
      <div class="field full"><label>نص الرسالة</label><textarea id="rBody" placeholder="هلا، نذكرك إن اشتراكك ينتهي بعد 3 أيام…"></textarea></div>
      <div class="full" style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-dur="1">بعد ساعة</button><button type="button" class="btn sm" data-dur="24">بعد يوم</button>
        <button type="button" class="btn sm" data-dur="168">بعد أسبوع</button><button type="button" class="btn sm" data-dur="${24 * 27}">بعد 27 يوم</button>
      </div>
      <p class="err full" id="rErr" hidden></p>
      <div class="modal-actions full"><button class="btn primary">جدولة التذكير</button></div></form>`);
    $$('[data-dur]', m).forEach((b) => b.onclick = () => { const t = new Date(Date.now() + b.dataset.dur * 3600e3); $('#rDue').value = new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
    $('#rForm', m).onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/reminders', { method: 'POST', body: { target: $('#rTarget').value, order_code: $('#rOrder').value.trim(), due_at: new Date($('#rDue').value).toISOString(), channel: $('#rCh').value, title: $('#rTitle').value, body: $('#rBody').value } });
        closeModal(); toast('انجدول التذكير'); after && after();
      } catch (ex) { $('#rErr').textContent = ex.message; $('#rErr').hidden = false; }
    };
  }

  async function vReminders(params) {
    setTitle('التذكيرات', `<button class="btn primary" id="newRem">+ تذكير جديد</button>`);
    const state = { status: params.get('status') || 'pending' };
    view.innerHTML = `
      <div class="banner info"><span>التذكيرات التلقائية: الطلب اللي ما انأكد خلال المدة المحددة ينبهك، وبعد التسليم ترسل رسالة متابعة للزبون، وقبل انتهاء أي اشتراك ينرسل تذكير للزبون وإلك. تنضبط المدد من الإعدادات.</span></div>
      <div class="toolbar"><div class="tabs" id="rtabs">${Object.entries(R_STATUS).map(([k, v]) => `<button data-s="${k}" aria-pressed="${k === state.status}">${v}</button>`).join('')}<button data-s="" aria-pressed="${!state.status}">الكل</button></div></div>
      <div id="rlist"></div>`;
    async function load() {
      const rows = await api('/reminders' + (state.status ? '?status=' + state.status : ''));
      $('#rlist').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>التذكير</th><th>إلى</th><th>الطلب</th><th>الموعد</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td style="max-width:340px"><b>${esc(r.title || R_TYPES[r.type])}</b><span class="sub" style="white-space:pre-line">${esc(r.body.slice(0, 160))}</span>${r.error ? `<span class="sub" style="color:var(--bad)">${esc(r.error)}</span>` : ''}</td>
          <td>${r.target === 'admin' ? 'الإدارة' : esc(r.customer_name || 'الزبون')}<span class="sub">${{ all: 'واتساب + تليكرام', whatsapp: 'واتساب', telegram: 'تليكرام' }[r.channel]}</span></td>
          <td>${r.order_code ? `<a href="#/orders/${r.order_id}" class="num">${esc(r.order_code)}</a>` : '—'}</td>
          <td class="muted">${dt(r.sent_at || r.due_at)}</td><td>${st(r.status, R_STATUS)}<span class="sub">${R_TYPES[r.type]}</span></td>
          <td style="white-space:nowrap">${r.status === 'pending' || r.status === 'failed' ? `<button class="btn sm" data-now="${r.id}">إرسال هسه</button> <button class="btn sm" data-cancel="${r.id}">إلغاء</button>` : `<button class="btn sm danger" data-del="${r.id}">حذف</button>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">ماكو تذكيرات هنا.</div>';
    }
    $('#rtabs').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; state.status = b.dataset.s; $$('#rtabs button').forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); };
    $('#rlist').onclick = async (e) => {
      const now = e.target.closest('[data-now]'), c = e.target.closest('[data-cancel]'), d = e.target.closest('[data-del]');
      try {
        if (now) { now.disabled = true; const r = await api(`/reminders/${now.dataset.now}/send`, { method: 'POST' }); toast(r.status === 'sent' ? 'انرسل التذكير' : `ما انرسل: ${r.error || ''}`); refreshBadges(); }
        if (c) await api(`/reminders/${c.dataset.cancel}/cancel`, { method: 'PUT' });
        if (d) await api(`/reminders/${d.dataset.del}`, { method: 'DELETE' });
        load();
      } catch (ex) { toast(ex.message); }
    };
    $('#newRem').onclick = () => reminderForm({}, load);
    load();
  }

  // ---------- الإعدادات ----------
  async function vSettings() {
    setTitle('الإعدادات');
    const s = await api('/settings');
    const admins = await api('/admins');
    const owner = ME.admin.role === 'owner';
    const f = (k, label, opts = {}) => `<div class="field ${opts.full ? 'full' : ''}"><label for="s_${k}">${label}</label>${opts.area
      ? `<textarea id="s_${k}" data-k="${k}">${esc(s[k])}</textarea>`
      : `<input id="s_${k}" data-k="${k}" value="${esc(s[k])}" ${opts.ltr ? 'dir="ltr"' : ''} ${opts.type ? `type="${opts.type}"` : ''} ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''}>`}${opts.help ? `<small>${opts.help}</small>` : ''}</div>`;
    const tog = (k, label) => `<label class="check"><input type="checkbox" data-k="${k}" data-bool ${s[k] === '1' ? 'checked' : ''}> ${label}</label>`;
    view.innerHTML = `
      <div class="cols">
        <form class="stack" id="sForm" novalidate>
          <div class="panel"><h2>معلومات المتجر</h2><div class="grid2">
            ${f('store_name', 'اسم المتجر')}${f('store_tagline', 'وصف قصير')}
            ${f('store_phone', 'رقم الهاتف المعروض', { ltr: true })}${f('store_whatsapp', 'رقم واتساب للزبائن', { ltr: true, ph: '9647701234567', help: 'بالصيغة الدولية بدون + أو أصفار بالبداية' })}
            ${f('store_address', 'العنوان')}${f('store_hours', 'أوقات الدوام')}
            ${f('announcement', 'شريط الإعلان أعلى الموقع', { full: true })}
            ${f('hero_title', 'عنوان الصفحة الرئيسية', { full: true })}${f('hero_subtitle', 'النص تحت العنوان', { full: true, area: true })}
          </div></div>
          <div class="panel"><h2>التوصيل</h2><div class="grid3">
            ${f('delivery_baghdad', 'أجور بغداد', { type: 'number' })}${f('delivery_other', 'أجور المحافظات', { type: 'number' })}${f('free_delivery_over', 'توصيل مجاني فوق مبلغ', { type: 'number', help: '0 = بدون' })}
          </div></div>
          <div class="panel"><h2>الإشعارات والتذكيرات</h2>
            <div class="stack" style="gap:8px">${tog('notify_admin_new_order', 'أبلغني بكل طلب جديد')}${tog('notify_admin_new_message', 'أبلغني بكل رسالة جديدة')}${tog('notify_customer_status', 'أبلغ الزبون عند تغيير حالة طلبه')}</div>
            <div class="grid3" style="margin-top:14px">
              ${f('remind_pending_minutes', 'نبهني إذا الطلب ما انأكد بعد (دقيقة)', { type: 'number', help: '0 = إيقاف' })}
              ${f('remind_review_days', 'رسالة متابعة للزبون بعد التسليم (يوم)', { type: 'number', help: '0 = إيقاف' })}
              ${f('remind_sub_before_days', 'تذكير قبل انتهاء الاشتراك (يوم)', { type: 'number' })}
            </div>
          </div>
          <div class="panel"><h2>تليكرام</h2>
            <p class="muted" style="margin-top:-6px;font-size:13px">اعمل بوت من <span dir="ltr">@BotFather</span> وحط التوكن هنا. بعدها افتح البوت من حسابك وأرسل <span dir="ltr">/id</span> حتى يعطيك معرف المحادثة.</p>
            <div class="grid2">
              ${f('telegram_bot_token', 'توكن البوت', { ltr: true, ph: '123456:ABC-DEF…' })}
              ${f('telegram_admin_chat_id', 'معرف محادثة المدير (أو الكروب)', { ltr: true, ph: '123456789', help: 'الطلبات والتنبيهات توصل هنا' })}
            </div>
            <p class="muted" style="font-size:13px;margin:10px 0 0">${s.telegram_bot_username ? `البوت المربوط: <b dir="ltr">@${esc(s.telegram_bot_username)}</b>. الزبائن يربطون طلباتهم بيه من صفحة نجاح الطلب.` : 'ما مربوط بوت بعد.'}</p>
            <button type="button" class="btn sm" data-test="telegram" style="margin-top:10px">إرسال رسالة تجريبية</button>
          </div>
          <div class="panel"><h2>واتساب (WhatsApp Cloud API)</h2>
            <p class="muted" style="margin-top:-6px;font-size:13px">من حساب Meta for Developers، سوي تطبيق WhatsApp وانسخ التوكن الدائم ومعرف رقم الهاتف. رسائل الطلبات اللي الزبون ما راسلك قبلها بـ24 ساعة تحتاج قالب معتمد.</p>
            <div class="grid2">
              ${f('whatsapp_token', 'التوكن (Access Token)', { ltr: true })}${f('whatsapp_phone_id', 'Phone Number ID', { ltr: true })}
              ${f('whatsapp_admin_number', 'رقم المدير لاستلام التنبيهات', { ltr: true, ph: '9647701234567' })}
              ${f('whatsapp_template_name', 'اسم القالب المعتمد (اختياري)', { ltr: true, help: 'قالب بيه متغير واحد {{1}}، ينحط بيه نص الرسالة' })}
              ${f('whatsapp_template_lang', 'لغة القالب', { ltr: true, ph: 'ar' })}
            </div>
            <button type="button" class="btn sm" data-test="whatsapp" style="margin-top:10px">إرسال رسالة تجريبية</button>
          </div>
          ${owner ? '<button class="btn primary" id="sSave">حفظ الإعدادات</button>' : '<p class="muted">تعديل الإعدادات للمدير الرئيسي فقط.</p>'}
        </form>
        <div class="stack">
          <div class="panel"><h2>تغيير كلمة السر</h2>
            <form id="pwForm" class="stack" style="gap:10px">
              <div class="field"><label>كلمة السر الحالية</label><input id="pwCur" type="password" autocomplete="current-password"></div>
              <div class="field"><label>كلمة السر الجديدة</label><input id="pwNew" type="password" autocomplete="new-password"><small>8 أحرف أو أكثر</small></div>
              <button class="btn">تغيير</button>
            </form>
          </div>
          <div class="panel"><h2>المشرفين</h2>
            ${admins.map((a) => `<div class="list-row"><div><b>${esc(a.name || a.username)}</b><br><span class="muted" dir="ltr">${esc(a.username)}</span> · <span class="muted">${a.role === 'owner' ? 'مدير رئيسي' : 'موظف'}</span></div>${owner && a.id !== ME.admin.id ? `<button class="btn sm danger" data-deladmin="${a.id}">حذف</button>` : ''}</div>`).join('')}
            ${owner ? `<form id="adForm" class="stack" style="gap:8px;margin-top:12px">
              <div class="grid2"><input class="input" id="adUser" placeholder="اسم المستخدم" dir="ltr"><input class="input" id="adName" placeholder="الاسم"></div>
              <div class="grid2"><input class="input" id="adPass" type="password" placeholder="كلمة السر" autocomplete="new-password"><select class="input" id="adRole"><option value="staff">موظف</option><option value="owner">مدير رئيسي</option></select></div>
              <button class="btn sm">+ إضافة مشرف</button></form>` : ''}
            <p class="muted" style="font-size:12px;margin:10px 0 0">الموظف يدير الطلبات والمنتجات والرسائل، وما يكدر يغير الإعدادات أو يحذف طلبات.</p>
          </div>
          <div class="panel"><h2>سجل الإرسال</h2><div id="logs" class="muted">…</div></div>
        </div>
      </div>`;

    const form = $('#sForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {};
      $$('[data-k]', form).forEach((el) => { body[el.dataset.k] = el.hasAttribute('data-bool') ? (el.checked ? '1' : '0') : el.value; });
      try { await api('/settings', { method: 'PUT', body }); toast('انحفظت الإعدادات'); boot(true); } catch (ex) { toast(ex.message); }
    });
    $$('[data-test]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await api('/settings/test', { method: 'POST', body: { channel: b.dataset.test } });
        toast(r.ok ? 'انرسلت الرسالة التجريبية ✓' : `ما انرسلت: ${[...r.errors, ...r.skipped].join(' | ') || 'احفظ الإعدادات وتأكد من المعرف/الرقم'}`);
      } catch (ex) { toast(ex.message); }
      b.disabled = false; loadLogs();
    });
    $('#pwForm').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/me/password', { method: 'PUT', body: { current: $('#pwCur').value, next: $('#pwNew').value } }); toast('تغيرت كلمة السر'); $('#pwCur').value = $('#pwNew').value = ''; ME.weak_password = false; }
      catch (ex) { toast(ex.message); }
    };
    const ad = $('#adForm');
    if (ad) ad.onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/admins', { method: 'POST', body: { username: $('#adUser').value, name: $('#adName').value, password: $('#adPass').value, role: $('#adRole').value } }); toast('انضاف المشرف'); vSettings(); }
      catch (ex) { toast(ex.message); }
    };
    view.onclick = async (e) => {
      const d = e.target.closest('[data-deladmin]');
      if (d && confirm('حذف المشرف؟')) { await api('/admins/' + d.dataset.deladmin, { method: 'DELETE' }); vSettings(); }
    };
    async function loadLogs() {
      const logs = await api('/logs');
      $('#logs').innerHTML = logs.length ? logs.slice(0, 20).map((l) => `<div class="list-row" style="font-size:12px"><span>${l.channel === 'telegram' ? 'تليكرام' : 'واتساب'} → <span dir="ltr">${esc(l.target)}</span>${l.error ? `<br><span style="color:var(--bad)">${esc(l.error)}</span>` : ''}</span><span>${l.ok ? '✓' : '✗'} ${ago(l.created_at)}</span></div>`).join('') : 'ماكو رسائل منرسلة بعد.';
    }
    loadLogs();
  }

  // ---------- التوجيه ----------
  function setTitle(t, actions = '') { $('#pageTitle').textContent = t; $('#barActions').innerHTML = actions; document.title = `${t} · لوحة الإدارة`; }
  view.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,input')) location.hash = tr.dataset.href; });

  async function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [pathPart, query] = h.split('?');
    const [a, b] = pathPart.split('/');
    const params = new URLSearchParams(query || '');
    $$('#nav a').forEach((x) => x.classList.toggle('on', x.dataset.r === (a || '')));
    $('#side').classList.remove('open');
    closeModal();
    view.onclick = null;
    view.innerHTML = '<p class="muted">جاري التحميل…</p>';
    try {
      if (!a) await vDashboard();
      else if (a === 'orders') await (b ? vOrder(b) : vOrders(params));
      else if (a === 'products') await (b ? vProductEdit(b) : vProducts(params));
      else if (a === 'categories') await vCategories();
      else if (a === 'customers') await vCustomers();
      else if (a === 'messages') await vMessages();
      else if (a === 'reminders') await vReminders(params);
      else if (a === 'settings') await vSettings();
      else view.innerHTML = '<div class="empty">الصفحة غير موجودة.</div>';
    } catch (ex) {
      if (!$('#shell').hidden) view.innerHTML = `<div class="empty">${esc(ex.message)}</div>`;
    }
  }

  let started = false;
  async function boot(soft) {
    try { ME = await api('/me'); } catch { return showLogin(); }
    $('#login').hidden = true; $('#shell').hidden = false;
    $('#sName').textContent = ME.store_name;
    $('#who').textContent = `${ME.admin.name || ME.admin.username} · ${ME.admin.role === 'owner' ? 'مدير' : 'موظف'}`;
    if (soft) return;
    if (!started) { started = true; window.addEventListener('hashchange', route); setInterval(refreshBadges, 60000); }
    refreshBadges();
    route();
  }
  boot();
})();

/* ركن الهاتف - واجهة المتجر (صفحة واحدة بتوجيه عبر #) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $('#app');
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IQD = (n) => `<b class="num">${fmt(n)}</b> <small>د.ع</small>`;

  let STORE = null, CATS = [], GOVS = [];

  async function api(path, opts = {}) {
    const r = await fetch('/api' + path, {
      ...opts,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'صار خطأ، جرب مرة ثانية.');
    return j;
  }

  // ---------- رسومات بديلة إذا المنتج بدون صورة ----------
  const PALETTES = [['#3b4a63', '#151c28'], ['#c46a32', '#6e3410'], ['#6c7f6a', '#2c3a2b'], ['#7d5ba6', '#3d2760'], ['#2f6f8f', '#123446'], ['#9c958a', '#58534b'], ['#8f3b4a', '#3e141d'], ['#2c6e5a', '#0d2a21']];
  function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function art(p) {
    const [c1, c2] = PALETTES[hash(p.name) % PALETTES.length];
    const kind = p.kind || 'device';
    const st = `style="--c1:${c1};--c2:${c2}"`;
    if (kind === 'case') return `<div class="art-case" ${st}></div>`;
    if (kind === 'card') return `<div class="art-card" ${st}>${esc((p.brand || p.name).slice(0, 10))}</div>`;
    if (kind === 'subscription') return `<div class="art-sub" ${st}>${esc((p.brand || p.name).slice(0, 2))}</div>`;
    if (kind === 'accessory') return `<div class="art-acc" ${st}></div>`;
    return `<div class="art-phone" ${st}></div>`;
  }
  const media = (p, cls = '') => p.images && p.images.length
    ? `<img src="${esc(p.images[0].url)}" alt="${esc(p.name)}" loading="lazy" class="${cls}">`
    : art(p);

  // ---------- السلة ----------
  const CART_KEY = 'rk_cart_v1';
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); if (!Array.isArray(cart)) cart = []; } catch { cart = []; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} updateCount(); };
  const cartCount = () => cart.reduce((a, i) => a + i.qty, 0);
  const cartSubtotal = () => cart.reduce((a, i) => a + i.price * i.qty, 0);
  function updateCount() { $('#cartCount').textContent = cartCount(); }

  function computePrice(p, chosen) {
    let price = p.price; const labels = [];
    for (const o of p.options || []) {
      const v = o.values.find((x) => x.label === chosen[o.name]) || o.values[0];
      if (!v) continue; price += Number(v.delta) || 0; labels.push(`${o.name}: ${v.label}`);
    }
    return { price, text: labels.join('، ') };
  }

  function addToCart(p, chosen, qty = 1) {
    const { price, text } = computePrice(p, chosen);
    const key = p.id + '|' + JSON.stringify(chosen);
    const ex = cart.find((i) => i.key === key);
    const inCart = cart.filter((i) => i.id === p.id).reduce((a, i) => a + i.qty, 0);
    if (inCart + qty > p.stock) { toast(`المتوفر من هذا المنتج ${p.stock} فقط`); return false; }
    if (ex) ex.qty += qty;
    else cart.push({ key, id: p.id, name: p.name, options: chosen, optionsText: text, price, qty, kind: p.kind, image: p.images?.[0]?.url || null, brand: p.brand, stock: p.stock });
    saveCart();
    const b = $('#openCart'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    toast('انضاف للسلة ✓');
    return true;
  }

  function cartThumb(i) { return i.image ? `<img src="${esc(i.image)}" alt="">` : art({ name: i.name, kind: i.kind, brand: i.brand }); }

  function drawCart() {
    const body = $('#cartItems'), foot = $('#cartFoot');
    if (!cart.length) {
      body.innerHTML = `<div class="empty" style="margin-top:20px">السلة فارغة.<br>تصفح الأقسام وضيف اللي يعجبك.</div>`;
      foot.innerHTML = `<a class="btn ghost block" href="#/" data-close>رجوع للمتجر</a>`;
      return;
    }
    body.innerHTML = cart.map((i, ix) => `
      <div class="ci">
        <div class="thumb">${cartThumb(i)}</div>
        <div><b>${esc(i.name)}</b>${i.optionsText ? `<span>${esc(i.optionsText)}</span><br>` : ''}<span class="num">${fmt(i.price)} د.ع</span>
          <div style="margin-top:4px"><button class="rm" data-rm="${ix}">حذف</button></div></div>
        <div class="qty"><button data-q="1" data-ix="${ix}" aria-label="زيادة">+</button><span class="num">${i.qty}</span><button data-q="-1" data-ix="${ix}" aria-label="تقليل">−</button></div>
      </div>`).join('');
    foot.innerHTML = `
      <div class="line"><span>المجموع</span><span class="num">${fmt(cartSubtotal())} د.ع</span></div>
      <p class="muted" style="margin:0;font-size:13px">أجور التوصيل تنحسب بصفحة إتمام الطلب حسب المحافظة.</p>
      <a class="btn primary block" href="#/checkout" data-close>إتمام الطلب</a>`;
  }
  $('#cartItems').addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]'), rm = e.target.closest('[data-rm]');
    if (q) {
      const i = cart[+q.dataset.ix];
      const next = i.qty + Number(q.dataset.q);
      const total = cart.filter((x) => x.id === i.id).reduce((a, x) => a + x.qty, 0);
      if (q.dataset.q === '1' && i.stock && total >= i.stock) { toast(`المتوفر ${i.stock} فقط`); return; }
      if (next < 1) cart.splice(+q.dataset.ix, 1); else i.qty = next;
      saveCart(); drawCart();
    }
    if (rm) { cart.splice(+rm.dataset.rm, 1); saveCart(); drawCart(); }
  });
  function openCart() { drawCart(); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; }
  function closeCart() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; }
  $('#openCart').onclick = openCart; $('#closeCart').onclick = closeCart; $('#scrim').onclick = closeCart;
  $('#drawer').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeCart(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

  let tt;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 2200); }

  // ---------- عناصر مشتركة ----------
  const KIND_LABEL = { device: 'أجهزة', case: 'كفرات', subscription: 'اشتراكات', card: 'بطاقات', accessory: 'إكسسوارات' };
  function card(p) {
    const badges = [];
    if (p.stock <= 0) badges.push('<span class="badge out">نفد</span>');
    if (p.condition === 'used') badges.push('<span class="badge used">مستعمل</span>');
    else if (p.kind === 'device') badges.push('<span class="badge new">جديد</span>');
    if (p.old_price && p.old_price > p.price) badges.push(`<span class="badge sale">خصم ${Math.round((1 - p.price / p.old_price) * 100)}%</span>`);
    const from = (p.options || []).some((o) => o.values.some((v) => v.delta > 0)) ? '<small>يبدأ من</small> ' : '';
    const note = p.condition === 'used' ? p.condition_note : (p.kind === 'case' ? (p.compatible ? 'يناسب: ' + p.compatible : '') : (p.specs || []).slice(0, 2).join(' · '));
    return `<a class="card" href="#/p/${p.id}">
      <div class="media">${media(p)}<div class="badges">${badges.join('')}</div></div>
      <div class="info">
        <div class="brand">${esc(p.brand || '')}</div>
        <h3>${esc(p.name)}</h3>
        ${note ? `<div class="note">${esc(note)}</div>` : ''}
        <div class="price">${from}${IQD(p.price)}${p.old_price && p.old_price > p.price ? `<s class="num">${fmt(p.old_price)}</s>` : ''}</div>
      </div></a>`;
  }
  const skeletons = (n = 8) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');

  const ICON = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3 5 14h6l-1 7 8-11h-6z"/></svg>',
    tg: '<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 6.8-1.6 7.7c-.1.5-.4.7-.9.4l-2.5-1.8-1.2 1.2c-.1.1-.3.2-.5.2l.2-2.6 4.7-4.3c.2-.2 0-.3-.3-.1l-5.8 3.7-2.5-.8c-.5-.2-.5-.5.1-.8l9.8-3.8c.5-.2.9.1.5 1Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10"/></svg>',
  };

  // ---------- الصفحات ----------
  async function viewHome() {
    const byKind = (k) => CATS.find((c) => c.kind === k);
    const newC = CATS.find((c) => c.slug === 'phones-new') || byKind('device');
    const usedC = CATS.find((c) => c.slug === 'phones-used');
    const tiles = [];
    if (newC) tiles.push(`<a class="tile big" href="#/c/${newC.slug}"><div class="art" style="top:18px;left:26px;width:40%;display:flex;gap:10px;align-items:flex-start"><div class="art-phone" style="width:48%;--c1:#e6e1d6;--c2:#9c958a;transform:rotate(-6deg)"></div><div class="art-phone" style="width:48%;--c1:#5b6f7d;--c2:#1d2830;margin-top:18px;transform:rotate(5deg)"></div></div><b>${esc(newC.name)}</b><span>${esc(newC.description || '')}</span></a>`);
    if (usedC) tiles.push(`<a class="tile mid" href="#/c/${usedC.slug}"><b>${esc(usedC.name)}</b><span>${esc(usedC.description || '')}</span></a>`);
    for (const c of CATS.filter((c) => c !== newC && c !== usedC).slice(0, 4)) {
      tiles.push(`<a class="tile ${tiles.length === 2 ? 'mid' : 'sm'}" href="#/c/${c.slug}"><b>${esc(c.name)}</b><span>${c.count} منتج</span></a>`);
    }
    const subs = byKind('subscription'), cards = byKind('card');

    app.innerHTML = `
      <section class="hero wrap">
        <div class="hero-grid">
          <div>
            <div class="eyebrow">${esc(STORE.tagline)}</div>
            <h1>${esc(STORE.hero_title)}</h1>
            <p class="lead">${esc(STORE.hero_subtitle)}</p>
            <div class="cta">
              ${newC ? `<a class="btn primary" href="#/c/${newC.slug}">تصفح الأجهزة</a>` : ''}
              <a class="btn ghost" href="#/track">تتبع طلبك</a>
            </div>
            <div class="trust">
              <div><strong>ضمان</strong><span>على كل جهاز نبيعه</span></div>
              <div><strong class="num">18</strong><span>محافظة نوصلها</span></div>
              <div><strong>دقائق</strong><span>لتفعيل الاشتراكات</span></div>
            </div>
          </div>
          <div class="tiles">${tiles.join('')}</div>
        </div>
      </section>
      <div class="wrap">
        <div class="perks">
          <div class="perk">${ICON.shield}<div><b>أصلي ومضمون</b><span>جديد بضمان الوكيل، ومستعمل بضمان المحل</span></div></div>
          <div class="perk">${ICON.truck}<div><b>توصيل لكل العراق</b><span>${STORE.delivery_baghdad ? `بغداد ${fmt(STORE.delivery_baghdad)}` : 'بغداد مجاناً'}، المحافظات ${fmt(STORE.delivery_other)}</span></div></div>
          <div class="perk">${ICON.cash}<div><b>الدفع عند الاستلام</b><span>تفحص الجهاز وبعدين تدفع</span></div></div>
          <div class="perk">${ICON.bolt}<div><b>تفعيل فوري</b><span>للاشتراكات والبطاقات</span></div></div>
        </div>
        <section class="section"><div class="sec-head"><div><h2>الأكثر طلباً</h2><p>اختيارات زباينا هالأسبوع</p></div></div><div class="grid" id="featGrid">${skeletons(4)}</div></section>
        ${usedC ? `<section class="section"><div class="sec-head"><div><h2>${esc(usedC.name)}</h2><p>${esc(usedC.description || '')}</p></div><a href="#/c/${usedC.slug}">عرض الكل ←</a></div><div class="grid" id="usedGrid">${skeletons(4)}</div></section>` : ''}
        ${subs ? `<div class="band"><div><h2>${esc(subs.name)} وبطاقات</h2><p>تليكرام بريميوم، نتفلكس، شاهد، آيتونز، شدات ببجي ورصيد. تطلب وتوصلك خلال دقائق، ونذكرك قبل ما ينتهي اشتراكك.</p>
          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn primary" href="#/c/${subs.slug}">الاشتراكات</a>${cards ? `<a class="btn ghost" style="color:inherit;border-color:currentColor" href="#/c/${cards.slug}">البطاقات</a>` : ''}</div></div>
          <div class="subs" id="subsMini"></div></div>` : ''}
        ${byKind('case') ? `<section class="section"><div class="sec-head"><div><h2>${esc(byKind('case').name)}</h2><p>${esc(byKind('case').description || '')}</p></div><a href="#/c/${byKind('case').slug}">عرض الكل ←</a></div><div class="grid" id="caseGrid">${skeletons(4)}</div></section>` : ''}
      </div>`;

    const [feat, used, subsL, cases] = await Promise.all([
      api('/products?featured=1&limit=8'),
      usedC ? api(`/products?category=${usedC.slug}&limit=4`) : [],
      subs ? api(`/products?category=${subs.slug}&limit=6`) : [],
      byKind('case') ? api(`/products?category=${byKind('case').slug}&limit=4`) : [],
    ]).catch(() => [[], [], [], []]);
    const fill = (id, list) => { const el = $('#' + id); if (el) el.innerHTML = list.length ? list.map(card).join('') : '<div class="empty">ماكو منتجات هنا بعد.</div>'; };
    fill('featGrid', feat); fill('usedGrid', used); fill('caseGrid', cases);
    const sm = $('#subsMini');
    if (sm) sm.innerHTML = subsL.slice(0, 6).map((p) => `<a class="sub" href="#/p/${p.id}"><b>${esc(p.name)}</b><span class="num">${fmt(p.price)} د.ع</span></a>`).join('');
  }

  async function viewList({ slug, q }) {
    const cat = slug ? CATS.find((c) => c.slug === slug) : null;
    if (slug && !cat) return viewNotFound();
    const isDevice = cat && cat.kind === 'device';
    const state = { brand: '', sort: 'pop', condition: '' };
    app.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="crumbs"><a href="#/">الرئيسية</a><span>/</span><span>${cat ? esc(cat.name) : 'نتائج البحث'}</span></div>
          <h1>${cat ? esc(cat.name) : `نتائج البحث عن "${esc(q)}"`}</h1>
          ${cat && cat.description ? `<p>${esc(cat.description)}</p>` : ''}
        </div>
        <div class="filters">
          <div class="chips" id="brandChips"></div>
          ${!cat ? `<div class="seg" id="condSeg"><button aria-pressed="true" data-c="">الكل</button><button aria-pressed="false" data-c="new">جديد</button><button aria-pressed="false" data-c="used">مستعمل</button></div>` : ''}
          <select id="sortSel" aria-label="ترتيب"><option value="pop">الأكثر طلباً</option><option value="new">الأحدث</option><option value="low">السعر: من الأقل</option><option value="high">السعر: من الأعلى</option></select>
        </div>
        <p class="muted" id="countLine" style="margin:-6px 0 12px;font-size:13px"></p>
        <div class="grid" id="grid">${skeletons(8)}</div>
      </div>`;
    let all = [];
    async function load() {
      const qs = new URLSearchParams();
      if (cat) qs.set('category', cat.slug);
      if (q) qs.set('q', q);
      if (state.condition) qs.set('condition', state.condition);
      qs.set('sort', state.sort);
      all = await api('/products?' + qs).catch(() => []);
      const brands = [...new Set(all.map((p) => p.brand).filter(Boolean))];
      $('#brandChips').innerHTML = brands.length > 1 ? ['', ...brands].map((b) => `<button class="chip" data-b="${esc(b)}" aria-pressed="${b === state.brand}">${b ? esc(b) : 'الكل'}</button>`).join('') : '';
      render();
    }
    function render() {
      const list = state.brand ? all.filter((p) => p.brand === state.brand) : all;
      $('#countLine').textContent = `${list.length} منتج`;
      $('#grid').innerHTML = list.length ? list.map(card).join('') : `<div class="empty">ما لقينا منتجات. ${q ? 'جرب كلمة ثانية.' : ''}</div>`;
    }
    $('#brandChips').addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; state.brand = b.dataset.b; $$('#brandChips .chip').forEach((c) => c.setAttribute('aria-pressed', c === b)); render(); });
    $('#sortSel').onchange = (e) => { state.sort = e.target.value; load(); };
    const seg = $('#condSeg');
    if (seg) seg.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; state.condition = b.dataset.c; $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', x === b)); load(); });
    void isDevice;
    load();
  }

  async function viewProduct(id) {
    app.innerHTML = `<div class="wrap"><div class="pdp"><div class="skeleton" style="aspect-ratio:1"></div><div></div></div></div>`;
    let p;
    try { p = await api('/products/' + id); } catch { return viewNotFound(); }
    const chosen = {};
    for (const o of p.options) chosen[o.name] = o.values[0]?.label;
    let qty = 1, imgIx = 0;
    const isSub = p.kind === 'subscription', isCard = p.kind === 'card';
    document.title = `${p.name} | ${STORE.name}`;

    function render() {
      const { price } = computePrice(p, chosen);
      const old = p.old_price && p.old_price > p.price ? p.old_price + (price - p.price) : null;
      const out = p.stock <= 0;
      app.innerHTML = `
      <div class="wrap">
        <div class="crumbs" style="padding-top:20px"><a href="#/">الرئيسية</a><span>/</span><a href="#/c/${esc(p.category_slug)}">${esc(p.category_name || '')}</a><span>/</span><span>${esc(p.name)}</span></div>
        <div class="pdp">
          <div class="gallery">
            <div class="main">${p.images.length ? `<img src="${esc(p.images[imgIx].url)}" alt="${esc(p.name)}">` : art(p).replace(/width:\d+%/, '')}</div>
            ${p.images.length > 1 ? `<div class="thumbs">${p.images.map((im, i) => `<button data-img="${i}" aria-pressed="${i === imgIx}" aria-label="صورة ${i + 1}"><img src="${esc(im.url)}" alt=""></button>`).join('')}</div>` : ''}
          </div>
          <div>
            <div class="muted" style="font-weight:500">${esc(p.brand || '')}</div>
            <h1>${esc(p.name)}</h1>
            <div class="price-big">${IQD(price)}${old ? `<s class="num">${fmt(old)}</s>` : ''}</div>
            ${p.condition === 'used' ? `<div class="cond used"><b>مستعمل</b><span>${esc(p.condition_note || 'مفحوص بالكامل')}</span></div>`
              : p.kind === 'device' ? `<div class="cond"><b>جديد</b><span>بكارتونه مع ضمان الوكيل</span></div>` : ''}
            ${p.compatible ? `<p class="muted" style="margin-top:-6px">يناسب: ${esc(p.compatible)}</p>` : ''}
            ${p.options.map((o) => `<div class="opt"><h4>${esc(o.name)}</h4><div class="opt-vals">${o.values.map((v) => `<button data-o="${esc(o.name)}" data-v="${esc(v.label)}" aria-pressed="${chosen[o.name] === v.label}">${esc(v.label)}${v.delta > 0 ? `<small class="num">+${fmt(v.delta)}</small>` : ''}</button>`).join('')}</div></div>`).join('')}
            <div class="buy-row">
              ${!isSub && !isCard ? `<div class="qty"><button id="qPlus" aria-label="زيادة">+</button><span class="num" id="qVal">${qty}</span><button id="qMinus" aria-label="تقليل">−</button></div>` : ''}
              <button class="btn primary" id="addBtn" style="flex:1" ${out ? 'disabled' : ''}>${out ? 'نفدت الكمية' : 'أضف للسلة'}</button>
              <button class="btn dark" id="buyBtn" ${out ? 'disabled' : ''}>اطلب الآن</button>
            </div>
            <div class="stock-line ${p.stock > 0 && p.stock <= 3 ? 'low' : ''}">${out ? 'غير متوفر حالياً، راسلنا حتى نبلغك من يتوفر.' : p.stock <= 3 ? `باقي ${p.stock} فقط` : 'متوفر'}</div>
            ${p.specs.length ? `<ul class="spec-list">${p.specs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
            ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
            <div class="assure">
              ${isSub || isCard ? `<div>${ICON.bolt.replace('<svg', '<svg width="20" height="20"')}التفعيل خلال دقائق من تأكيد الطلب</div>` : `<div>${ICON.truck.replace('<svg', '<svg width="20" height="20"')}توصيل خلال 24 إلى 48 ساعة</div>`}
              <div>${ICON.cash.replace('<svg', '<svg width="20" height="20"')}الدفع عند الاستلام${isSub || isCard ? ' أو تحويل' : ''}</div>
              ${isSub ? `<div>${ICON.shield.replace('<svg', '<svg width="20" height="20"')}نذكرك قبل انتهاء الاشتراك</div>` : `<div>${ICON.shield.replace('<svg', '<svg width="20" height="20"')}${p.condition === 'used' ? 'ضمان المحل 3 أشهر' : 'ضمان واستبدال حسب السياسة'}</div>`}
            </div>
          </div>
        </div>
        ${p.related.length ? `<section class="section"><div class="sec-head"><h2>منتجات مشابهة</h2></div><div class="grid">${p.related.map(card).join('')}</div></section>` : ''}
      </div>`;
      bind();
    }
    function bind() {
      $$('[data-o]').forEach((b) => b.onclick = () => { chosen[b.dataset.o] = b.dataset.v; render(); });
      $$('[data-img]').forEach((b) => b.onclick = () => { imgIx = +b.dataset.img; render(); });
      const plus = $('#qPlus'), minus = $('#qMinus');
      if (plus) plus.onclick = () => { if (qty < p.stock) { qty++; $('#qVal').textContent = qty; } };
      if (minus) minus.onclick = () => { if (qty > 1) { qty--; $('#qVal').textContent = qty; } };
      $('#addBtn').onclick = () => addToCart(p, { ...chosen }, qty);
      $('#buyBtn').onclick = () => { if (addToCart(p, { ...chosen }, qty)) location.hash = '#/checkout'; };
    }
    render();
  }

  async function viewCheckout() {
    if (!cart.length) {
      app.innerHTML = `<div class="wrap"><div class="success"><h1>السلة فارغة</h1><p class="muted">ضيف منتجات للسلة حتى تكمل الطلب.</p><a class="btn primary" href="#/">تصفح المتجر</a></div></div>`;
      return;
    }
    // نحدث الأسعار والكميات من الخادم قبل العرض
    const fresh = await Promise.all(cart.map((i) => api('/products/' + i.id).catch(() => null)));
    let changed = false;
    cart = cart.filter((i, ix) => {
      const p = fresh[ix];
      if (!p) { changed = true; return false; }
      const { price, text } = computePrice(p, i.options);
      if (price !== i.price) changed = true;
      Object.assign(i, { price, optionsText: text, stock: p.stock, kind: p.kind, name: p.name });
      if (i.qty > p.stock) { i.qty = p.stock; changed = true; }
      return i.qty > 0;
    });
    saveCart();
    if (!cart.length) return viewCheckout();

    const needsAddress = cart.some((i) => i.kind !== 'subscription' && i.kind !== 'card');
    const needsTg = cart.some((i) => i.kind === 'subscription' && /تليكرام|telegram/i.test(i.name + (i.brand || '')));
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem('rk_checkout') || '{}'); } catch {}

    app.innerHTML = `
      <div class="wrap">
        <div class="page-head"><div class="crumbs"><a href="#/">الرئيسية</a><span>/</span><span>إتمام الطلب</span></div><h1>إتمام الطلب</h1></div>
        ${changed ? '<p class="err" style="margin-bottom:10px">تحدثت بعض الأسعار أو الكميات بالسلة حسب المتوفر حالياً. راجعها قبل التأكيد.</p>' : ''}
        <div class="two" style="padding-top:0">
          <form class="panel" id="coForm" novalidate>
            <h2>معلوماتك</h2>
            <div class="form-grid">
              <div class="field"><label for="fName">الاسم الكامل</label><input id="fName" autocomplete="name" value="${esc(draft.name || '')}" required></div>
              <div class="field"><label for="fPhone">رقم الهاتف</label><input id="fPhone" inputmode="tel" dir="ltr" style="text-align:right" placeholder="07xxxxxxxxx" value="${esc(draft.phone || '')}" required><small>نتصل بيك عليه لتأكيد الطلب، ونرسل التحديثات على واتساب</small></div>
              ${needsAddress ? `
              <div class="field"><label for="fGov">المحافظة</label><select id="fGov">${GOVS.map((g) => `<option ${g === (draft.governorate || 'بغداد') ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
              <div class="field"><label for="fAddr">العنوان</label><input id="fAddr" placeholder="المنطقة، الشارع، أقرب نقطة دالة" value="${esc(draft.address || '')}"></div>` : ''}
              ${needsTg ? `<div class="field full"><label for="fTg">معرف حساب تليكرام</label><input id="fTg" dir="ltr" style="text-align:right" placeholder="@username" value="${esc(draft.telegram_username || '')}"><small>نفعّل الاشتراك على هذا الحساب. ما نحتاج كلمة السر.</small></div>` : ''}
              <div class="field full"><label for="fNotes">ملاحظات (اختياري)</label><textarea id="fNotes" style="min-height:70px" placeholder="مثلاً: اتصلوا بعد الساعة 4">${esc(draft.notes || '')}</textarea></div>
            </div>
            <div class="pay" style="margin-top:16px">${ICON.cash.replace('<svg', '<svg width="24" height="24"')}<div><b>الدفع عند الاستلام</b><br><span class="muted">${needsAddress ? 'تدفع للمندوب بعد ما تستلم وتفحص طلبك.' : 'نتواصل وياك لتأكيد الطلب وطريقة الدفع.'}</span></div></div>
            <p class="err" id="coErr" hidden style="margin-top:12px"></p>
            <button class="btn primary block" id="coBtn" style="margin-top:14px">تأكيد الطلب</button>
          </form>
          <aside class="panel summary">
            <h2>ملخص الطلب</h2>
            ${cart.map((i) => `<div class="row"><div class="n">${esc(i.name)} × ${i.qty}${i.optionsText ? `<small>${esc(i.optionsText)}</small>` : ''}</div><span class="num">${fmt(i.price * i.qty)}</span></div>`).join('')}
            <div class="line" style="margin-top:12px"><span>المجموع</span><span class="num">${fmt(cartSubtotal())} د.ع</span></div>
            <div class="line" style="margin-top:6px"><span>التوصيل</span><span class="num" id="delLine"></span></div>
            <div class="line total" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><span>الإجمالي</span><span class="num" id="totLine"></span></div>
          </aside>
        </div>
      </div>`;

    function delivery() {
      if (!needsAddress) return 0;
      const gov = $('#fGov')?.value || 'بغداد';
      if (STORE.free_delivery_over && cartSubtotal() >= STORE.free_delivery_over) return 0;
      return gov === 'بغداد' ? STORE.delivery_baghdad : STORE.delivery_other;
    }
    function totals() {
      const d = delivery();
      $('#delLine').textContent = d ? fmt(d) + ' د.ع' : 'مجاني';
      $('#totLine').textContent = fmt(cartSubtotal() + d) + ' د.ع';
    }
    totals();
    if ($('#fGov')) $('#fGov').onchange = totals;

    const val = (id) => ($('#' + id)?.value || '').trim();
    $('#coForm').addEventListener('input', () => {
      try { localStorage.setItem('rk_checkout', JSON.stringify({ name: val('fName'), phone: val('fPhone'), governorate: val('fGov'), address: val('fAddr'), telegram_username: val('fTg') })); } catch {}
    });
    $('#coForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#coErr'); err.hidden = true;
      const phone = val('fPhone').replace(/\s|-/g, '');
      let msg = '';
      if (val('fName').length < 3) msg = 'اكتب اسمك الكامل.';
      else if (!/^07\d{9}$/.test(phone)) msg = 'رقم الهاتف لازم يبدي بـ 07 ويكون 11 رقم.';
      else if (needsAddress && val('fAddr').length < 3) msg = 'اكتب العنوان وأقرب نقطة دالة حتى يوصلك المندوب.';
      else if (needsTg && val('fTg').length < 3) msg = 'اكتب معرف حساب تليكرام.';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      const btn = $('#coBtn'); btn.disabled = true; btn.textContent = 'جاري إرسال الطلب…';
      try {
        const r = await api('/orders', { method: 'POST', body: {
          customer: { name: val('fName'), phone, governorate: val('fGov'), address: val('fAddr'), notes: val('fNotes'), telegram_username: val('fTg') },
          items: cart.map((i) => ({ product_id: i.id, qty: i.qty, options: i.options })),
        } });
        try { sessionStorage.setItem('rk_last_order', JSON.stringify(r)); } catch {}
        cart = []; saveCart();
        location.hash = '#/success/' + r.code;
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
        btn.disabled = false; btn.textContent = 'تأكيد الطلب';
      }
    });
  }

  function viewSuccess(code) {
    let info = {};
    try { info = JSON.parse(sessionStorage.getItem('rk_last_order') || '{}'); } catch {}
    const tg = info.code === code ? info.telegram_link : null;
    app.innerHTML = `
      <div class="wrap"><div class="success">
        <div class="tick">${ICON.check}</div>
        <h1>وصلنا طلبك، شكراً إلك</h1>
        <p class="muted">راح نتصل بيك خلال ساعة لتأكيد الطلب. احتفظ برقم الطلب حتى تتابعه.</p>
        <div class="code-box"><span class="num" id="codeTxt">${esc(code)}</span><button type="button" id="copyCode">نسخ</button></div>
        ${info.code === code ? `<p>الإجمالي: <b class="num">${fmt(info.total)} د.ع</b></p>` : ''}
        ${tg ? `<a class="tg-card" href="${esc(tg)}" target="_blank" rel="noopener">${ICON.tg}<div><b>تابع طلبك على تليكرام</b><br><span class="muted">اضغط هنا وافتح البوت، وراح توصلك تحديثات الطلب وتذكير قبل انتهاء الاشتراكات.</span></div></a>` : ''}
        <div style="display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap">
          <a class="btn primary" href="#/track/${esc(code)}">تتبع الطلب</a>
          <a class="btn ghost" href="#/">رجوع للمتجر</a>
        </div>
      </div></div>`;
    $('#copyCode').onclick = () => {
      navigator.clipboard?.writeText(code).then(() => toast('انسخ رقم الطلب')).catch(() => {
        const r = document.createRange(); r.selectNodeContents($('#codeTxt')); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
    };
  }

  const FLOW = ['new', 'confirmed', 'preparing', 'shipped', 'delivered'];
  const STATUS = { new: 'استلمنا الطلب', confirmed: 'تم التأكيد', preparing: 'قيد التجهيز', shipped: 'مع المندوب', delivered: 'تم التسليم', cancelled: 'ملغي' };

  function viewTrack(code) {
    let lastPhone = '';
    try { lastPhone = JSON.parse(localStorage.getItem('rk_checkout') || '{}').phone || ''; } catch {}
    app.innerHTML = `
      <div class="wrap">
        <div class="page-head"><h1>تتبع طلبك</h1><p>اكتب رقم الطلب ورقم الهاتف اللي طلبت بيه.</p></div>
        <div class="two" style="padding-top:0">
          <div>
            <form class="panel" id="trForm" novalidate>
              <div class="form-grid">
                <div class="field"><label for="tCode">رقم الطلب</label><input id="tCode" dir="ltr" style="text-align:right" placeholder="RK-10001" value="${esc(code || '')}"></div>
                <div class="field"><label for="tPhone">رقم الهاتف</label><input id="tPhone" inputmode="tel" dir="ltr" style="text-align:right" placeholder="07xxxxxxxxx" value="${esc(lastPhone)}"></div>
              </div>
              <p class="err" id="tErr" hidden style="margin-top:10px"></p>
              <button class="btn primary" style="margin-top:14px">عرض حالة الطلب</button>
            </form>
            <div id="trOut"></div>
          </div>
          <aside class="panel"><h2>محتاج مساعدة؟</h2><p class="muted">إذا عندك سؤال عن طلبك راسلنا على واتساب أو من صفحة المراسلة، واذكر رقم الطلب.</p>
            <p class="num" dir="ltr" style="text-align:right;font-size:18px">${esc(STORE.phone)}</p><a class="btn ghost" href="#/contact">راسلنا</a></aside>
        </div>
      </div>`;
    async function go() {
      const err = $('#tErr'); err.hidden = true;
      const c = $('#tCode').value.trim().toUpperCase(), ph = $('#tPhone').value.replace(/\s|-/g, '');
      if (!c || !ph) { err.textContent = 'اكتب رقم الطلب ورقم الهاتف.'; err.hidden = false; return; }
      try {
        const o = await api(`/orders/track?code=${encodeURIComponent(c)}&phone=${encodeURIComponent(ph)}`);
        const cur = FLOW.indexOf(o.status);
        const steps = o.status === 'cancelled'
          ? `<li class="cancel"><b>تم إلغاء الطلب</b><span>${esc(o.events.at(-1)?.note || '')}</span></li>`
          : FLOW.map((s, i) => {
            const ev = [...o.events].reverse().find((e) => e.status === s);
            return `<li class="${i < cur ? 'done' : i === cur ? (s === 'delivered' ? 'done' : 'cur') : ''}"><b>${STATUS[s]}</b>${ev ? `<span class="num">${new Date(ev.created_at.replace(' ', 'T') + 'Z').toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' })}</span>` : ''}</li>`;
          }).join('');
        $('#trOut').innerHTML = `
          <div class="panel" style="margin-top:16px">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><h2 style="margin:0" class="num">${esc(o.code)}</h2><span class="status-pill ${o.status === 'cancelled' ? 'cancelled' : ''}">${esc(o.status_label)}</span></div>
            <ul class="timeline">${steps}</ul>
            <div class="summary" style="margin-top:10px">
              ${o.items.map((i) => `<div class="row"><div class="n">${esc(i.name)} × ${i.qty}${i.options_text ? `<small>${esc(i.options_text)}</small>` : ''}</div><span class="num">${fmt(i.unit_price * i.qty)}</span></div>`).join('')}
              <div class="line" style="margin-top:8px"><span>التوصيل</span><span class="num">${o.delivery_fee ? fmt(o.delivery_fee) : 'مجاني'}</span></div>
              <div class="line total" style="margin-top:6px"><span>الإجمالي</span><span class="num">${fmt(o.total)} د.ع</span></div>
            </div>
            ${o.telegram_link ? `<a class="tg-card" href="${esc(o.telegram_link)}" target="_blank" rel="noopener">${ICON.tg}<div><b>وصّل التحديثات على تليكرام</b><br><span class="muted">افتح البوت واضغط Start.</span></div></a>` : o.telegram_linked ? '<p class="muted" style="margin-top:12px">✓ طلبك مربوط بتليكرام وراح توصلك التحديثات هناك.</p>' : ''}
          </div>`;
      } catch (ex) { err.textContent = ex.message; err.hidden = false; $('#trOut').innerHTML = ''; }
    }
    $('#trForm').addEventListener('submit', (e) => { e.preventDefault(); go(); });
    if (code && lastPhone) go();
  }

  function viewContact() {
    app.innerHTML = `
      <div class="wrap">
        <div class="page-head"><h1>راسلنا</h1><p>اسأل عن جهاز غير موجود، اطلب حجز، أو بلغنا بأي مشكلة. نرد عليك على واتساب.</p></div>
        <div class="two" style="padding-top:0">
          <form class="panel" id="ctForm" novalidate>
            <div class="form-grid">
              <div class="field"><label for="cName">الاسم</label><input id="cName" autocomplete="name"></div>
              <div class="field"><label for="cPhone">رقم الهاتف</label><input id="cPhone" inputmode="tel" dir="ltr" style="text-align:right" placeholder="07xxxxxxxxx"></div>
              <div class="field full"><label for="cSubject">الموضوع</label><select id="cSubject"><option>سؤال عن جهاز</option><option>طلب جهاز غير متوفر</option><option>بيع جهازي المستعمل</option><option>مشكلة بطلب</option><option>ضمان وصيانة</option><option>غير ذلك</option></select></div>
              <div class="field full"><label for="cBody">الرسالة</label><textarea id="cBody"></textarea></div>
            </div>
            <p class="err" id="cErr" hidden style="margin-top:10px"></p>
            <button class="btn primary" id="cBtn" style="margin-top:14px">إرسال الرسالة</button>
          </form>
          <aside class="panel">
            <h2>معلومات المحل</h2>
            <p class="muted">${esc(STORE.address)}</p>
            <p class="muted">${esc(STORE.hours)}</p>
            <p class="num" dir="ltr" style="text-align:right;font-size:18px">${esc(STORE.phone)}</p>
            ${STORE.whatsapp ? `<a class="btn ghost" href="https://wa.me/${esc(STORE.whatsapp)}" target="_blank" rel="noopener">واتساب مباشر</a>` : ''}
            ${STORE.telegram_bot ? `<a class="btn ghost" style="margin-inline-start:8px" href="https://t.me/${esc(STORE.telegram_bot)}" target="_blank" rel="noopener">بوت تليكرام</a>` : ''}
          </aside>
        </div>
      </div>`;
    $('#ctForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#cErr'); err.hidden = true;
      const btn = $('#cBtn'); btn.disabled = true;
      try {
        await api('/messages', { method: 'POST', body: { name: $('#cName').value, phone: $('#cPhone').value.replace(/\s|-/g, ''), subject: $('#cSubject').value, body: $('#cBody').value } });
        $('#ctForm').innerHTML = `<div class="success" style="margin:10px auto"><div class="tick">${ICON.check}</div><h2>وصلت رسالتك</h2><p class="muted">راح نرد عليك قريباً على رقمك.</p></div>`;
      } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
    });
  }

  function viewPolicy() {
    app.innerHTML = `<div class="wrap prose">
      <h1>الضمان والاستبدال</h1>
      <h2>الأجهزة الجديدة</h2><p>كل الأجهزة الجديدة أصلية بكارتونها، مع ضمان الوكيل لمدة سنة. إذا ظهر عيب مصنعي خلال 7 أيام من الاستلام نبدله بجهاز جديد.</p>
      <h2>الأجهزة المستعملة</h2><p>نفحص كل جهاز مستعمل قبل البيع ونكتب حالته بوضوح (النظافة، صحة البطارية، أي صيانة سابقة). عليها ضمان المحل 3 أشهر ضد العيوب الفنية.</p>
      <h2>الاشتراكات والبطاقات</h2><p>نفعّل الاشتراك على حسابك خلال دقائق من تأكيد الطلب. البطاقات الرقمية ما تنرجع بعد إرسال الكود. نرسلك تذكير قبل انتهاء الاشتراك حتى تجدده.</p>
      <h2>التوصيل والدفع</h2><p>نوصل لكل المحافظات خلال 24 إلى 48 ساعة، والدفع عند الاستلام. تكدر تفحص الطلب قدام المندوب قبل ما تدفع.</p>
    </div>`;
  }

  function viewNotFound() {
    app.innerHTML = `<div class="wrap"><div class="success"><h1>الصفحة غير موجودة</h1><p class="muted">يمكن انحذف المنتج أو الرابط غلط.</p><a class="btn primary" href="#/">الرئيسية</a></div></div>`;
  }

  // ---------- التوجيه ----------
  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [pathPart, query] = h.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    document.title = STORE ? STORE.name : 'ركن الهاتف';
    $$('#catNav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + pathPart));
    window.scrollTo(0, 0);
    closeCart();
    const [a, b] = parts;
    if (!a) return viewHome();
    if (a === 'c') return viewList({ slug: decodeURIComponent(b || '') });
    if (a === 'search') { const q = new URLSearchParams(query).get('q') || ''; $('#searchInput').value = q; return viewList({ q }); }
    if (a === 'p') return viewProduct(b);
    if (a === 'checkout') return viewCheckout();
    if (a === 'success') return viewSuccess(decodeURIComponent(b || ''));
    if (a === 'track') return viewTrack(decodeURIComponent(b || ''));
    if (a === 'contact') return viewContact();
    if (a === 'policy') return viewPolicy();
    viewNotFound();
  }

  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
  });

  async function init() {
    updateCount();
    try {
      const d = await api('/store');
      STORE = d.store; CATS = d.categories; GOVS = d.governorates;
    } catch {
      app.innerHTML = '<div class="wrap"><div class="success"><h1>ما كدرنا نحمل المتجر</h1><p class="muted">تأكد من الإنترنت وحدّث الصفحة.</p></div></div>';
      return;
    }
    for (const id of ['storeName', 'footName', 'footName2']) $('#' + id).textContent = STORE.name;
    $('#footTagline').textContent = STORE.tagline;
    $('#footAddress').textContent = STORE.address;
    $('#footHours').textContent = STORE.hours;
    $('#footPhone').textContent = STORE.phone;
    $('#year').textContent = new Date().getFullYear();
    if (STORE.announcement) { $('#notice').textContent = STORE.announcement; $('#notice').hidden = false; }
    if (STORE.whatsapp) { const w = $('#waFloat'); w.href = 'https://wa.me/' + STORE.whatsapp; w.hidden = false; }
    const social = [];
    if (STORE.whatsapp) social.push(`<a href="https://wa.me/${esc(STORE.whatsapp)}" target="_blank" rel="noopener">واتساب</a>`);
    if (STORE.telegram_bot) social.push(`<a href="https://t.me/${esc(STORE.telegram_bot)}" target="_blank" rel="noopener">تليكرام</a>`);
    $('#footSocial').innerHTML = social.join('');
    const nav = CATS.map((c) => `<a href="#/c/${esc(c.slug)}">${esc(c.name)}</a>`).join('');
    $('#catNav').innerHTML = `<a href="#/">الرئيسية</a>${nav}<a href="#/track">تتبع طلبك</a><a href="#/contact">راسلنا</a>`;
    $('#footCats').innerHTML = nav;
    window.addEventListener('hashchange', route);
    route();
  }
  init();
})();

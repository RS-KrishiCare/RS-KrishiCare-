// RS KrishiCare public shop. Talks only to public views and safe database functions.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const root = $('#shop');
const S = { products: [], cats: [], banners: [], cat: '', q: '', user: null, profile: null, recovery: false };
let slideTimer = null;

/* ---------- cart (kept in this phone's browser) ---------- */
const loadCart = () => { try { return JSON.parse(localStorage.getItem('rsk_cart') || '{}'); } catch (_) { return {}; } };
const saveCart = c => { localStorage.setItem('rsk_cart', JSON.stringify(c)); badge(); };
const cartItems = () => Object.entries(loadCart()).map(([id, q]) => ({ p: S.products.find(x => x.id === id), q })).filter(x => x.p && x.q > 0);
const cartTotal = () => cartItems().reduce((s, x) => s + x.q * Number(x.p.price), 0);
function badge() { const n = cartItems().reduce((s, x) => s + x.q, 0), b = $('#cart-count'); b.textContent = n; b.hidden = !n; }
function addToCart(id, n = 1, silent = false) { const c = loadCart(); c[id] = Math.min(99, (c[id] || 0) + n); saveCart(c); if (!silent) toast('Added to cart'); }
function setQty(id, q) { const c = loadCart(); if (q <= 0) delete c[id]; else c[id] = Math.min(99, q); saveCart(c); }

function toast(m, type = '') { const d = document.createElement('div'); d.textContent = m; if (type) d.className = type; $('#toast').appendChild(d); setTimeout(() => d.remove(), 4200); }
const errText = e => { const m = (e && e.message) || String(e); return /Failed to fetch|NetworkError|Load failed/i.test(m) ? 'Network problem. Please check your connection and try again.' : m; };
const STATUS = { New: ['Order received', 'amb'], Confirmed: ['Confirmed', ''], Processing: ['Being prepared', ''], Packed: ['Being prepared', ''], Shipped: ['On the way', ''], Delivered: ['Delivered', ''], Returned: ['Returned', 'red'], Failed: ['Delivery failed', 'red'], Cancelled: ['Cancelled', 'red'] };
const stBadge = s => { const [t, c] = STATUS[s] || [s, '']; return `<span class="badge ${c}">${esc(t)}</span>`; };
const imgOf = p => p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('No image'))">` : 'No image';
const safeLink = u => /^(https?:\/\/|#\/)/.test(u || '') ? u : '#/';
const IC = {
  all: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
  spray: '<path d="M9 3h6v3H9z"/><path d="M8 6h8l1 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9z"/><path d="M4 7h4M4 10h3"/>',
  sprout: '<path d="M7 21h10M12 21v-9"/><path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 14c0-3 2-5 6-5 0 3-2 5-6 5z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-6.5 6.5a2.1 2.1 0 0 1-3-3z"/><path d="m9.5 14.5-5 5"/><path d="M14.7 6.3 17 4l2 2-2.3 2.3"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/>',
  pack: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>'
};
const iconFor = n => /spray/i.test(n) ? 'spray' : /offer/i.test(n) ? 'tag' : /garden|seed|sapl|plant/i.test(n) ? 'sprout' : /spare|part|tool/i.test(n) ? 'wrench' : /fert|soil|nutri/i.test(n) ? 'flask' : 'pack';
const svg = (k, z = 26) => `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || IC.pack}</svg>`;
const priceHtml = p => `${money(p.price)}${p.old_price ? ` <s class="old">${money(p.old_price)}</s>` : ''}`;

/* ---------- data ---------- */
async function loadCatalog() {
  const [p, c] = await Promise.all([sb.from('v_public_products').select('*').order('name'), sb.from('v_public_categories').select('*').order('name')]);
  if (p.error) throw p.error;
  S.products = p.data || []; S.cats = c.data || [];
  try { const b = await sb.from('v_public_banners').select('*'); S.banners = b.error ? [] : (b.data || []); } catch (_) { S.banners = []; }
}

/* ---------- pages ---------- */
function slidesHtml() {
  const list = S.banners.length ? S.banners : [{ def: true }];
  const body = list.map(b => b.def
    ? `<div class="sl sl-def"><div class="slt"><h2>Quality agricultural products,<br>trusted advice, prosperous farmers</h2><p>Sprayers, spare parts, seeds, fertilizer and gardening tools — order online and pay cash on delivery.</p><div class="bn">মানসম্মত কৃষিপণ্য, সঠিক পরামর্শ, সমৃদ্ধ কৃষক</div></div></div>`
    : `<a class="sl" href="${esc(safeLink(b.link_url))}" style="background-image:url('${esc(b.image_url)}')">${b.title || b.subtitle ? `<div class="slt shade">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}</div>` : ''}</a>`).join('');
  return `<div class="sh-slider"><div class="sh-slides" id="slides">${body}</div>${list.length > 1 ? `<div class="sh-dots" id="dots">${list.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>`;
}
function startSlides() {
  clearInterval(slideTimer); const c = $('#slides'); if (!c) return;
  const n = c.children.length; if (n < 2) return;
  const dots = [...document.querySelectorAll('#dots i')]; let hold = false, rel = null;
  const idx = () => Math.round(c.scrollLeft / c.clientWidth);
  c.addEventListener('scroll', () => dots.forEach((d, i) => d.classList.toggle('on', i === idx())), { passive: true });
  ['touchstart', 'mousedown'].forEach(ev => c.addEventListener(ev, () => { hold = true; clearTimeout(rel); }, { passive: true }));
  ['touchend', 'mouseup', 'mouseleave'].forEach(ev => c.addEventListener(ev, () => { clearTimeout(rel); rel = setTimeout(() => { hold = false; }, 4000); }, { passive: true }));
  slideTimer = setInterval(() => { if (hold || document.hidden || !document.body.contains(c)) return; c.scrollTo({ left: ((idx() + 1) % n) * c.clientWidth, behavior: 'smooth' }); }, 5000);
}

const discBadge = p => p.old_price && Number(p.old_price) > Number(p.price) ? `<span class="disc">${Math.max(1, Math.round((p.old_price - p.price) / p.old_price * 100))}% OFF</span>` : '';
const cardHtml = p => `<div class="sh-card"><a class="sh-img" href="#/p/${esc(p.id)}">${discBadge(p)}${imgOf(p)}</a><div class="sh-b"><div class="sh-cat">${esc(p.category_name || '')}</div>
    <a class="sh-name" href="#/p/${esc(p.id)}">${esc(p.name)}</a><div class="sh-price">${priceHtml(p)}</div>
    <div class="sh-stock ${p.in_stock ? 'in' : 'out'}">${p.in_stock ? '● In stock' : '● Out of stock'}</div>
    <button class="btn ghost" data-a="${esc(p.id)}" ${p.in_stock ? '' : 'disabled'}>Add to cart</button>
    <button class="btn" data-o="${esc(p.id)}" ${p.in_stock ? '' : 'disabled'}>Order Now</button></div></div>`;
function cardClicks(e) {
  const a = e.target.closest('[data-a]'); if (a) return addToCart(a.dataset.a);
  const o = e.target.closest('[data-o]'); if (o) { addToCart(o.dataset.o, 1, true); location.hash = '#/checkout'; }
}

function home() {
  const hasOffer = S.products.some(p => p.old_price);
  const tiles = [['', 'All', 'all'], ...S.cats.map(c => [c.id, c.name, iconFor(c.name)]), ...(hasOffer ? [['__offer', 'Offer', 'tag']] : [])];
  root.innerHTML = `${slidesHtml()}
  <div class="sh-cats" id="cats">${tiles.map(([id, name, ic]) => `<button class="sh-cat-t ${S.cat === id ? 'on' : ''}" data-c="${esc(id)}"><span class="ci">${svg(ic, 24)}</span><span>${esc(name)}</span></button>`).join('')}</div>
  <div class="sh-tools"><input class="sh-search" id="q" type="search" placeholder="Search products…" value="${esc(S.q)}"></div><div id="grid"></div>`;
  const draw = () => {
    const l = S.products.filter(p => (!S.cat || (S.cat === '__offer' ? p.old_price : p.category_id === S.cat)) && (!S.q || (p.name + ' ' + (p.category_name || '')).toLowerCase().includes(S.q.toLowerCase())));
    $('#grid').innerHTML = l.length ? `<div class="sh-grid">${l.map(cardHtml).join('')}</div>` : `<p class="sh-empty">${S.products.length ? 'No products match your search.' : 'Our online catalog is being prepared. Please call 01997905850 to order.'}</p>`;
  };
  draw(); startSlides();
  $('#q').oninput = e => { S.q = e.target.value; draw(); };
  $('#cats').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; S.cat = b.dataset.c; home(); };
  root.onclick = cardClicks;
}

function productPage(id) {
  const p = S.products.find(x => x.id === id);
  if (!p) { root.innerHTML = `<p class="sh-empty">This product is not available.</p><p style="text-align:center"><a href="#/">← Back to shop</a></p>`; return; }
  let qn = 1;
  const rel = p.category_id ? S.products.filter(x => x.id !== p.id && x.category_id === p.category_id).slice(0, 10) : [];
  root.innerHTML = `<p style="margin:4px 0"><a class="link" href="#/" style="text-decoration:none">← Back to shop</a></p><div class="box pp">
    ${p.image_url ? `<div class="ppwrap">${discBadge(p)}<img class="ppimg" src="${esc(p.image_url)}" alt="${esc(p.name)}" onerror="this.remove()"></div>` : '<div class="sh-img" style="aspect-ratio:16/9;cursor:default">No image</div>'}
    <div class="sh-cat" style="margin-top:10px">${esc(p.category_name || '')}</div><h2 class="sh-h" style="margin:2px 0 6px">${esc(p.name)}</h2>
    <div class="sh-price" style="font-size:22px">${priceHtml(p)} <small style="color:var(--mut);font-weight:400;font-size:13px">/ ${esc(p.unit)}</small></div>
    <div class="sh-stock ${p.in_stock ? 'in' : 'out'}" style="margin:6px 0 10px">${p.in_stock ? '● In stock' : '● Out of stock'}</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span style="color:var(--mut);font-size:14px">Quantity</span><div class="qty"><button id="qm">−</button><span id="qv">1</span><button id="qp">+</button></div></div>
    <button class="btn ghost block" id="pa" ${p.in_stock ? '' : 'disabled'}>Add to cart</button>
    <button class="btn block" id="po" style="margin-top:8px" ${p.in_stock ? '' : 'disabled'}>Order Now</button>
    ${p.description ? `<h3 style="margin:18px 0 6px">Product details</h3><p class="pdesc">${esc(p.description)}</p>` : ''}
    ${(p.feature_images || []).length ? `<h3 style="margin:18px 0 6px">Features</h3><div class="feat">${p.feature_images.map(u => `<img src="${esc(u)}" alt="${esc(p.name)} feature" loading="lazy" onerror="this.remove()">`).join('')}</div>` : ''}</div>
    ${rel.length ? `<h2 class="sh-h" style="margin-top:22px">Related products</h2><div class="sh-grid">${rel.map(cardHtml).join('')}</div>` : ''}`;
  root.onclick = cardClicks;
  const upd = () => { $('#qv').textContent = qn; };
  $('#qm').onclick = () => { qn = Math.max(1, qn - 1); upd(); }; $('#qp').onclick = () => { qn = Math.min(99, qn + 1); upd(); };
  $('#pa').onclick = () => addToCart(p.id, qn);
  $('#po').onclick = () => { addToCart(p.id, qn, true); location.hash = '#/checkout'; };
}

function cart() {
  const items = cartItems();
  if (!items.length) { root.innerHTML = `<h2 class="sh-h">Your cart</h2><div class="box sh-empty">Your cart is empty.<br><br><a class="btn" style="display:inline-flex;align-items:center;text-decoration:none" href="#/">Browse products</a></div>`; return; }
  root.innerHTML = `<h2 class="sh-h">Your cart</h2><div class="box">${items.map(({ p, q }) => `<div class="row">${p.image_url ? `<img class="im" src="${esc(p.image_url)}" alt="" onerror="this.remove()">` : '<div class="im"></div>'}
    <div class="nm">${esc(p.name)}<small>${money(p.price)} each</small></div>
    <div><div class="qty"><button data-m="${esc(p.id)}">−</button><span>${q}</span><button data-p="${esc(p.id)}">+</button></div><div style="text-align:right;font-weight:700;margin-top:4px">${money(q * p.price)}</div></div></div>`).join('')}
    <div class="tot"><span>Total</span><span>${money(cartTotal())}</span></div>
    <div class="hint">Pay in cash when your order is delivered. Delivery arrangements are confirmed by phone.</div>
    <a class="btn block" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="#/checkout">Checkout</a></div>`;
  root.onclick = e => {
    const m = e.target.closest('[data-m]'), pl = e.target.closest('[data-p]');
    if (m) { setQty(m.dataset.m, (loadCart()[m.dataset.m] || 0) - 1); cart(); }
    if (pl) { setQty(pl.dataset.p, (loadCart()[pl.dataset.p] || 0) + 1); cart(); }
  };
}

function checkout() {
  const items = cartItems();
  if (!items.length) { location.hash = '#/cart'; return; }
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('rsk_cust') || '{}'); } catch (_) { }
  if (S.profile) { saved.name = saved.name || S.profile.full_name; saved.mobile = saved.mobile || S.profile.phone; }
  root.innerHTML = `<h2 class="sh-h">Checkout</h2><div class="box"><form id="cf" autocomplete="on">
    <label>Full name<input name="customer_name" required maxlength="80" autocomplete="name" value="${esc(saved.name || '')}"></label>
    <label>Mobile number<input name="mobile" type="tel" inputmode="numeric" required placeholder="01XXXXXXXXX" autocomplete="tel" value="${esc(saved.mobile || '')}"></label>
    <label>Full delivery address<textarea name="address" rows="3" required maxlength="300" style="display:block;width:100%;margin-top:4px;padding:8px 12px;border:1px solid var(--bd);border-radius:10px" placeholder="Village / area, thana, district">${esc(saved.address || '')}</textarea></label>
    <label>Notes (optional)<input name="notes" maxlength="300"></label>
    <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="box" style="background:#f5f8f3;margin:12px 0">${items.map(({ p, q }) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;margin:4px 0"><span>${esc(p.name)} × ${q}</span><b>${money(q * p.price)}</b></div>`).join('')}
      <div class="tot" style="margin-bottom:0"><span>Total (cash on delivery)</span><span>${money(cartTotal())}</span></div></div>
    <div class="hint">Payment: <b>cash on delivery</b>. We will call to confirm your order before shipping.</div>
    <button class="btn block" id="go">Place order</button></form></div>`;
  $('#cf').onsubmit = async e => {
    e.preventDefault(); const b = $('#go'); b.disabled = true; b.textContent = 'Placing order…';
    const fd = new FormData(e.target);
    const body = { customer_name: fd.get('customer_name'), mobile: fd.get('mobile'), address: fd.get('address'), notes: fd.get('notes'), website: fd.get('website'),
      items: items.map(({ p, q }) => ({ product_id: p.id, qty: q })) };
    try {
      const { data, error } = await sb.rpc('place_web_order', { p: body }); if (error) throw error;
      localStorage.setItem('rsk_cust', JSON.stringify({ name: body.customer_name, mobile: body.mobile, address: body.address }));
      localStorage.setItem('rsk_last', JSON.stringify({ ref: data.order_ref, mobile: body.mobile }));
      saveCart({}); done(data, body.mobile);
    } catch (err) { toast(errText(err), 'err'); b.disabled = false; b.textContent = 'Place order'; }
  };
}

function done(o, mobile) {
  root.innerHTML = `<h2 class="sh-h">Thank you!</h2><div class="ok"><b>Your order has been received.</b><br>Order number: <b style="font-size:20px">${esc(o.order_ref)}</b><br>Total to pay on delivery: <b>${money(o.total)}</b></div>
    <div class="box">We will call you on <b>${esc(mobile)}</b> to confirm. Keep your order number — with your mobile number you can <a href="#/track">track your order</a> any time.</div>
    <a class="btn" style="display:inline-flex;align-items:center;text-decoration:none" href="#/">Continue shopping</a>`;
  window.scrollTo(0, 0);
}

function track() {
  let last = {}; try { last = JSON.parse(localStorage.getItem('rsk_last') || '{}'); } catch (_) { }
  root.innerHTML = `<h2 class="sh-h">Track your order</h2><div class="box"><form id="tf"><label>Order number<input name="ref" required placeholder="WEB-00001" value="${esc(last.ref || '')}"></label>
    <label>Mobile number used for the order<input name="mobile" type="tel" required placeholder="01XXXXXXXXX" value="${esc(last.mobile || '')}"></label><button class="btn block">Check status</button></form><div id="tr"></div></div>`;
  $('#tf').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target), out = $('#tr'); out.innerHTML = '<p class="sh-empty">Checking…</p>';
    try {
      const { data, error } = await sb.rpc('track_web_order', { p_ref: fd.get('ref'), p_mobile: fd.get('mobile') }); if (error) throw error;
      out.innerHTML = data ? orderHtml(data) : '<div class="hint">No order found. Please check the order number and mobile number.</div>';
    } catch (err) { out.innerHTML = `<div class="hint">${esc(errText(err))}</div>`; }
  };
}
const FLOW = ['New', 'Confirmed', 'Processing', 'Shipped', 'Delivered'];
function orderHtml(o) {
  const idx = Math.max(FLOW.indexOf(o.status === 'Packed' ? 'Processing' : o.status), 0), bad = ['Returned', 'Failed', 'Cancelled'].includes(o.status);
  return `<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(o.order_ref)}</b>${stBadge(o.status)}</div>
    ${bad ? '' : `<div class="steps">${FLOW.map((_, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div>`}
    <small style="color:var(--mut)">Placed ${esc(new Date(o.placed).toLocaleString('en-GB'))}</small>
    ${(o.items || []).map(i => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;margin:5px 0"><span>${esc(i.name)} × ${esc(i.qty)}</span><b>${money(i.qty * i.price)}</b></div>`).join('')}
    <div class="tot"><span>Total (cash on delivery)</span><span>${money(o.total)}</span></div></div>`;
}

/* ---------- account ---------- */
async function account(mode = 'login', notice = '') {
  if (S.recovery) return recovery();
  if (S.user) {
    root.innerHTML = `<h2 class="sh-h">My account</h2><div class="box"><b>${esc(S.profile?.full_name || S.user.email)}</b><br><small style="color:var(--mut)">${esc(S.user.email)}</small>
      ${S.profile && S.profile.role !== 'customer' ? '<p><a href="admin">Open the back office →</a></p>' : ''}<p><button class="btn ghost" id="lo">Log out</button></p></div>
      <h2 class="sh-h">My orders</h2><div id="mo" class="box sh-empty">Loading…</div>`;
    $('#lo').onclick = async () => { await sb.auth.signOut(); };
    const { data, error } = await sb.rpc('my_web_orders');
    $('#mo').className = 'box'; $('#mo').innerHTML = error ? `<div class="hint">${esc(errText(error))}</div>` : (data && data.length ? data.map(orderHtml).join('<hr style="border:0;border-top:1px solid var(--bd)">') : '<p class="sh-empty">No orders yet. Orders you place while logged in appear here.</p>');
    return;
  }
  root.innerHTML = `<h2 class="sh-h">Login</h2><div class="box"><div class="tabs"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Login</button><button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">Create account</button></div>
    ${notice ? `<div class="ok">${esc(notice)}</div>` : ''}<p style="color:var(--mut);font-size:13.5px">An account is optional — you can order without one. With an account you can see all your orders in one place.</p>
    <form id="af">${mode === 'signup' ? '<label>Full name<input name="name" required autocomplete="name"></label><label>Mobile number<input name="phone" type="tel" placeholder="01XXXXXXXXX" autocomplete="tel"></label>' : ''}
    <label>Email<input name="email" type="email" required autocomplete="email"></label>${mode === 'reset' ? '' : `<label>Password<input name="password" type="password" minlength="6" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>`}
    <button class="btn block">${mode === 'login' ? 'Login' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button></form>
    <p style="text-align:center">${mode === 'login' ? '<button class="link" data-m="reset">Forgot password?</button>' : mode === 'reset' ? '<button class="link" data-m="login">← Back to login</button>' : ''}</p></div>`;
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => account(b.dataset.m));
  $('#af').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target), btn = e.target.querySelector('.btn'); btn.disabled = true;
    const email = fd.get('email').trim(), password = fd.get('password'), back = location.origin + location.pathname + '#/account';
    try {
      if (mode === 'login') { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; }
      else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fd.get('name').trim(), phone: (fd.get('phone') || '').trim(), account_type: 'customer' }, emailRedirectTo: back } });
        if (error) throw error; if (!data.session) return account('login', 'Please confirm your email using the link we sent, then log in.');
      } else { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back }); if (error) throw error; return account('login', 'A password reset link has been sent to your email.'); }
    } catch (err) {
      const m = (err && err.message) || ''; btn.disabled = false;
      toast(/Invalid login/i.test(m) ? 'Incorrect email or password.' : /not confirmed/i.test(m) ? 'Please confirm your email first.' : /already/i.test(m) ? 'An account with this email already exists.' : errText(err), 'err');
    }
  };
}
function recovery() {
  root.innerHTML = `<h2 class="sh-h">Set a new password</h2><div class="box"><form id="pf"><label>New password<input name="p" type="password" minlength="6" required autocomplete="new-password"></label><button class="btn block">Save password</button></form></div>`;
  $('#pf').onsubmit = async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('p') }); if (error) return toast(errText(error), 'err'); S.recovery = false; toast('Password updated.'); account(); };
}

/* ---------- routing ---------- */
function route() {
  const h = (location.hash || '#/').replace(/^#\/?/, '').split('?')[0];
  document.querySelectorAll('.sh-nav a').forEach(a => a.classList.remove('on'));
  window.scrollTo(0, 0); root.onclick = null; clearInterval(slideTimer);
  if (h.startsWith('p/')) return productPage(h.slice(2));
  if (h === 'cart') return cart();
  if (h === 'checkout') return checkout();
  if (h === 'track') return track();
  if (h === 'account') return account();
  home();
}
function navAccount() { $('#nav-account-t').textContent = S.user ? (S.profile?.full_name || 'Profile').split(' ')[0] : 'Login'; $('#nav-account').title = S.user ? 'My profile' : 'Login'; }
async function setUser(session) {
  S.user = session?.user || null; S.profile = null;
  if (S.user) { const { data } = await sb.from('profiles').select('full_name,phone,role').eq('id', S.user.id).maybeSingle(); S.profile = data; }
  navAccount();
}
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') S.recovery = true;
  setTimeout(async () => { await setUser(session); if ((location.hash || '').startsWith('#/account') || ev === 'PASSWORD_RECOVERY') route(); }, 0);
});
window.addEventListener('hashchange', route);

(async function init() {
  try { await loadCatalog(); } catch (e) { root.innerHTML = `<p class="sh-empty">The catalog could not be loaded right now. Please try again shortly, or call 01997905850.</p>`; return; }
  const { data } = await sb.auth.getSession(); await setUser(data.session);
  badge(); route();
})();

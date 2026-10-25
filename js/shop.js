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
const sid = (() => { let v = localStorage.getItem('rsk_sid'); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('rsk_sid', v); } return v; })();
let syncT = null;
function syncCart(c) { clearTimeout(syncT); syncT = setTimeout(() => { sb.rpc('save_web_cart', { p_session: sid, p_items: Object.entries(c).filter(([, q]) => q > 0).map(([product_id, qty]) => ({ product_id, qty })) }).then(() => { }, () => { }); }, 700); }
const saveCart = c => { localStorage.setItem('rsk_cart', JSON.stringify(c)); badge(); syncCart(c); };
const cartItems = () => Object.entries(loadCart()).map(([id, q]) => ({ p: S.products.find(x => x.id === id), q })).filter(x => x.p && x.q > 0);
const cartTotal = () => cartItems().reduce((s, x) => s + x.q * Number(x.p.price), 0);
function badge() { const n = cartItems().reduce((s, x) => s + x.q, 0), b = $('#cart-count'); b.textContent = n; b.hidden = !n; }
function addToCart(id, n = 1, silent = false) { const c = loadCart(); c[id] = Math.min(99, (c[id] || 0) + n); saveCart(c); if (!silent) toast('Added to cart'); }
function setQty(id, q) { const c = loadCart(); if (q <= 0) delete c[id]; else c[id] = Math.min(99, q); saveCart(c); }

function toast(m, type = '') { const d = document.createElement('div'); d.textContent = m; if (type) d.className = type; $('#toast').appendChild(d); setTimeout(() => d.remove(), 4200); }
const errText = e => { const m = (e && e.message) || String(e); return /Failed to fetch|NetworkError|Load failed/i.test(m) ? 'Network problem. Please check your connection and try again.' : m; };
const STATUS = { New: ['Pending Confirmation', 'amb'], Confirmed: ['Confirmed', ''], Processing: ['Being prepared', ''], Packed: ['Being prepared', ''], Shipped: ['On the way', ''], Delivered: ['Delivered', ''], Returned: ['Returned', 'red'], Failed: ['Delivery failed', 'red'], Cancelled: ['Cancelled', 'red'] };
const stBadge = s => { const [t, c] = STATUS[s] || [s, '']; return `<span class="badge ${c}">${esc(t)}</span>`; };
const imgOf = p => p.image_url ? `<img data-wm="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('No image'))">` : 'No image';
/* logo watermark: drawn onto product photos here in the browser, so it covers old and new photos and the logo can be changed any time */
let WM = { url: '', pos: 'br', size: 22, opacity: 0.7 }, wmLogo = null; const wmCache = new Map();
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
function wmSrc(u) {
  if (!wmCache.has(u)) wmCache.set(u, (async () => {
    const [im, lg] = await Promise.all([loadImg(u), wmLogo || (wmLogo = loadImg(WM.url))]);
    const W = im.naturalWidth, H = im.naturalHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, W, H);
    const lw = W * WM.size / 100, lh = lw * lg.naturalHeight / lg.naturalWidth, m = W * 0.03;
    const x = /l/.test(WM.pos) ? m : /r/.test(WM.pos) ? W - lw - m : (W - lw) / 2, y = /t/.test(WM.pos) ? m : /b/.test(WM.pos) ? H - lh - m : (H - lh) / 2;
    cx.globalAlpha = WM.opacity; cx.drawImage(lg, x, y, lw, lh);
    return await new Promise((r, j) => cv.toBlob(b => b ? r(URL.createObjectURL(b)) : j(new Error('wm')), 'image/jpeg', 0.9));
  })());
  return wmCache.get(u);
}
async function loadWm(img) { const u = img.dataset.wm; try { img.src = WM.url ? await wmSrc(u) : u; } catch (_) { img.src = u; } }
const wmIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { wmIO.unobserve(e.target); loadWm(e.target); } }), { rootMargin: '400px' }) : null;
function applyWm(scope = document, now = false) { scope.querySelectorAll('img[data-wm]:not([data-wd])').forEach(i => { i.dataset.wd = 1; (wmIO && !now) ? wmIO.observe(i) : loadWm(i); }); }
const safeLink = u => /^(https?:\/\/|#\/)/.test(u || '') ? u : '#/';
const ICON = {
  all: '<rect x="8" y="8" width="21" height="21" rx="5" fill="#66bb6a"/><rect x="35" y="8" width="21" height="21" rx="5" fill="#ffb300"/><rect x="8" y="35" width="21" height="21" rx="5" fill="#29b6f6"/><rect x="35" y="35" width="21" height="21" rx="5" fill="#ef5350"/>',
  spray: '<rect x="12" y="16" width="28" height="40" rx="9" fill="#2e7d32" stroke="#1b5e20" stroke-width="2"/><rect x="19" y="9" width="14" height="9" rx="3" fill="#1b5e20"/><rect x="17" y="26" width="18" height="16" rx="4" fill="#e8f5e9"/><path d="M20 34h12M20 38h8" stroke="#2e7d32" stroke-width="2" stroke-linecap="round"/><path d="M12 30H6v11" fill="none" stroke="#455a64" stroke-width="3" stroke-linecap="round"/><path d="M40 22h6a4 4 0 0 1 4 4v17" fill="none" stroke="#37474f" stroke-width="3.5" stroke-linecap="round"/><rect x="46" y="42" width="9" height="6" rx="2" fill="#ffb300"/><path d="M55 44l4-13" stroke="#78909c" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="24" r="1.7" fill="#4fc3f7"/><circle cx="56" cy="22" r="1.5" fill="#4fc3f7"/><circle cx="61" cy="19" r="1.4" fill="#81d4fa"/>',
  garden: '<g transform="rotate(-35 30 32)"><path d="M30 6c8 5 10 14 7 24H23c-3-10-1-19 7-24z" fill="#90a4ae" stroke="#607d8b" stroke-width="1.5"/><rect x="27" y="30" width="6" height="6" fill="#546e7a"/><rect x="26" y="36" width="8" height="22" rx="4" fill="#8d6e63"/></g><ellipse cx="46" cy="55" rx="14" ry="5" fill="#8d6e63"/><path d="M46 53V43" stroke="#43a047" stroke-width="3" stroke-linecap="round"/><path d="M46 46c-6 0-8-4-8-7 5 0 8 2 8 7z" fill="#66bb6a"/><path d="M46 49c5 0 7-3 7-6-4 0-7 2-7 6z" fill="#2e7d32"/>',
  seed: '<path d="M16 12h32l2 4v40a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V16z" fill="#fff8e1" stroke="#f9a825" stroke-width="2"/><rect x="14" y="12" width="36" height="8" rx="2" fill="#f9a825"/><path d="M32 47V33" stroke="#43a047" stroke-width="3" stroke-linecap="round"/><path d="M32 36c-7 0-10-5-10-9 6 0 10 3 10 9z" fill="#66bb6a"/><path d="M32 40c6 0 9-4 9-8-5 0-9 3-9 8z" fill="#2e7d32"/><ellipse cx="22" cy="52" rx="2.2" ry="3.2" fill="#8d6e63" transform="rotate(-20 22 52)"/><ellipse cx="32" cy="53" rx="2.2" ry="3.2" fill="#8d6e63"/><ellipse cx="42" cy="52" rx="2.2" ry="3.2" fill="#8d6e63" transform="rotate(20 42 52)"/>',
  spare: '<g fill="#78909c"><rect x="23" y="11" width="6" height="38" rx="1.5"/><rect x="23" y="11" width="6" height="38" rx="1.5" transform="rotate(45 26 30)"/><rect x="23" y="11" width="6" height="38" rx="1.5" transform="rotate(90 26 30)"/><rect x="23" y="11" width="6" height="38" rx="1.5" transform="rotate(135 26 30)"/><circle cx="26" cy="30" r="13"/></g><circle cx="26" cy="30" r="13" fill="none" stroke="#546e7a" stroke-width="2"/><circle cx="26" cy="30" r="5" fill="#eceff1" stroke="#546e7a" stroke-width="2"/><path d="M46 35l9.5 5.5v11L46 57l-9.5-5.5v-11z" fill="#ffb300" stroke="#f57c00" stroke-width="2" stroke-linejoin="round"/><circle cx="46" cy="46" r="4" fill="#fff8e1" stroke="#f57c00" stroke-width="1.5"/>',
  fert: '<path d="M18 20c-2 8-4 24-4 32a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4c0-8-2-24-4-32z" fill="#d7b98a" stroke="#a1887f" stroke-width="2"/><path d="M18 20c4-6 8-8 14-8s10 2 14 8" fill="#c8a574" stroke="#a1887f" stroke-width="2"/><path d="M24 13l-2-6M40 13l2-6" stroke="#a1887f" stroke-width="3" stroke-linecap="round"/><rect x="20" y="30" width="24" height="17" rx="3" fill="#fff"/><path d="M32 44c-5 0-7-4-7-7 5 0 7 3 7 7z" fill="#43a047"/><path d="M32 44c5 0 7-4 7-7-5 0-7 3-7 7z" fill="#2e7d32"/>',
  pest: '<rect x="25" y="6" width="14" height="8" rx="2" fill="#d32f2f"/><path d="M27 14h10v6c6 3 9 6 9 12v20a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V32c0-6 3-9 9-12z" fill="#fbc02d" stroke="#f57f17" stroke-width="2"/><rect x="21" y="32" width="22" height="18" rx="3" fill="#fff"/><path d="M32 36c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#ef5350"/>',
  tag: '<path d="M8 33 33 8h21v21L29 54a4 4 0 0 1-5.6 0L8 38.6A4 4 0 0 1 8 33z" fill="#ef5350"/><circle cx="45" cy="17" r="4.5" fill="#fff"/><path d="M22 40l16-16" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="26" r="3.2" fill="#fff"/><circle cx="36" cy="38" r="3.2" fill="#fff"/>',
  pack: '<path d="M32 8l22 11v26L32 56 10 45V19z" fill="#d7a86e" stroke="#a1783f" stroke-width="2" stroke-linejoin="round"/><path d="M10 19l22 11 22-11M32 30v26" fill="none" stroke="#a1783f" stroke-width="2"/>'
};
const iconFor = n => /spray/i.test(n) ? 'spray' : /offer/i.test(n) ? 'tag' : /seed|sapl|বীজ/i.test(n) ? 'seed' : /spare|part|যন্ত্রাংশ/i.test(n) ? 'spare' : /garden|tool|যন্ত্র/i.test(n) ? 'garden' : /fert|soil|nutri|সার/i.test(n) ? 'fert' : /pest|insect|chem|medic|herb|fung|কীট|ঔষধ/i.test(n) ? 'pest' : 'pack';
const svg = (k, z = 40) => `<svg width="${z}" height="${z}" viewBox="0 0 64 64" aria-hidden="true">${ICON[k] || ICON.pack}</svg>`;
/* category order comes from the admin panel (Settings → Product categories → Display order) */
const catIdx = id => { const i = S.cats.findIndex(c => c.id === id); return i < 0 ? 999 : i; };
const byCat = (a, b) => catIdx(a.category_id) - catIdx(b.category_id) || String(a.name).localeCompare(String(b.name));
const hasStockInfo = p => typeof p.in_stock === 'boolean';   // null = owner has hidden stock
const stockHtml = (p, cls) => hasStockInfo(p) ? `<div class="${cls} ${p.in_stock ? 'in' : 'out'}">${p.in_stock ? '● In stock' : '● Out of stock'}</div>` : '';
const DC_NOTICE = 'ডেলিভারি চার্জ অগ্রিম পেমেন্ট করতে হবে। ডেলিভারি চার্জ পণ্য ও পণ্যের পরিমাণ অনুযায়ী কমবেশি হতে পারে। সঠিক ডেলিভারি চার্জ জানাতে এবং অর্ডার কনফার্ম করতে আমরা আপনার সঙ্গে ফোনে যোগাযোগ করব।';
const priceHtml = p => `${money(p.price)}${p.old_price ? ` <s class="old">${money(p.old_price)}</s>` : ''}`;

/* ---------- data ---------- */
async function loadCatalog() {
  const [p, c] = await Promise.all([sb.from('v_public_products').select('*').order('name'), sb.from('v_public_categories').select('*').order('name')]);
  if (p.error) throw p.error;
  S.cats = (c.data || []).sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.name).localeCompare(String(b.name)));
  S.products = (p.data || []).sort(byCat);
  try { const w = await sb.from('v_public_shop').select('*').maybeSingle(); if (w.data && w.data.watermark_url) WM = { url: w.data.watermark_url, pos: w.data.wm_pos || 'br', size: Number(w.data.wm_size) || 22, opacity: Number(w.data.wm_opacity) || 0.7 }; } catch (_) { }
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

let bestRaf = 0, bestOff = null;
function bestHtml() {
  if (!S.products.some(p => p.is_best)) return '';
  return `<section class="sh-best"><h3 class="sh-sec">Best Products</h3><div class="sh-bestrow" id="bestrow"></div></section>`;
}
/* slides right-to-left by itself; can be swiped with a finger or dragged with the mouse; pauses while touched / hovered.
   The cards are repeated until one set is wider than the box, and 3 identical sets make an endless loop in both directions. */
function startBest() {
  cancelAnimationFrame(bestRaf); if (bestOff) bestOff(); bestOff = null;
  const r = $('#bestrow'); if (!r) return;
  const one = S.products.filter(p => p.is_best).map(p => `<div class="bt">${cardHtml(p)}</div>`).join('');
  r.innerHTML = `<div class="bset">${one}</div>`;
  const w = r.firstElementChild.offsetWidth || 1, k = Math.min(40, Math.max(1, Math.ceil((r.clientWidth + 240) / w))), set = one.repeat(k);
  r.innerHTML = [0, 1, 2].map(i => `<div class="bset" ${i ? 'aria-hidden="true"' : ''}>${set}</div>`).join('');
  applyWm(r, true);
  const half = r.firstElementChild.offsetWidth; if (!half) return;
  r.scrollLeft = half;
  let pos = half, last = 0, hold = false, rel = null, dn = false, sx = 0, sl = 0, moved = false;
  const stop = () => { hold = true; clearTimeout(rel); }, go = () => { clearTimeout(rel); rel = setTimeout(() => { pos = r.scrollLeft; hold = false; }, 1200); };
  const down = e => { if (e.button !== 0) return; dn = true; moved = false; sx = e.clientX; sl = r.scrollLeft; r.classList.add('drag'); stop(); e.preventDefault(); };
  const move = e => { if (!dn) return; const dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; r.scrollLeft = sl - dx; };
  const up = () => { if (!dn) return; dn = false; r.classList.remove('drag'); go(); };
  const noClick = e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } };
  const pair = [['touchstart', stop], ['touchend', go], ['touchcancel', go], ['wheel', stop], ['mouseenter', stop], ['mouseleave', () => { if (!dn) go(); }], ['mousedown', down]];
  pair.forEach(([ev, fn]) => r.addEventListener(ev, fn, { passive: ev !== 'mousedown' }));
  r.addEventListener('click', noClick, true);
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  bestOff = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  const tick = t => {
    if (!document.body.contains(r)) { bestOff && bestOff(); return; }
    const dt = last ? Math.min(t - last, 64) : 0; last = t;
    if (!hold && !document.hidden) { pos += dt * 0.04; if (pos >= 2 * half) pos -= half; r.scrollLeft = pos; } else if (hold) pos = r.scrollLeft;
    const cur = r.scrollLeft;
    if (cur >= 2 * half) { r.scrollLeft = cur - half; pos = r.scrollLeft; sl -= half; } else if (cur < half) { r.scrollLeft = cur + half; pos = r.scrollLeft; sl += half; }
    bestRaf = requestAnimationFrame(tick);
  };
  bestRaf = requestAnimationFrame(tick);
}
const discBadge = p => p.old_price && Number(p.old_price) > Number(p.price) ? `<span class="disc">${Math.max(1, Math.round((p.old_price - p.price) / p.old_price * 100))}% OFF</span>` : '';
const cardHtml = p => `<div class="sh-card"><a class="sh-img" href="#/p/${esc(p.id)}">${discBadge(p)}${imgOf(p)}</a><div class="sh-b"><div class="sh-cat">${esc(p.category_name || '')}</div>
    <a class="sh-name" href="#/p/${esc(p.id)}">${esc(p.name)}</a><div class="sh-price">${priceHtml(p)}</div>
    ${stockHtml(p, 'sh-stock')}
    <button class="btn ghost" data-a="${esc(p.id)}">Add to cart</button>
    <button class="btn" data-o="${esc(p.id)}">Order Now</button></div></div>`;
function cardClicks(e) {
  const a = e.target.closest('[data-a]'); if (a) return addToCart(a.dataset.a);
  const o = e.target.closest('[data-o]'); if (o) { addToCart(o.dataset.o, 1, true); location.hash = '#/checkout'; }
}

function home() {
  const hasOffer = S.products.some(p => p.old_price);
  const tiles = [['', 'All', 'all'], ...S.cats.map(c => [c.id, c.name, iconFor(c.name)]), ...(hasOffer ? [['__offer', 'Offer', 'tag']] : [])];
  root.innerHTML = `${slidesHtml()}
  <div class="sh-cats" id="cats">${tiles.map(([id, name, ic]) => `<button class="sh-cat-t ${S.cat === id ? 'on' : ''}" data-c="${esc(id)}"><span class="ci">${svg(ic, 40)}</span><span>${esc(name)}</span></button>`).join('')}</div>
  <div class="sh-tools"><input class="sh-search" id="q" type="search" placeholder="Search products…" value="${esc(S.q)}"></div>${bestHtml()}<div id="grid"></div>`;
  const draw = () => {
    const l = S.products.filter(p => (!S.cat || (S.cat === '__offer' ? p.old_price : (p.category_id === S.cat || (p.extra_category_ids || []).includes(S.cat)))) && (!S.q || (p.name + ' ' + (p.category_name || '')).toLowerCase().includes(S.q.toLowerCase())));
    const grouped = !S.cat && !S.q, secs = [];
    if (grouped) l.forEach(p => { const k = p.category_name || 'Other', g = secs.find(x => x[0] === k); g ? g[1].push(p) : secs.push([k, [p]]); });
    $('#grid').innerHTML = l.length ? (grouped ? secs.map(([k, ps]) => `<h3 class="sh-sec">${esc(k)}</h3><div class="sh-grid">${ps.map(cardHtml).join('')}</div>`).join('') : `<div class="sh-grid">${l.map(cardHtml).join('')}</div>`) : `<p class="sh-empty">${S.products.length ? 'No products match your search.' : 'Our online catalog is being prepared. Please call 01997905850 to order.'}</p>`;
    applyWm($('#grid'));
  };
  draw(); startSlides(); startBest();
  $('#q').oninput = e => { S.q = e.target.value; draw(); };
  $('#cats').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; S.cat = b.dataset.c; home(); };
  root.onclick = cardClicks;
}

function productPage(id) {
  const p = S.products.find(x => x.id === id);
  if (!p) { root.innerHTML = `<p class="sh-empty">This product is not available.</p><p style="text-align:center"><a href="#/">← Back to shop</a></p>`; return; }
  let qn = 1;
  const gal = [p.image_url, ...(p.feature_images || [])].filter(Boolean);
  const rel = p.category_id ? S.products.filter(x => x.id !== p.id && x.category_id === p.category_id).slice(0, 10) : [];
  const hl = t => { const L = String(t || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean); return L.length < 2 ? `<p class="pdesc">${esc(L[0] || '')}</p>` : `<ul class="pp-hl">${L.map(l => `<li>${esc(l.replace(/^[•\-*✓✔●▪‣]+\s*/, ''))}</li>`).join('')}</ul>`; };
  root.innerHTML = `<p class="pp-back"><a class="link" href="#/">← Back to shop</a></p><div class="box pp">
    <div class="pp-top"><div class="pp-media">${gal[0] ? `<div class="ppwrap">${discBadge(p)}<img class="ppimg" id="ppmain" data-wm="${esc(gal[0])}" alt="${esc(p.name)}" onerror="this.remove()"></div>` : '<div class="sh-img" style="aspect-ratio:16/9;cursor:default">No image</div>'}
      ${gal.length > 1 ? `<div class="pp-thumbs" id="thumbs">${gal.map((u, i) => `<button type="button" class="th ${i ? '' : 'on'}" data-i="${i}" aria-label="Photo ${i + 1}"><img data-wm="${esc(u)}" alt="" onerror="this.parentNode.remove()"></button>`).join('')}</div>` : ''}</div>
    <div class="pp-info">${p.category_name ? `<span class="pp-cat">${esc(p.category_name)}</span>` : ''}<h1 class="pp-title">${esc(p.name)}</h1>
      <div class="pp-price">${priceHtml(p)} <small>/ ${esc(p.unit)}</small></div>
      ${stockHtml(p, 'pp-stock')}
      <div class="pp-qty"><span>Quantity</span><div class="qty"><button id="qm">−</button><span id="qv">1</span><button id="qp">+</button></div></div>
      <div class="pp-cta"><button class="btn ghost block" id="pa">Add to cart</button><button class="btn block" id="po">Order Now</button></div></div></div>
    ${p.description ? `<section class="pp-sec"><h3>Product highlights</h3>${hl(p.description)}</section>` : ''}
</div>
    ${rel.length ? `<section class="pp-rel"><h2 class="pp-rel-h">Related products</h2><div class="sh-grid">${rel.map(cardHtml).join('')}</div></section>` : ''}`;
  root.onclick = cardClicks; applyWm(root, true);
  const th = $('#thumbs'); if (th) th.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; th.querySelectorAll('.th').forEach(x => x.classList.toggle('on', x === b)); const m = $('#ppmain'); if (m) { m.dataset.wm = gal[+b.dataset.i]; loadWm(m); } };
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
    <div class="hint">Product price: cash on delivery. Delivery charge: confirmed by phone and paid in advance (see Checkout).</div>
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
      <div class="tot" style="margin-bottom:0"><span>Product total (pay on delivery)</span><span>${money(cartTotal())}</span></div></div>
    <div class="box dcbox"><h3 class="sh-sub">Delivery Charge</h3><div class="dc-row"><span>Delivery charge</span><b>Will be told by phone</b></div><p class="dc-bn">${DC_NOTICE}</p></div>
    <div class="box pmbox"><h3 class="sh-sub">Payment method</h3><div class="pm"><b>Cash on Delivery (COD)</b><span>পণ্যের মূল্য পণ্য হাতে পাওয়ার সময় পরিশোধ করতে হবে।</span></div></div>
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
  root.innerHTML = `<h2 class="sh-h">Thank you!</h2><div class="ok"><b>We have received your order request.</b> Status: <b>Pending Confirmation</b><br>Order number: <b style="font-size:20px">${esc(o.order_ref)}</b><br>Product total to pay on delivery: <b>${money(o.total)}</b></div>
    <div class="box dcbox"><h3 class="sh-sub">Delivery Charge</h3><p class="dc-bn">${DC_NOTICE}</p></div>
    <div class="box">We will call you on <b>${esc(mobile)}</b>. Keep your order number — with your mobile number you can <a href="#/track">track your order</a> any time.</div>
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
    <div class="tot"><span>Product total (pay on delivery)</span><span>${money(o.total)}</span></div>
    ${o.delivery_charge_verified ? `<div class="hint ok2">Delivery charge paid in advance and verified: <b>${money(o.delivery_charge)}</b></div>` : (['Cancelled', 'Returned', 'Failed'].includes(o.status) ? '' : `<div class="hint"><b>Delivery charge not yet verified.</b> ${DC_NOTICE}</div>`)}</div>`;
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
  window.scrollTo(0, 0); root.onclick = null; clearInterval(slideTimer); cancelAnimationFrame(bestRaf); if (bestOff) { bestOff(); bestOff = null; }
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

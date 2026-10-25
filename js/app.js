import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { initOps } from './ops.js';
import { initFin } from './fin.js';
import { initReports } from './reports.js';
import { initDash } from './dash.js';
import { initEst } from './est.js';
import { initWeb } from './web.js';
import { ic } from './icons.js';
import { initUI, setSelect, refreshCatData } from './ui.js';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const N = v => Number(v || 0);
const today = () => new Date().toLocaleDateString('en-CA');
const ROLE_LABEL = { owner: 'Owner', partner: 'Partner', salesman: 'Salesman', accountant: 'Accountant', warehouse: 'Warehouse' };
const state = { userId: null, profile: null };
const has = (...r) => r.includes(state.profile?.role);
const LOADING = '<p class="empty">Loading…</p>';
const opts = (rows, sel = '') => rows.map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
const chk = rs => { for (const r of rs) if (r.error) throw r.error; };

function toast(msg, type = '') {
  const d = document.createElement('div');
  d.textContent = msg; if (type) d.className = type;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 5000);
}
function errMsg(e) {
  const m = (e && e.message) || String(e), c = e && e.code;
  if (c === '23505') return 'This record already exists (duplicate).';
  if (c === '42501' || /permission denied|row-level security/i.test(m)) return 'You do not have permission to perform this action.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Network problem. Please check your connection and try again.';
  return m;
}
function authErr(e) {
  const m = (e && e.message) || '';
  if (/Invalid login/i.test(m)) return 'Incorrect email or password.';
  if (/not confirmed/i.test(m)) return 'Your email address is not confirmed yet. Please open the confirmation link sent to your inbox.';
  if (/already registered|already been registered/i.test(m)) return 'An account with this email already exists.';
  if (/at least|weak|short/i.test(m)) return 'Password must be at least 6 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  return errMsg(e);
}

/* ---------- auth screens ---------- */
function brandHtml() {
  return `<div class="hero" style="background-image:url(assets/cover.jpg)"></div>
  <div class="brand"><img class="logo" src="assets/logo.jpg" alt="RS KrishiCare" onerror="this.style.display='none'">
  <img class="wm" src="assets/wordmark.jpg" alt="" onerror="this.style.display='none'"></div>
  <p class="tag">মানসম্মত কৃষিপণ্য, সঠিক পরামর্শ, সমৃদ্ধ কৃষক</p>`;
}

function renderAuth(mode = 'login', notice = '') {
  const app = $('#app');
  const titles = { login: 'Sign in', signup: 'Create account', reset: 'Reset password' };
  app.innerHTML = `<div class="auth">${brandHtml()}
  <div class="panel">
    <div class="tabs"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Sign in</button>
    <button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">Sign up</button></div>
    ${notice ? `<p>${esc(notice)}</p>` : ''}
    <form id="af">
      ${mode === 'signup' ? '<label>Full name<input name="name" required autocomplete="name"></label>' : ''}
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      ${mode !== 'reset' ? `<label>Password<input name="password" type="password" minlength="6" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>` : ''}
      <button class="btn" style="width:100%">${titles[mode]}</button>
    </form>
    <p class="center">${mode === 'login' ? '<button class="link" data-m="reset">Forgot your password?</button>' : mode === 'reset' ? '<button class="link" data-m="login">← Back to sign in</button>' : ''}</p>
  </div></div>`;
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => renderAuth(b.dataset.m));
  $('#af').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), btn = e.target.querySelector('.btn');
    const email = fd.get('email').trim(), password = fd.get('password');
    btn.disabled = true;
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { data: { full_name: fd.get('name').trim() }, emailRedirectTo: location.origin }
        });
        if (error) throw error;
        if (!data.session) return renderAuth('login', 'A confirmation link has been sent to your email. Please confirm your address, then sign in.');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        return renderAuth('login', 'A password reset link has been sent to your email.');
      }
    } catch (err) { toast(authErr(err), 'err'); btn.disabled = false; }
  };
}

function renderNewPassword() {
  $('#app').innerHTML = `<div class="auth">${brandHtml()}<div class="panel"><h3>Set a new password</h3>
  <form id="pf"><label>New password<input name="p" type="password" minlength="6" required autocomplete="new-password"></label>
  <button class="btn" style="width:100%">Save password</button></form></div></div>`;
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('p') });
    if (error) return toast(authErr(error), 'err');
    toast('Password updated successfully.');
    state.recovery = false; state.userId = null;
    const { data } = await sb.auth.getSession(); handleSession(data.session);
  };
}

function renderPending() {
  $('#app').innerHTML = `<div class="auth">${brandHtml()}<div class="panel center"><h3>Awaiting approval</h3>
  <p>Your account has been created but is not active yet. The owner must activate it and assign your role.</p>
  <button class="btn ghost" id="lo">Sign out</button> <button class="btn" id="rf">Check again</button></div></div>`;
  $('#lo').onclick = logout; $('#rf').onclick = () => { state.userId = null; boot(); };
}

async function logout() {
  try { await sb.rpc('log_event', { p_action: 'logout' }); } catch (_) { }
  sessionStorage.removeItem('logged');
  state.userId = null; state.profile = null;
  await sb.auth.signOut();
}

/* ---------- session ---------- */
async function handleSession(session) {
  if (state.recovery) return;
  if (!session) { state.userId = null; state.profile = null; return renderAuth(); }
  if (state.userId === session.user.id && state.profile) return;
  const { data, error } = await sb.rpc('ensure_my_profile');
  if (error) { toast(errMsg(error), 'err'); return renderAuth(); }
  if (data.role === 'customer') { location.replace('/#/account'); return; }
  state.userId = session.user.id; state.profile = data;
  if (!sessionStorage.getItem('logged')) { sessionStorage.setItem('logged', '1'); sb.rpc('log_event', { p_action: 'login' }); }
  if (!data.is_active) return renderPending();
  renderShell();
}
async function boot() { const { data } = await sb.auth.getSession(); handleSession(data.session); }

sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') { state.recovery = true; setTimeout(renderNewPassword, 0); return; }
  if (ev === 'SIGNED_OUT') { setTimeout(() => handleSession(null), 0); return; }
  if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') setTimeout(() => handleSession(session), 0);
});

/* ---------- generic UI pieces ---------- */
function modal(title, body, onSave, saveLabel = 'Save') {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<form class="sheet"><div class="sheet-h"><b>${esc(title)}</b><button type="button" class="x">✕</button></div>
  <div class="sheet-b">${body}</div><div class="sheet-f"><button type="button" class="btn ghost x">Cancel</button><button class="btn">${esc(saveLabel)}</button></div></form>`;
  document.body.appendChild(m);
  m.querySelectorAll('.x').forEach(b => b.onclick = () => m.remove());
  m.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('.sheet-f .btn:last-child'); btn.disabled = true;
    try { await onSave(new FormData(e.target), m); m.remove(); }
    catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; }
  };
  return m;
}
// Resize the photo in the browser (max 1000px, JPEG) before uploading, so phone photos stay small and the site stays fast.
async function uploadImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
  const path = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.jpg';
  const { error } = await sb.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('Photo upload failed: ' + error.message);
  return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
function field(f, v) {
  const val = v?.[f.key] ?? f.def ?? '';
  if (f.type === 'select')
    return `<label>${f.label}<select name="${f.key}">${f.options.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  if (f.type === 'image')
    return `<label>${f.label}<div class="imgup">${val ? `<img src="${esc(val)}" alt="" class="imgprev">` : ''}<input type="hidden" name="${f.key}" value="${esc(val)}"><input type="file" name="${f.key}_file" accept="image/*"></div><small class="mut">Choose a photo from the camera or gallery. It is resized automatically.</small></label>`;
  if (f.type === 'check')
    return `<label class="chk"><input type="checkbox" name="${f.key}" ${(v ? v[f.key] : f.def !== false) ? 'checked' : ''}> ${f.label}</label>`;
  if (f.type === 'images') {
    const list = Array.isArray(val) ? val : [];
    return `<label>${f.label}<input type="hidden" name="${f.key}" value="${esc(JSON.stringify(list))}"><span class="fi-list">${list.map(u => `<span class="fi"><img src="${esc(u)}" alt=""><button type="button" class="fi-x" data-u="${esc(u)}" onclick="event.preventDefault();const h=this.closest('label').querySelector('input[type=hidden]');h.value=JSON.stringify(JSON.parse(h.value).filter(x=>x!==this.dataset.u));this.parentElement.remove()">✕ Remove</button></span>`).join('')}</span><input type="file" name="${f.key}_files" accept="image/*" multiple><small>You can keep up to 8 images. Removing happens when you press Save.</small></label>`;
  }
  if (f.type === 'textarea')
    return `<label>${f.label}<textarea name="${f.key}" rows="2">${esc(val)}</textarea></label>`;
  return `<label>${f.label}<input name="${f.key}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" min="0" inputmode="decimal"' : ''} ${f.req ? 'required' : ''} value="${esc(val)}"></label>`;
}
function readForm(fd, fields) {
  const o = {};
  for (const f of fields) {
    if (f.type === 'check') o[f.key] = fd.get(f.key) === 'on';
    else if (f.type === 'images') { try { o[f.key] = JSON.parse(fd.get(f.key) || '[]'); } catch (_) { o[f.key] = []; } }
    else if (f.type === 'number') { const n = Number(fd.get(f.key) || 0); o[f.key] = (f.nullZero && !n) ? null : n; }
    else { const v = (fd.get(f.key) || '').trim(); o[f.key] = v === '' ? null : v; }
  }
  return o;
}

async function listView(el, cfg) {
  el.innerHTML = `<div class="bar"><h2>${cfg.title}</h2>${cfg.canEdit ? '<button class="btn" id="add">+ New</button>' : ''}</div>
  ${cfg.note ? `<div class="hint">${cfg.note}</div>` : ''}
  <input id="q" class="search" placeholder="Search…"><div id="list" class="tablewrap">${LOADING}</div>`;
  let rows = [];
  const acts = cfg.actions || [];
  const draw = () => {
    const t = $('#q', el).value.toLowerCase();
    const r = rows.filter(x => cfg.searchKeys.some(k => String(x[k] ?? '').toLowerCase().includes(t)));
    const hasAct = cfg.canEdit || acts.length;
    $('#list', el).innerHTML = r.length
      ? `<table><thead><tr>${hasAct ? '<th>Actions</th>' : ''}${cfg.cols.map(c => `<th>${c.h}</th>`).join('')}</tr></thead><tbody>${r.map(x =>
        `<tr>${hasAct ? `<td>${cfg.canEdit ? `<button class="btn sm" data-id="${x.id}">Edit</button> ` : ''}${acts.map((a, i) => `<button class="btn sm ghost" data-act="${i}" data-rid="${x.id}">${a.label}</button>`).join(' ')}</td>` : ''}${cfg.cols.map(c => `<td>${c.f(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : `<p class="empty">${cfg.empty}</p>`;
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => edit(rows.find(x => x.id === b.dataset.id)));
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => acts[b.dataset.act].fn(rows.find(x => x.id === b.dataset.rid)));
  };
  const load = async () => { try { rows = await cfg.load(); draw(); } catch (e) { $('#list', el).innerHTML = `<p class="err pad">${esc(errMsg(e))}</p>`; } };
  const edit = row => modal(row ? cfg.editTitle : cfg.newTitle, cfg.fields.map(f => field(f, row)).join(''), async fd => {
    const p = readForm(fd, cfg.fields);
    if (cfg.validate) cfg.validate(p);
    for (const f of cfg.fields.filter(x => x.type === 'images')) {
      const files = fd.getAll(f.key + '_files').filter(x => x && x.size), cur = p[f.key] || [];
      if (cur.length + files.length > 8) throw new Error('You can keep up to 8 feature images. Remove some first.');
      for (const file of files) cur.push(await uploadImage(file));
      p[f.key] = cur;
    }
    for (const f of cfg.fields.filter(x => x.type === 'image')) { const file = fd.get(f.key + '_file'); if (file && file.size) p[f.key] = await uploadImage(file); }
    const { error } = row ? await sb.from(cfg.table).update(p).eq('id', row.id) : await sb.from(cfg.table).insert(p);
    if (error) throw error;
    toast('Saved successfully.'); await load();
  });
  $('#q', el).oninput = draw;
  if (cfg.canEdit) $('#add', el).onclick = () => edit(null);
  await load();
}

const confirmReason = (title, intro, fn, after) => modal(title, `<p>${intro}</p><label>Reason<input name="reason" required></label>`, async fd => {
  const { error } = await fn(fd.get('reason')); if (error) throw error;
  toast('Completed successfully.'); await after();
}, 'Confirm');
const fsec = (n, title, body, hint = '') => `<div class="fsec"><div class="fsec-h"><span class="fsec-n">${n}</span><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="fsec-b">${body}</div></div>`;
const carry = {};
const H = { sb, $, esc, money, num, N, today, toast, errMsg, has, modal, field, readForm, listView, opts, chk, state, LOADING, confirmReason, fsec, carry, setSel: setSelect };
const ops = initOps(H);
const fin = initFin(H, ops);
const est = initEst(H, ops);
const web = initWeb(H);
const rep = initReports(H);
const dash = initDash(H);

/* ---------- shell & routing ---------- */
const ALL = ['owner', 'partner', 'salesman', 'accountant', 'warehouse'];
const FIN = ['owner', 'partner', 'accountant'];
const NAV = [
  { id: 'dash', ic: 'layout', t: 'Dashboard', roles: ALL, fn: viewDash },
  { id: 'sales', ic: 'bag', t: 'Retailer Sales', roles: ['owner', 'partner', 'salesman'], fn: ops.viewSales },
  { id: 'estimates', ic: 'file', t: 'Estimates', roles: ['owner', 'partner', 'salesman'], fn: est.viewEstimates },
  { id: 'facebook', ic: 'message', t: 'Facebook Orders', roles: ALL, fn: fin.viewFacebook },
  { id: 'weborders', ic: 'globe', t: 'Website Orders', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: el => fin.viewFacebook(el, 'website') },
  { id: 'payments', ic: 'card', t: 'Payments & Receivables', roles: ['owner', 'partner', 'accountant', 'salesman'], fn: ops.viewPayments },
  { id: 'purchases', ic: 'truck', t: 'Purchases', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: ops.viewPurchases },
  { id: 'products', ic: 'package', t: 'Products & Stock', roles: ALL, fn: viewProducts },
  { id: 'inventory', ic: 'clipboard', t: 'Inventory Control', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: fin.viewInventory },
  { id: 'expenses', ic: 'wallet', t: 'Expenses', roles: FIN, fn: fin.viewExpenses },
  { id: 'finance', ic: 'landmark', t: 'Finance & Accounts', roles: FIN, fn: fin.viewFinance },
  { id: 'capital', ic: 'usersRound', t: 'Partners & Capital', roles: FIN, fn: fin.viewCapital },
  { id: 'retailers', ic: 'store', t: 'Retailers', roles: ALL, fn: viewRetailers },
  { id: 'suppliers', ic: 'truck', t: 'Suppliers', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: viewSuppliers },
  { id: 'reports', ic: 'chart', t: 'Reports', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: rep.viewReports },
  { id: 'custom', ic: 'filter', t: 'Custom Report', roles: FIN, fn: rep.viewCustom },
  { id: 'webact', ic: 'globe', t: 'Website Activity', roles: FIN, fn: web.viewWebActivity },
  { id: 'users', ic: 'user', t: 'Users & Roles', roles: ['owner'], fn: viewUsers },
  { id: 'audit', ic: 'shield', t: 'Audit Log', roles: ['owner'], fn: fin.viewAudit },
  { id: 'settings', ic: 'sliders', t: 'Settings', roles: ['owner'], fn: fin.viewSettings }
];

function renderShell() {
  const items = NAV.filter(n => n.roles.includes(state.profile.role));
  $('#app').innerHTML = `<header class="top"><button id="menu" class="hb" aria-label="Menu">${ic('menu', 22)}</button>
  <div class="brand-h"><img src="assets/logo.jpg" alt="" onerror="this.style.display='none'"><b>RS KrishiCare</b></div>
  <div class="who"><b>${esc(state.profile.full_name)}</b><span>${ROLE_LABEL[state.profile.role]}</span></div>
  <button id="rf" class="hb sub hide-sm" aria-label="Refresh data" title="Refresh">${ic('refresh', 18)}</button>
  <button id="lo" class="hb" aria-label="Sign out" title="Sign out">${ic('logout', 20)}</button></header>
  <nav class="side" id="nav"><div class="nav-brand"><img src="assets/wordmark.jpg" alt="RS KrishiCare" onerror="this.style.display='none'"><small>মানসম্মত কৃষিপণ্য, সঠিক পরামর্শ, সমৃদ্ধ কৃষক</small></div>${items.map(n => `<a href="#${n.id}" data-id="${n.id}">${ic(n.ic, 20)}<span>${n.t}</span></a>`).join('')}<button type="button" class="navbtn" id="nrf">${ic('refresh', 20)}<span>Refresh data</span></button></nav>
  <main id="view"></main>
  <footer class="foot"><img src="assets/wordmark.jpg" alt="RS KrishiCare" onerror="this.style.display='none'"><div>মানসম্মত কৃষিপণ্য, সঠিক পরামর্শ, সমৃদ্ধ কৃষক</div><div class="ver">Version 2026.10.08-4</div></footer>`;
  $('#menu').onclick = () => $('#nav').classList.toggle('open');
  $('#lo').onclick = logout;
  const refresh = () => { const b = $('#rf'); b.disabled = true; route().finally(() => { b.disabled = false; }); };
  $('#rf').onclick = refresh; $('#nrf').onclick = refresh;
  $('#nav').onclick = () => $('#nav').classList.remove('open');
  window.onhashchange = route; route();
}

async function route() {
  const items = NAV.filter(n => n.roles.includes(state.profile.role));
  const id = location.hash.slice(1);
  const cur = items.find(n => n.id === id) || items[0];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.id === cur.id));
  const el = $('#view'); el.innerHTML = LOADING;
  try { await refreshCatData(sb); await cur.fn(el); } catch (e) { el.innerHTML = `<p class="err">${esc(errMsg(e))}</p>`; }
}

/* ---------- views ---------- */
const card = (label, val, cls = '') => `<div class="card ${cls}"><div class="l">${label}</div><div class="v">${val}</div></div>`;

async function viewDash(el) {
  if (has('salesman')) return dashSales(el);
  if (has('warehouse')) return dashStore(el);
  return dash.view(el);
}

async function dashStore(el) {
  const { data, error } = await sb.from('v_stock').select('qty_on_hand,is_low'); if (error) throw error;
  const q = data.reduce((s, x) => s + Number(x.qty_on_hand), 0), low = data.filter(x => x.is_low).length;
  el.innerHTML = `<div class="bar"><h2>Stock overview</h2></div><div class="grid">
   ${card('Products', num(data.length))}${card('Total stock quantity', num(q))}${card('Low-stock items', num(low), low ? 'neg' : '')}</div>`;
}
async function dashSales(el) {
  const { data, error } = await sb.from('v_my_sales').select('total,due'); if (error) throw error;
  const t = data.reduce((s, x) => s + Number(x.total), 0), due = data.reduce((s, x) => s + Number(x.due), 0);
  el.innerHTML = `<div class="bar"><h2>My sales</h2></div><div class="grid">
   ${card('Invoices', num(data.length))}${card('Total sales', money(t))}${card('Outstanding due', money(due))}</div>`;
}

async function viewProducts(el) {
  const seeCost = !has('salesman'), canEdit = has('owner', 'partner', 'warehouse');
  const { data: cats, error: ce } = await sb.from('categories').select('id,name').eq('is_active', true).order('name'); if (ce) throw ce;
  const cname = Object.fromEntries(cats.map(c => [c.id, c.name]));
  const fields = [
    { key: 'name', label: 'Product name', req: true }, { key: 'sku', label: 'SKU / code' },
    { key: 'category_id', label: 'Category', type: 'select', options: [['', '— Select —'], ...cats.map(c => [c.id, c.name])] },
    { key: 'unit', label: 'Unit', type: 'select', def: 'piece', options: ['piece', 'packet', 'kg', 'gram', 'litre', 'ml', 'bag', 'carton', 'bundle', 'set', 'other'].map(u => [u, u]) },
    { key: 'units_per_carton', label: 'Pieces per carton (used to share shipping costs automatically)', type: 'number', nullZero: true },
    { key: 'sell_price', label: 'Standard retailer price', type: 'number' }, { key: 'facebook_price', label: 'Facebook price', type: 'number' },
    { key: 'min_stock', label: 'Minimum stock (low-stock alert)', type: 'number' },
    { key: 'image_url', label: 'Product photo', type: 'image' },
    { key: 'feature_images', label: 'Feature images (shown on the product page)', type: 'images' },
    { key: 'description', label: 'Description (shown on the website)', type: 'textarea' },
    { key: 'web_price', label: 'Website price (৳)', type: 'number', nullZero: true },
    { key: 'web_old_price', label: 'Regular price before discount (optional — lists the product under "Offer")', type: 'number', nullZero: true },
    { key: 'web_visible', label: 'Show this product on the public website', type: 'check', def: false },
    { key: 'is_active', label: 'Active', type: 'check' }
  ];
  const cols = [
    { h: 'Product', f: x => `<b>${esc(x.name)}</b>${x.sku ? `<br><small>${esc(x.sku)}</small>` : ''}` },
    { h: 'Category', f: x => esc(cname[x.category_id] || '—') },
    { h: 'Stock', f: x => `<span class="badge ${seeCost && Number(x.qty_on_hand) <= Number(x.min_stock) ? 'low' : ''}">${num(x.qty_on_hand)} ${esc(x.unit)}</span>` },
    { h: 'Retailer price', f: x => money(x.sell_price) }, { h: 'Facebook price', f: x => money(x.facebook_price) }
  ];
  if (seeCost) cols.splice(1, 0, { h: 'Photo', f: x => x.image_url ? `<img class="thumb" src="${esc(x.image_url)}" alt="" loading="lazy">` : '—' });
  if (seeCost) cols.push({ h: 'Website', f: x => x.web_visible ? (x.web_price ? `<span class="badge">${money(x.web_price)}</span>` : '<span class="badge low">No price</span>') : '<small>Hidden</small>' });
  if (seeCost) cols.splice(4, 0, { h: 'Pieces / carton', f: x => x.units_per_carton ? num(x.units_per_carton) : '—' });
  if (seeCost) cols.push({ h: 'Avg. cost (WAC)', f: x => money(x.avg_cost) }, { h: 'Stock value', f: x => money(Number(x.qty_on_hand) * Number(x.avg_cost)) });
  await listView(el, {
    title: 'Products & Stock', table: 'products', canEdit, fields, cols, searchKeys: ['name', 'sku'],
    validate: p => { if (p.web_visible && !(Number(p.web_price) > 0)) throw new Error('Enter a website price to show this product on the public website.'); },
    newTitle: 'New product', editTitle: 'Edit product', empty: 'No products yet. Use “+ New” to add your first product.',
    note: canEdit ? 'Tap <b>Edit</b> to correct a product’s name, code, category, unit, prices or minimum stock. Stock quantity and average cost are controlled by purchases, sales and Inventory Control and cannot be typed in here. To remove a product from use, untick “Active”.' : '',
    load: async () => {
      const q = seeCost ? sb.from('products').select('*').order('name').limit(2000) : sb.from('v_products_sales').select('*').order('name').limit(2000);
      const { data, error } = await q; if (error) throw error; return data;
    }
  });
}

async function viewRetailers(el) {
  const canPrice = has('owner', 'partner');
  await listView(el, {
    title: 'Retailers & Dealers', table: 'retailers', canEdit: has('owner', 'partner', 'salesman', 'accountant'),
    fields: [{ key: 'name', label: 'Name', req: true }, { key: 'phone', label: 'Mobile', type: 'tel' }, { key: 'address', label: 'Address' },
    { key: 'notes', label: 'Notes', type: 'textarea' }, { key: 'is_active', label: 'Active', type: 'check' }],
    cols: [{ h: 'Name', f: x => `<b>${esc(x.name)}</b>` }, { h: 'Mobile', f: x => esc(x.phone || '—') }, { h: 'Address', f: x => esc(x.address || '—') },
    { h: 'Status', f: x => x.is_active ? 'Active' : 'Inactive' }],
    searchKeys: ['name', 'phone'], newTitle: 'New retailer', editTitle: 'Edit retailer', empty: 'No retailers yet.',
    actions: canPrice ? [{ label: 'Prices', fn: r => retailerPrices(r) }] : [],
    load: async () => { const { data, error } = await sb.from('retailers').select('*').order('name').limit(2000); if (error) throw error; return data; }
  });
}

async function retailerPrices(r) {
  const [p, rp] = await Promise.all([
    sb.from('products').select('id,name,unit,sell_price').eq('is_active', true).order('name'),
    sb.from('retailer_prices').select('product_id,price').eq('retailer_id', r.id)
  ]);
  chk([p, rp]);
  if (!p.data.length) return toast('Add products first.', 'err');
  const cur = Object.fromEntries(rp.data.map(x => [x.product_id, x.price]));
  modal('Special prices — ' + r.name,
    `<p class="mut">Leave a field empty to use the standard price. Entered prices apply automatically on new sales for this retailer.</p>` +
    p.data.map(x => `<label>${esc(x.name)} <small>(standard ${money(x.sell_price)} / ${esc(x.unit)})</small><input name="${x.id}" type="number" step="any" min="0" inputmode="decimal" value="${cur[x.id] ?? ''}"></label>`).join(''),
    async fd => {
      const rows = p.data.map(x => ({ retailer_id: r.id, product_id: x.id, price: fd.get(x.id) })).filter(x => x.price !== '' && x.price !== null).map(x => ({ ...x, price: Number(x.price) }));
      if (!rows.length) return;
      const { error } = await sb.from('retailer_prices').upsert(rows, { onConflict: 'retailer_id,product_id' });
      if (error) throw error; toast('Prices saved.');
    });
}

async function viewSuppliers(el) {
  await listView(el, {
    title: 'Suppliers', table: 'suppliers', canEdit: true,
    fields: [{ key: 'name', label: 'Name', req: true }, { key: 'phone', label: 'Mobile', type: 'tel' }, { key: 'address', label: 'Address' },
    { key: 'contact_person', label: 'Contact person' }, { key: 'payment_terms', label: 'Payment terms' },
    { key: 'notes', label: 'Notes', type: 'textarea' }, { key: 'is_active', label: 'Active', type: 'check' }],
    cols: [{ h: 'Name', f: x => `<b>${esc(x.name)}</b>` }, { h: 'Mobile', f: x => esc(x.phone || '—') }, { h: 'Address', f: x => esc(x.address || '—') },
    { h: 'Status', f: x => x.is_active ? 'Active' : 'Inactive' }],
    searchKeys: ['name', 'phone'], newTitle: 'New supplier', editTitle: 'Edit supplier', empty: 'No suppliers yet.',
    load: async () => { const { data, error } = await sb.from('suppliers').select('*').order('name').limit(2000); if (error) throw error; return data; }
  });
}

async function viewUsers(el) {
  const { data, error } = await sb.from('profiles').select('*').neq('role', 'customer').order('created_at'); if (error) throw error;
  el.innerHTML = `<div class="bar"><h2>Users & Roles</h2></div>
  <p class="mut">New users appear here as inactive after they sign up. Choose a role and activate them.</p>
  <div class="tablewrap"><table><thead><tr><th>Name</th><th>Role</th><th>Active</th><th></th></tr></thead><tbody>
  ${data.map(u => `<tr data-u="${u.id}"><td>${esc(u.full_name)}${u.id === state.userId ? ' <small>(you)</small>' : ''}</td>
    <td><select>${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
    <td><input type="checkbox" ${u.is_active ? 'checked' : ''} style="width:22px;height:22px"></td>
    <td><button class="btn sm">Save</button></td></tr>`).join('')}</tbody></table></div>`;
  el.querySelectorAll('tr[data-u]').forEach(tr => {
    tr.querySelector('button').onclick = async () => {
      const { error } = await sb.rpc('set_user_role', { p_user: tr.dataset.u, p_role: tr.querySelector('select').value, p_active: tr.querySelector('input').checked });
      if (error) return toast(errMsg(error), 'err');
      toast('User updated.');
    };
  });
}

initUI();
boot();

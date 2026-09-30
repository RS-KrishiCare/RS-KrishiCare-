import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { initOps } from './ops.js';
import { initFin } from './fin.js';
import { initReports } from './reports.js';

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
function field(f, v) {
  const val = v?.[f.key] ?? f.def ?? '';
  if (f.type === 'select')
    return `<label>${f.label}<select name="${f.key}">${f.options.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  if (f.type === 'check')
    return `<label class="chk"><input type="checkbox" name="${f.key}" ${(v ? v[f.key] : true) ? 'checked' : ''}> ${f.label}</label>`;
  if (f.type === 'textarea')
    return `<label>${f.label}<textarea name="${f.key}" rows="2">${esc(val)}</textarea></label>`;
  return `<label>${f.label}<input name="${f.key}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" min="0" inputmode="decimal"' : ''} ${f.req ? 'required' : ''} value="${esc(val)}"></label>`;
}
function readForm(fd, fields) {
  const o = {};
  for (const f of fields) {
    if (f.type === 'check') o[f.key] = fd.get(f.key) === 'on';
    else if (f.type === 'number') o[f.key] = Number(fd.get(f.key) || 0);
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
      ? `<table><thead><tr>${cfg.cols.map(c => `<th>${c.h}</th>`).join('')}${hasAct ? '<th></th>' : ''}</tr></thead><tbody>${r.map(x =>
        `<tr>${cfg.cols.map(c => `<td>${c.f(x)}</td>`).join('')}${hasAct ? `<td>${cfg.canEdit ? `<button class="btn sm ghost" data-id="${x.id}">Edit</button> ` : ''}${acts.map((a, i) => `<button class="btn sm ghost" data-act="${i}" data-rid="${x.id}">${a.label}</button>`).join(' ')}</td>` : ''}</tr>`).join('')}</tbody></table>`
      : `<p class="empty">${cfg.empty}</p>`;
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => edit(rows.find(x => x.id === b.dataset.id)));
    el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => acts[b.dataset.act].fn(rows.find(x => x.id === b.dataset.rid)));
  };
  const load = async () => { try { rows = await cfg.load(); draw(); } catch (e) { $('#list', el).innerHTML = `<p class="err pad">${esc(errMsg(e))}</p>`; } };
  const edit = row => modal(row ? cfg.editTitle : cfg.newTitle, cfg.fields.map(f => field(f, row)).join(''), async fd => {
    const p = readForm(fd, cfg.fields);
    const { error } = row ? await sb.from(cfg.table).update(p).eq('id', row.id) : await sb.from(cfg.table).insert(p);
    if (error) throw error;
    toast('Saved successfully.'); await load();
  });
  $('#q', el).oninput = draw;
  if (cfg.canEdit) $('#add', el).onclick = () => edit(null);
  await load();
}

const H = { sb, $, esc, money, num, N, today, toast, errMsg, has, modal, field, readForm, listView, opts, chk, state, LOADING };
const ops = initOps(H);
const fin = initFin(H, ops);
const rep = initReports(H);

/* ---------- shell & routing ---------- */
const ALL = ['owner', 'partner', 'salesman', 'accountant', 'warehouse'];
const FIN = ['owner', 'partner', 'accountant'];
const NAV = [
  { id: 'dash', t: 'Dashboard', roles: ALL, fn: viewDash },
  { id: 'sales', t: 'Retailer Sales', roles: ['owner', 'partner', 'salesman'], fn: ops.viewSales },
  { id: 'facebook', t: 'Facebook Orders', roles: ALL, fn: fin.viewFacebook },
  { id: 'payments', t: 'Payments & Receivables', roles: ['owner', 'partner', 'accountant', 'salesman'], fn: ops.viewPayments },
  { id: 'purchases', t: 'Purchases', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: ops.viewPurchases },
  { id: 'products', t: 'Products & Stock', roles: ALL, fn: viewProducts },
  { id: 'inventory', t: 'Inventory Control', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: fin.viewInventory },
  { id: 'expenses', t: 'Expenses', roles: FIN, fn: fin.viewExpenses },
  { id: 'finance', t: 'Finance & Accounts', roles: FIN, fn: fin.viewFinance },
  { id: 'capital', t: 'Partners & Capital', roles: FIN, fn: fin.viewCapital },
  { id: 'retailers', t: 'Retailers', roles: ALL, fn: viewRetailers },
  { id: 'suppliers', t: 'Suppliers', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: viewSuppliers },
  { id: 'reports', t: 'Reports', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: rep.viewReports },
  { id: 'custom', t: 'Custom Report', roles: FIN, fn: rep.viewCustom },
  { id: 'users', t: 'Users & Roles', roles: ['owner'], fn: viewUsers },
  { id: 'audit', t: 'Audit Log', roles: ['owner'], fn: fin.viewAudit },
  { id: 'settings', t: 'Settings', roles: ['owner'], fn: fin.viewSettings }
];

function renderShell() {
  const items = NAV.filter(n => n.roles.includes(state.profile.role));
  $('#app').innerHTML = `<header class="top"><button id="menu" aria-label="Menu">☰</button>
  <img src="assets/logo.jpg" alt="" onerror="this.style.display='none'"><b>RS KrishiCare</b>
  <div class="who">${esc(state.profile.full_name)}<br>${ROLE_LABEL[state.profile.role]}</div><button id="lo" title="Sign out">⎋</button></header>
  <nav class="side" id="nav">${items.map(n => `<a href="#${n.id}" data-id="${n.id}">${n.t}</a>`).join('')}</nav>
  <main id="view"></main>`;
  $('#menu').onclick = () => $('#nav').classList.toggle('open');
  $('#lo').onclick = logout;
  $('#nav').onclick = () => $('#nav').classList.remove('open');
  window.onhashchange = route; route();
}

async function route() {
  const items = NAV.filter(n => n.roles.includes(state.profile.role));
  const id = location.hash.slice(1);
  const cur = items.find(n => n.id === id) || items[0];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.id === cur.id));
  const el = $('#view'); el.innerHTML = LOADING;
  try { await cur.fn(el); } catch (e) { el.innerHTML = `<p class="err">${esc(errMsg(e))}</p>`; }
}

/* ---------- views ---------- */
const card = (label, val, cls = '') => `<div class="card ${cls}"><div class="l">${label}</div><div class="v">${val}</div></div>`;

async function viewDash(el) {
  if (has('salesman')) return dashSales(el);
  if (has('warehouse')) return dashStore(el);
  const qs = [
    ['v_dashboard', sb.from('v_dashboard').select('*').maybeSingle()],
    ['v_account_balances', sb.from('v_account_balances').select('*').order('name')],
    ['v_partner_summary', sb.from('v_partner_summary').select('*').order('name')],
    ['v_stock', sb.from('v_stock').select('name,unit,qty_on_hand,min_stock').eq('is_low', true).order('name').limit(10)],
    ['v_daily', sb.from('v_daily').select('*').order('day', { ascending: false }).limit(14)]
  ];
  const res = await Promise.all(qs.map(x => x[1]));
  const bad = res.map((r, i) => r.error ? `${qs[i][0]}: ${r.error.message}` : null).filter(Boolean);
  if (bad.length) { el.innerHTML = `<p class="err">The dashboard could not be loaded. Technical details:<br><small>${esc(bad.join(' | '))}</small></p>`; return; }
  const [f, a, p, s, dy] = res;
  const d = f.data || {};
  const neg = v => Number(v) < 0 ? 'neg' : '';
  const t = (dy.data || []).find(x => x.day === today()) || { sales: 0, expenses: 0, profit: 0 };
  el.innerHTML = `<div class="bar"><h2>Dashboard</h2></div>
  <h3 class="sec">Today</h3><div class="grid">
    ${card('Sales', money(t.sales))}${card('Expenses and losses', money(t.expenses))}${card('Profit', money(t.profit), neg(t.profit))}</div>
  <h3 class="sec">Capital and equity</h3><div class="grid">
    ${card('Initial investment', money(d.initial_investment))}${card('Additional partner capital', money(d.additional_capital))}
    ${card('Current business equity', money(d.business_equity), 'hi')}${card('Retained profit', money(d.retained_profit), neg(d.retained_profit))}
    ${card('Capital withdrawals', money(d.capital_withdrawals))}${card('Profit withdrawals', money(d.profit_withdrawals))}</div>
  <h3 class="sec">Sales and profit</h3><div class="grid">
    ${card('Total sales', money(d.total_sales))}${card('Gross profit', money(d.gross_profit), neg(d.gross_profit))}
    ${card('Net profit', money(d.net_profit), neg(d.net_profit))}${card('Net margin', num(d.net_margin_pct) + '%')}
    ${card('Operating expenses', money(d.total_expenses))}${card('Damage / loss', money(d.damage_loss))}</div>
  <h3 class="sec">Stock and dues</h3><div class="grid">
    ${card('Stock quantity', num(d.stock_qty))}${card('Stock value', money(d.stock_value))}
    ${card('Low-stock items', num(d.low_stock_count), Number(d.low_stock_count) > 0 ? 'neg' : '')}
    ${card('Retailer due', money(d.retailer_due))}${card('Supplier due', money(d.supplier_due))}</div>
  <h3 class="sec">Cash, bank and mobile wallets</h3><div class="grid">
    ${(a.data || []).map(x => card(esc(x.name), money(x.balance), neg(x.balance))).join('')}</div>
  <h3 class="sec">Facebook orders</h3><div class="grid">
    ${card('Pending', num(d.fb_pending))}${card('Delivered', num(d.fb_delivered))}${card('Returned', num(d.fb_returned))}
    ${card('COD pending', money(d.fb_cod_pending))}${card('Courier advance pending', money(d.courier_advance_pending))}</div>
  <h3 class="sec">Partners</h3><div class="tablewrap"><table><thead><tr><th>Partner</th><th>Profit share</th><th>Capital</th><th>Profit entitlement</th><th>Profit withdrawn</th><th>Equity</th></tr></thead><tbody>
    ${(p.data || []).map(x => `<tr><td>${esc(x.name)}</td><td>${num(x.profit_pct)}%</td><td>${money(x.capital_balance)}</td><td>${money(x.profit_share)}</td><td>${money(x.profit_withdrawn)}</td><td><b>${money(x.partner_equity)}</b></td></tr>`).join('')}</tbody></table></div>
  <h3 class="sec">Daily sales, expenses and profit</h3>${(dy.data || []).length
      ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Sales</th><th>Expenses and losses</th><th>Profit</th></tr></thead><tbody>${dy.data.map(x => `<tr><td>${esc(x.day)}</td><td>${money(x.sales)}</td><td>${money(x.expenses)}</td><td><b>${money(x.profit)}</b></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">No daily activity recorded yet.</p>'}
  <h3 class="sec">Low-stock products</h3>${(s.data || []).length
      ? `<div class="tablewrap"><table><tbody>${s.data.map(x => `<tr><td>${esc(x.name)}</td><td><span class="badge low">${num(x.qty_on_hand)} ${esc(x.unit)}</span></td><td><small>Minimum ${num(x.min_stock)}</small></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">No products are below their minimum stock level.</p>'}`;
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
    { key: 'sell_price', label: 'Standard retailer price', type: 'number' }, { key: 'facebook_price', label: 'Facebook price', type: 'number' },
    { key: 'min_stock', label: 'Minimum stock (low-stock alert)', type: 'number' }, { key: 'is_active', label: 'Active', type: 'check' }
  ];
  const cols = [
    { h: 'Product', f: x => `<b>${esc(x.name)}</b>${x.sku ? `<br><small>${esc(x.sku)}</small>` : ''}` },
    { h: 'Category', f: x => esc(cname[x.category_id] || '—') },
    { h: 'Stock', f: x => `<span class="badge ${seeCost && Number(x.qty_on_hand) <= Number(x.min_stock) ? 'low' : ''}">${num(x.qty_on_hand)} ${esc(x.unit)}</span>` },
    { h: 'Retailer price', f: x => money(x.sell_price) }, { h: 'Facebook price', f: x => money(x.facebook_price) }
  ];
  if (seeCost) cols.push({ h: 'Avg. cost (WAC)', f: x => money(x.avg_cost) }, { h: 'Stock value', f: x => money(Number(x.qty_on_hand) * Number(x.avg_cost)) });
  await listView(el, {
    title: 'Products & Stock', table: 'products', canEdit, fields, cols, searchKeys: ['name', 'sku'],
    newTitle: 'New product', editTitle: 'Edit product', empty: 'No products yet. Use “+ New” to add your first product.',
    note: canEdit ? 'Stock quantity and average cost are controlled by purchases, sales and inventory adjustments and cannot be edited here.' : '',
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
  const { data, error } = await sb.from('profiles').select('*').order('created_at'); if (error) throw error;
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

boot();

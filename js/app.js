import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { initOps } from './ops.js';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const ROLE_BN = { owner: 'মালিক', partner: 'অংশীদার', salesman: 'সেলসম্যান', accountant: 'হিসাবরক্ষক', warehouse: 'গোডাউন' };
const state = { userId: null, profile: null };
const has = (...r) => r.includes(state.profile?.role);
const LOADING = '<p class="empty">লোড হচ্ছে…</p>';

function toast(msg, type = '') {
  const d = document.createElement('div');
  d.textContent = msg; if (type) d.className = type;
  $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 4500);
}
function errMsg(e) {
  const m = (e && e.message) || String(e), c = e && e.code;
  if (c === '23505') return 'এই তথ্য আগে থেকেই আছে (ডুপ্লিকেট)';
  if (c === '42501' || /permission denied|row-level security/i.test(m)) return 'এই কাজের অনুমতি আপনার নেই';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'ইন্টারনেট সংযোগে সমস্যা। আবার চেষ্টা করুন';
  return m;
}
function authErr(e) {
  const m = (e && e.message) || '';
  if (/Invalid login/i.test(m)) return 'ইমেইল বা পাসওয়ার্ড ভুল';
  if (/not confirmed/i.test(m)) return 'ইমেইল এখনো কনফার্ম করা হয়নি। ইমেইলের লিংকে চাপ দিন';
  if (/already registered|already been registered/i.test(m)) return 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে';
  if (/at least|weak|short/i.test(m)) return 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন';
  if (/rate limit|too many/i.test(m)) return 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন';
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
  const titles = { login: 'লগইন', signup: 'নতুন অ্যাকাউন্ট', reset: 'পাসওয়ার্ড রিসেট' };
  app.innerHTML = `<div class="auth">${brandHtml()}
  <div class="panel">
    <div class="tabs"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">লগইন</button>
    <button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">সাইন আপ</button></div>
    ${notice ? `<p>${esc(notice)}</p>` : ''}
    <form id="af">
      ${mode === 'signup' ? '<label>আপনার নাম<input name="name" required autocomplete="name"></label>' : ''}
      <label>ইমেইল<input name="email" type="email" required autocomplete="email"></label>
      ${mode !== 'reset' ? `<label>পাসওয়ার্ড<input name="password" type="password" minlength="6" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>` : ''}
      <button class="btn" style="width:100%">${titles[mode]}</button>
    </form>
    <p class="center">${mode === 'login' ? '<button class="link" data-m="reset">পাসওয়ার্ড ভুলে গেছেন?</button>' : mode === 'reset' ? '<button class="link" data-m="login">← লগইনে ফিরুন</button>' : ''}</p>
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
        if (!data.session) return renderAuth('login', 'ইমেইলে একটি কনফার্মেশন লিংক পাঠানো হয়েছে। লিংকে চাপ দিয়ে কনফার্ম করে তারপর লগইন করুন।');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        return renderAuth('login', 'পাসওয়ার্ড রিসেটের লিংক ইমেইলে পাঠানো হয়েছে।');
      }
    } catch (err) { toast(authErr(err), 'err'); btn.disabled = false; }
  };
}

function renderNewPassword() {
  $('#app').innerHTML = `<div class="auth">${brandHtml()}<div class="panel"><h3>নতুন পাসওয়ার্ড দিন</h3>
  <form id="pf"><label>নতুন পাসওয়ার্ড<input name="p" type="password" minlength="6" required autocomplete="new-password"></label>
  <button class="btn" style="width:100%">সংরক্ষণ</button></form></div></div>`;
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('p') });
    if (error) return toast(authErr(error), 'err');
    toast('পাসওয়ার্ড পরিবর্তন হয়েছে');
    state.recovery = false; state.userId = null;
    const { data } = await sb.auth.getSession(); handleSession(data.session);
  };
}

function renderPending() {
  $('#app').innerHTML = `<div class="auth">${brandHtml()}<div class="panel center"><h3>অনুমোদনের অপেক্ষায়</h3>
  <p>আপনার অ্যাকাউন্ট এখনো সক্রিয় হয়নি। মালিক সক্রিয় করে রোল দিলে আপনি ব্যবহার করতে পারবেন।</p>
  <button class="btn ghost" id="lo">লগআউট</button> <button class="btn" id="rf">আবার দেখুন</button></div></div>`;
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

/* ---------- shell & routing ---------- */
const ALL = ['owner', 'partner', 'salesman', 'accountant', 'warehouse'];
const ops = initOps({ sb, $, esc, money, num, toast, errMsg, has, modal });
const NAV = [
  { id: 'dash', t: 'ড্যাশবোর্ড', roles: ALL, fn: viewDash },
  { id: 'sales', t: 'রিটেইলার বিক্রয়', roles: ['owner', 'partner', 'salesman'], fn: ops.viewSales },
  { id: 'payments', t: 'পেমেন্ট/পাওনা', roles: ['owner', 'partner', 'accountant', 'salesman'], fn: ops.viewPayments },
  { id: 'purchases', t: 'ক্রয়', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: ops.viewPurchases },
  { id: 'products', t: 'পণ্য/স্টক', roles: ALL, fn: viewProducts },
  { id: 'retailers', t: 'রিটেইলার', roles: ALL, fn: viewRetailers },
  { id: 'suppliers', t: 'সরবরাহকারী', roles: ['owner', 'partner', 'accountant', 'warehouse'], fn: viewSuppliers },
  { id: 'users', t: 'ইউজার', roles: ['owner'], fn: viewUsers }
];

function renderShell() {
  const items = NAV.filter(n => n.roles.includes(state.profile.role));
  $('#app').innerHTML = `<header class="top"><button id="menu" aria-label="মেনু">☰</button>
  <img src="assets/logo.jpg" alt="" onerror="this.style.display='none'"><b>RS KrishiCare</b>
  <div class="who">${esc(state.profile.full_name)}<br>${ROLE_BN[state.profile.role]}</div><button id="lo" title="লগআউট">⎋</button></header>
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

/* ---------- generic UI pieces ---------- */
function modal(title, body, onSave) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<form class="sheet"><div class="sheet-h"><b>${esc(title)}</b><button type="button" class="x">✕</button></div>
  <div class="sheet-b">${body}</div><div class="sheet-f"><button type="button" class="btn ghost x">বাতিল</button><button class="btn">সংরক্ষণ</button></div></form>`;
  document.body.appendChild(m);
  m.querySelectorAll('.x').forEach(b => b.onclick = () => m.remove());
  m.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('.sheet-f .btn:last-child'); btn.disabled = true;
    try { await onSave(new FormData(e.target)); m.remove(); }
    catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; }
  };
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
  el.innerHTML = `<div class="bar"><h2>${cfg.title}</h2>${cfg.canEdit ? '<button class="btn" id="add">+ নতুন</button>' : ''}</div>
  <input id="q" class="search" placeholder="খুঁজুন…"><div id="list" class="tablewrap">${LOADING}</div>`;
  let rows = [];
  const draw = () => {
    const t = $('#q', el).value.toLowerCase();
    const r = rows.filter(x => cfg.searchKeys.some(k => String(x[k] ?? '').toLowerCase().includes(t)));
    $('#list', el).innerHTML = r.length
      ? `<table><thead><tr>${cfg.cols.map(c => `<th>${c.h}</th>`).join('')}${cfg.canEdit ? '<th></th>' : ''}</tr></thead><tbody>${r.map(x =>
        `<tr>${cfg.cols.map(c => `<td>${c.f(x)}</td>`).join('')}${cfg.canEdit ? `<td><button class="btn sm ghost" data-id="${x.id}">সম্পাদনা</button></td>` : ''}</tr>`).join('')}</tbody></table>`
      : `<p class="empty">${cfg.empty}</p>`;
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => edit(rows.find(x => x.id === b.dataset.id)));
  };
  const load = async () => { try { rows = await cfg.load(); draw(); } catch (e) { $('#list', el).innerHTML = `<p class="err pad">${esc(errMsg(e))}</p>`; } };
  const edit = row => modal(row ? cfg.editTitle : cfg.newTitle, cfg.fields.map(f => field(f, row)).join(''), async fd => {
    const p = readForm(fd, cfg.fields);
    const { error } = row ? await sb.from(cfg.table).update(p).eq('id', row.id) : await sb.from(cfg.table).insert(p);
    if (error) throw error;
    toast('সংরক্ষিত হয়েছে'); await load();
  });
  $('#q', el).oninput = draw;
  if (cfg.canEdit) $('#add', el).onclick = () => edit(null);
  await load();
}

/* ---------- views ---------- */
const card = (bn, en, val, cls = '') => `<div class="card ${cls}"><div class="l">${bn} <small>${en}</small></div><div class="v">${val}</div></div>`;

async function viewDash(el) {
  if (has('salesman')) return dashSales(el);
  if (has('warehouse')) return dashStore(el);
  const qs = [
    ['v_dashboard', sb.from('v_dashboard').select('*').maybeSingle()],
    ['v_account_balances', sb.from('v_account_balances').select('*').order('name')],
    ['v_partner_summary', sb.from('v_partner_summary').select('*').order('name')],
    ['v_stock', sb.from('v_stock').select('name,unit,qty_on_hand,min_stock').eq('is_low', true).order('name').limit(10)]
  ];
  const res = await Promise.all(qs.map(x => x[1]));
  const bad = res.map((r, i) => r.error ? `${qs[i][0]}: ${r.error.message}` : null).filter(Boolean);
  if (bad.length) { el.innerHTML = `<p class="err">ড্যাশবোর্ড লোড হয়নি। কারিগরি তথ্য (ডেভেলপারকে দিন):<br><small>${esc(bad.join(' | '))}</small></p>`; return; }
  const [f, a, p, s] = res;
  const d = f.data || {};
  const neg = v => Number(v) < 0 ? 'neg' : '';
  el.innerHTML = `<div class="bar"><h2>ড্যাশবোর্ড</h2></div>
  <h3 class="sec">মূলধন ও ইকুইটি</h3><div class="grid">
    ${card('প্রাথমিক বিনিয়োগ', 'Initial Investment', money(d.initial_investment))}
    ${card('অতিরিক্ত মূলধন', 'Additional Capital', money(d.additional_capital))}
    ${card('ব্যবসার ইকুইটি', 'Business Equity', money(d.business_equity), 'hi')}
    ${card('সংরক্ষিত মুনাফা', 'Retained Profit', money(d.retained_profit), neg(d.retained_profit))}
    ${card('মূলধন উত্তোলন', 'Capital Withdrawals', money(d.capital_withdrawals))}
    ${card('মুনাফা উত্তোলন', 'Profit Withdrawals', money(d.profit_withdrawals))}</div>
  <h3 class="sec">বিক্রি ও মুনাফা</h3><div class="grid">
    ${card('মোট বিক্রি', 'Total Sales', money(d.total_sales))}
    ${card('মোট মুনাফা', 'Gross Profit', money(d.gross_profit), neg(d.gross_profit))}
    ${card('নিট মুনাফা', 'Net Profit', money(d.net_profit), neg(d.net_profit))}
    ${card('নিট মার্জিন', 'Net Margin', num(d.net_margin_pct) + '%')}
    ${card('মোট খরচ', 'Expenses', money(d.total_expenses))}
    ${card('ক্ষতি/নষ্ট', 'Damage/Loss', money(d.damage_loss))}</div>
  <h3 class="sec">স্টক ও বকেয়া</h3><div class="grid">
    ${card('স্টক পরিমাণ', 'Stock Qty', num(d.stock_qty))}
    ${card('স্টকের মূল্য', 'Stock Value', money(d.stock_value))}
    ${card('কম স্টক', 'Low Stock', num(d.low_stock_count), Number(d.low_stock_count) > 0 ? 'neg' : '')}
    ${card('ডিলার/রিটেইলার বকেয়া', 'Retailer Due', money(d.retailer_due))}
    ${card('সরবরাহকারী বকেয়া', 'Supplier Due', money(d.supplier_due))}</div>
  <h3 class="sec">ক্যাশ, ব্যাংক ও MFS</h3><div class="grid">
    ${(a.data || []).map(x => card(esc(x.name), '', money(x.balance), neg(x.balance))).join('')}</div>
  <h3 class="sec">Facebook অর্ডার</h3><div class="grid">
    ${card('পেন্ডিং', 'Pending', num(d.fb_pending))}${card('ডেলিভারড', 'Delivered', num(d.fb_delivered))}
    ${card('রিটার্ন', 'Returned', num(d.fb_returned))}${card('COD পেন্ডিং', 'COD Pending', money(d.fb_cod_pending))}
    ${card('কুরিয়ার অ্যাডভান্স পেন্ডিং', 'Courier Advance', money(d.courier_advance_pending))}</div>
  <h3 class="sec">অংশীদার</h3><div class="tablewrap"><table><thead><tr><th>নাম</th><th>শেয়ার</th><th>মূলধন</th><th>মুনাফার অংশ</th><th>মুনাফা উত্তোলন</th><th>ইকুইটি</th></tr></thead><tbody>
    ${(p.data || []).map(x => `<tr><td>${esc(x.name)}</td><td>${num(x.profit_pct)}%</td><td>${money(x.capital_balance)}</td><td>${money(x.profit_share)}</td><td>${money(x.profit_withdrawn)}</td><td><b>${money(x.partner_equity)}</b></td></tr>`).join('')}</tbody></table></div>
  <h3 class="sec">কম স্টকের পণ্য</h3>${(s.data || []).length
      ? `<div class="tablewrap"><table><tbody>${s.data.map(x => `<tr><td>${esc(x.name)}</td><td><span class="badge low">${num(x.qty_on_hand)} ${esc(x.unit)}</span></td><td><small>ন্যূনতম ${num(x.min_stock)}</small></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">কম স্টকের কোনো পণ্য নেই</p>'}`;
}

async function dashStore(el) {
  const { data, error } = await sb.from('v_stock').select('qty_on_hand,stock_value,is_low'); if (error) throw error;
  const q = data.reduce((s, x) => s + Number(x.qty_on_hand), 0), low = data.filter(x => x.is_low).length;
  el.innerHTML = `<div class="bar"><h2>স্টক সারসংক্ষেপ</h2></div><div class="grid">
   ${card('পণ্যের ধরন', 'Products', num(data.length))}${card('মোট স্টক', 'Stock Qty', num(q))}${card('কম স্টক', 'Low Stock', num(low), low ? 'neg' : '')}</div>`;
}
async function dashSales(el) {
  const { data, error } = await sb.from('v_my_sales').select('total,due'); if (error) throw error;
  const t = data.reduce((s, x) => s + Number(x.total), 0), due = data.reduce((s, x) => s + Number(x.due), 0);
  el.innerHTML = `<div class="bar"><h2>আমার বিক্রি</h2></div><div class="grid">
   ${card('বিক্রির সংখ্যা', 'Invoices', num(data.length))}${card('মোট বিক্রি', 'Total', money(t))}${card('বকেয়া', 'Due', money(due))}</div>`;
}

async function viewProducts(el) {
  const seeCost = !has('salesman'), canEdit = has('owner', 'partner', 'warehouse');
  const { data: cats, error: ce } = await sb.from('categories').select('id,name').eq('is_active', true).order('name'); if (ce) throw ce;
  const cname = Object.fromEntries(cats.map(c => [c.id, c.name]));
  const fields = [
    { key: 'name', label: 'পণ্যের নাম', req: true }, { key: 'sku', label: 'SKU / কোড' },
    { key: 'category_id', label: 'ক্যাটাগরি', type: 'select', options: [['', '— নির্বাচন করুন —'], ...cats.map(c => [c.id, c.name])] },
    { key: 'unit', label: 'একক', type: 'select', def: 'piece', options: ['piece', 'packet', 'kg', 'gram', 'litre', 'ml', 'bag', 'carton', 'bundle', 'set', 'other'].map(u => [u, u]) },
    { key: 'sell_price', label: 'রিটেইলার বিক্রয় মূল্য', type: 'number' }, { key: 'facebook_price', label: 'Facebook মূল্য', type: 'number' },
    { key: 'min_stock', label: 'ন্যূনতম স্টক (কম স্টক সতর্কতা)', type: 'number' }, { key: 'is_active', label: 'সক্রিয়', type: 'check' }
  ];
  const cols = [
    { h: 'পণ্য', f: x => `<b>${esc(x.name)}</b>${x.sku ? `<br><small>${esc(x.sku)}</small>` : ''}` },
    { h: 'ক্যাটাগরি', f: x => esc(cname[x.category_id] || '—') },
    { h: 'স্টক', f: x => `<span class="badge ${seeCost && Number(x.qty_on_hand) <= Number(x.min_stock) ? 'low' : ''}">${num(x.qty_on_hand)} ${esc(x.unit)}</span>` },
    { h: 'বিক্রয় মূল্য', f: x => money(x.sell_price) }
  ];
  if (seeCost) cols.push({ h: 'গড় খরচ (WAC)', f: x => money(x.avg_cost) }, { h: 'স্টকের মূল্য', f: x => money(Number(x.qty_on_hand) * Number(x.avg_cost)) });
  await listView(el, {
    title: 'পণ্য', table: 'products', canEdit, fields, cols, searchKeys: ['name', 'sku'],
    newTitle: 'নতুন পণ্য', editTitle: 'পণ্য সম্পাদনা', empty: 'এখনো কোনো পণ্য নেই। "+ নতুন" চেপে যোগ করুন।',
    load: async () => {
      const q = seeCost ? sb.from('products').select('*').order('name').limit(2000) : sb.from('v_products_sales').select('*').order('name').limit(2000);
      const { data, error } = await q; if (error) throw error; return data;
    }
  });
}

async function viewRetailers(el) {
  await listView(el, {
    title: 'রিটেইলার / ডিলার', table: 'retailers', canEdit: has('owner', 'partner', 'salesman', 'accountant'),
    fields: [{ key: 'name', label: 'নাম', req: true }, { key: 'phone', label: 'মোবাইল', type: 'tel' }, { key: 'address', label: 'ঠিকানা' },
    { key: 'notes', label: 'নোট', type: 'textarea' }, { key: 'is_active', label: 'সক্রিয়', type: 'check' }],
    cols: [{ h: 'নাম', f: x => `<b>${esc(x.name)}</b>` }, { h: 'মোবাইল', f: x => esc(x.phone || '—') }, { h: 'ঠিকানা', f: x => esc(x.address || '—') },
    { h: 'অবস্থা', f: x => x.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়' }],
    searchKeys: ['name', 'phone'], newTitle: 'নতুন রিটেইলার', editTitle: 'রিটেইলার সম্পাদনা', empty: 'এখনো কোনো রিটেইলার নেই।',
    load: async () => { const { data, error } = await sb.from('retailers').select('*').order('name').limit(2000); if (error) throw error; return data; }
  });
}

async function viewSuppliers(el) {
  await listView(el, {
    title: 'সরবরাহকারী', table: 'suppliers', canEdit: true,
    fields: [{ key: 'name', label: 'নাম', req: true }, { key: 'phone', label: 'মোবাইল', type: 'tel' }, { key: 'address', label: 'ঠিকানা' },
    { key: 'contact_person', label: 'যোগাযোগকারী' }, { key: 'payment_terms', label: 'পেমেন্টের শর্ত' },
    { key: 'notes', label: 'নোট', type: 'textarea' }, { key: 'is_active', label: 'সক্রিয়', type: 'check' }],
    cols: [{ h: 'নাম', f: x => `<b>${esc(x.name)}</b>` }, { h: 'মোবাইল', f: x => esc(x.phone || '—') }, { h: 'ঠিকানা', f: x => esc(x.address || '—') },
    { h: 'অবস্থা', f: x => x.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়' }],
    searchKeys: ['name', 'phone'], newTitle: 'নতুন সরবরাহকারী', editTitle: 'সরবরাহকারী সম্পাদনা', empty: 'এখনো কোনো সরবরাহকারী নেই।',
    load: async () => { const { data, error } = await sb.from('suppliers').select('*').order('name').limit(2000); if (error) throw error; return data; }
  });
}

async function viewUsers(el) {
  const { data, error } = await sb.from('profiles').select('*').order('created_at'); if (error) throw error;
  el.innerHTML = `<div class="bar"><h2>ইউজার ও রোল</h2></div>
  <p class="mut">নতুন ইউজার সাইন আপ করলে এখানে "নিষ্ক্রিয়" দেখাবে। রোল ঠিক করে সক্রিয় করুন।</p>
  <div class="tablewrap"><table><thead><tr><th>নাম</th><th>রোল</th><th>সক্রিয়</th><th></th></tr></thead><tbody>
  ${data.map(u => `<tr data-u="${u.id}"><td>${esc(u.full_name)}${u.id === state.userId ? ' <small>(আপনি)</small>' : ''}</td>
    <td><select>${Object.entries(ROLE_BN).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
    <td><input type="checkbox" ${u.is_active ? 'checked' : ''} style="width:22px;height:22px"></td>
    <td><button class="btn sm">সংরক্ষণ</button></td></tr>`).join('')}</tbody></table></div>`;
  el.querySelectorAll('tr[data-u]').forEach(tr => {
    tr.querySelector('button').onclick = async () => {
      const { error } = await sb.rpc('set_user_role', { p_user: tr.dataset.u, p_role: tr.querySelector('select').value, p_active: tr.querySelector('input').checked });
      if (error) return toast(errMsg(error), 'err');
      toast('সংরক্ষিত হয়েছে');
    };
  });
}

boot();

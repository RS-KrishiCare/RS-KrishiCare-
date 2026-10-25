// Dashboard — "Business Control Center".
// Presentation only: every number comes from the existing database views; no business logic lives here.
import { ic } from './icons.js';

export function initDash(H) {
  const { sb, esc, num, N, today, has, state, errMsg } = H;

  /* ---------- formatting ---------- */
  const mny = n => {
    const v = N(n), a = Math.abs(v);
    const s = a.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(a) ? 0 : 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : '') + '৳ ' + s;
  };
  const compact = n => {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e7) return s + (a / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
    if (a >= 1e5) return s + (a / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
    if (a >= 1e3) return s + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return s + Math.round(a);
  };
  const longDate = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  const firstName = () => {
    const n = String(state.profile?.full_name || '').replace(/^\s*md\.?\s*/i, '').trim();
    return n.split(/\s+/)[0] || 'there';
  };
  const shortDay = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const rel = ts => {
    const d = new Date(ts); if (isNaN(d)) return '';
    const m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.floor(m / 60) + ' h ago';
    if (m < 2880) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };
  const toneOf = v => N(v) < 0 ? 'red' : 'green';
  const sec = (icon, title, extra = '') => `<div class="d-h"><span class="d-hi">${ic(icon, 18)}</span><h3>${title}</h3>${extra}</div>`;
  const link = (href, text) => `<a class="d-link" href="${href}">${text}${ic('arrow', 14)}</a>`;

  /* ---------- chart (lightweight SVG, no library) ---------- */
  function drawChart(host, rows, days) {
    const list = [], map = Object.fromEntries(rows.map(r => [r.day, r]));
    const base = new Date();
    for (let i = days - 1; i >= 0; i--) { const d = new Date(base); d.setDate(d.getDate() - i); list.push(d.toLocaleDateString('en-CA')); }
    const S = list.map(k => N(map[k]?.sales)), P = list.map(k => N(map[k]?.profit));
    if (!S.some(v => v) && !P.some(v => v)) { host.innerHTML = '<p class="d-empty">No sales or profit recorded in this period yet.</p>'; return; }
    const W = 360, Hh = 176, L = 40, R = 8, T = 10, B = 22;
    const max = Math.max(...S, ...P, 1), min = Math.min(0, ...P, ...S);
    const y = v => T + (max - v) / (max - min || 1) * (Hh - T - B);
    const x = i => L + (list.length === 1 ? 0 : i / (list.length - 1)) * (W - L - R);
    const line = a => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const ticks = [max, (max + min) / 2, min];
    const dots = days <= 7;
    host.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" class="d-svg" role="img" aria-label="Sales and profit trend">
      ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="d-grid"/><text x="${L - 5}" y="${y(t) + 3}" text-anchor="end" class="d-ax">${compact(t)}</text>`).join('')}
      <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="d-zero"/>
      <path d="${line(S)} L${x(list.length - 1)} ${y(Math.max(0, min))} L${x(0)} ${y(Math.max(0, min))} Z" class="d-area"/>
      <path d="${line(S)}" class="d-ls"/><path d="${line(P)}" class="d-lp"/>
      ${dots ? S.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" class="d-ds"/><circle cx="${x(i)}" cy="${y(P[i])}" r="2.6" class="d-dp"/>`).join('') : ''}
      <text x="${L}" y="${Hh - 6}" class="d-ax">${shortDay(list[0])}</text>
      <text x="${(L + W - R) / 2}" y="${Hh - 6}" text-anchor="middle" class="d-ax">${shortDay(list[Math.floor(list.length / 2)])}</text>
      <text x="${W - R}" y="${Hh - 6}" text-anchor="end" class="d-ax">${shortDay(list[list.length - 1])}</text>
      <line id="d-guide" x1="0" x2="0" y1="${T}" y2="${Hh - B}" class="d-guide" style="display:none"/>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${Hh - T - B}" fill="transparent" id="d-hit"/></svg>
      <div class="d-read" id="d-read">Tap or hover the chart to see a day’s figures.</div>`;
    const svg = host.querySelector('svg'), hit = host.querySelector('#d-hit'), guide = host.querySelector('#d-guide'), read = host.querySelector('#d-read');
    const at = ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
      const i = Math.max(0, Math.min(list.length - 1, Math.round((px - L) / (W - L - R) * (list.length - 1))));
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.style.display = '';
      read.innerHTML = `<b>${shortDay(list[i])}</b> · Sales <b>${mny(S[i])}</b> · Profit <b class="${P[i] < 0 ? 'neg' : 'pos'}">${mny(P[i])}</b>`;
    };
    hit.addEventListener('pointermove', at); hit.addEventListener('pointerdown', at);
  }

  /* ---------- main view ---------- */
  async function view(el) {
    const t0 = today();
    const from = new Date(); from.setDate(from.getDate() - 89);
    const dayStart = new Date(t0 + 'T00:00:00Z'), dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const core = [
      ['v_dashboard', sb.from('v_dashboard').select('*').maybeSingle()],
      ['v_account_balances', sb.from('v_account_balances').select('*').order('name')],
      ['v_partner_summary', sb.from('v_partner_summary').select('*').order('name')],
      ['v_stock', sb.from('v_stock').select('product_id,name,unit,qty_on_hand,min_stock').eq('is_low', true).order('qty_on_hand').limit(50)],
      ['v_daily', sb.from('v_daily').select('*').gte('day', from.toLocaleDateString('en-CA')).order('day', { ascending: true })],
      ['v_my_fb_orders', sb.from('v_my_fb_orders').select('status,channel').limit(5000)],
      ['v_channel_summary', sb.from('v_channel_summary').select('*')]
    ];
    const soft = q => Promise.resolve(q).then(r => r.error ? { data: null, count: null } : r).catch(() => ({ data: null, count: null }));
    const [res, ex] = await Promise.all([
      Promise.all(core.map(c => c[1])),
      Promise.all([
        soft(sb.from('sales').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('sale_date', t0)),
        soft(sb.from('facebook_orders').select('id', { count: 'exact', head: true }).eq('status', 'Delivered').gte('delivered_at', dayStart.toISOString()).lt('delivered_at', dayEnd.toISOString())),
        soft(sb.from('sales').select('invoice_no,total,created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(6)),
        soft(sb.from('purchases').select('purchase_no,landed_total,created_at').order('created_at', { ascending: false }).limit(6)),
        soft(sb.from('expenses').select('description,amount,created_at,expense_categories(name)').order('created_at', { ascending: false }).limit(6)),
        soft(sb.from('v_my_fb_orders').select('order_ref,customer_name,status,product_total,created_at').order('created_at', { ascending: false }).limit(6)),
        soft(sb.from('payments').select('amount,created_at,retailers(name)').order('created_at', { ascending: false }).limit(6))
      ])
    ]);
    const bad = res.map((r, i) => r.error ? `${core[i][0]}: ${r.error.message}` : null).filter(Boolean);
    if (bad.length) { el.innerHTML = `<p class="err">The dashboard could not be loaded. Technical details:<br><small>${esc(bad.join(' | '))}</small></p>`; return; }
    const [f, a, p, s, dy, fbo, chs] = res;
    const sumOf = c => (chs.data || []).find(x => x.channel === c) || {}, fbS = sumOf('facebook'), wbS = sumOf('website');
    const [saleCnt, fbCnt, rSales, rPur, rExp, rFb, rPay] = ex;
    const d = f.data || {}, accts = a.data || [], partners = p.data || [], low = s.data || [], daily = dy.data || [];
    const tr = daily.find(x => x.day === t0) || { sales: 0, expenses: 0, profit: 0 };
    const salesToday = N(tr.sales), margin = salesToday > 0 ? N(tr.profit) / salesToday * 100 : null;
    const nSales = saleCnt.count ?? null, nFb = fbCnt.count ?? null;
    const subSales = (nSales === null && nFb === null) ? 'Retailer and Facebook sales' :
      `${nSales ?? 0} ${nSales === 1 ? 'sale' : 'sales'} · ${nFb ?? 0} Facebook ${nFb === 1 ? 'order' : 'orders'}`;

    /* attention */
    const out = low.filter(x => N(x.qty_on_hand) <= 0).length;
    const att = [];
    accts.filter(x => N(x.balance) < 0).forEach(x => att.push({ tone: 'red', icon: 'alert', text: `${esc(x.name)} balance is negative (${mny(x.balance)})`, href: '#finance', cta: 'Review accounts' }));
    if (N(d.low_stock_count) > 0) att.push({ tone: out ? 'red' : 'amber', icon: 'alert', text: `${num(d.low_stock_count)} ${N(d.low_stock_count) === 1 ? 'product is' : 'products are'} low in stock${out ? ` (${out} out of stock)` : ''}`, href: '#products', cta: 'View stock' });
    if (N(fbS.cod_pending) > 0) att.push({ tone: 'amber', icon: 'clock', text: `Facebook COD pending: ${mny(fbS.cod_pending)}`, href: '#facebook', cta: 'View orders' });
    if (N(wbS.cod_pending) > 0) att.push({ tone: 'amber', icon: 'clock', text: `Website COD pending: ${mny(wbS.cod_pending)}`, href: '#weborders', cta: 'View orders' });
    if (N(fbS.advance_pending) > 0) att.push({ tone: 'amber', icon: 'clock', text: `Courier advance awaiting settlement: ${mny(fbS.advance_pending)}`, href: '#facebook', cta: 'View orders' });
    if (N(d.retailer_due) > 0) att.push({ tone: 'blue', icon: 'users', text: `Retailers owe ${mny(d.retailer_due)}`, href: '#payments', cta: 'View receivables' });
    else att.push({ tone: 'green', icon: 'check', text: 'No retailer dues' });
    if (N(d.supplier_due) > 0) att.push({ tone: 'blue', icon: 'truck', text: `Supplier payable: ${mny(d.supplier_due)}`, href: '#purchases', cta: 'View payables' });
    else att.push({ tone: 'green', icon: 'check', text: 'No supplier dues' });
    const attHtml = att.map(x => `<div class="d-alert ${x.tone}"><span class="d-ai">${ic(x.icon, 20)}</span><div><div class="d-at">${x.text}</div>${x.href ? link(x.href, x.cta) : ''}</div></div>`).join('');

    /* quick actions (only what this role may actually use) */
    const acts = [
      has('owner', 'partner') && ['New Sale', 'bag', '#sales'],
      has('owner', 'partner') && ['New Purchase', 'truck', '#purchases'],
      has('owner', 'partner') && ['Facebook Order', 'message', '#facebook'],
      has('owner', 'partner', 'accountant') && ['Expense', 'wallet', '#expenses'],
      has('accountant') && ['Receive Payment', 'card', '#payments']
    ].filter(Boolean);

    /* money */
    const total = accts.reduce((sum, x) => sum + N(x.balance), 0);
    const acctRows = accts.map(x => {
      const neg = N(x.balance) < 0;
      return `<div class="d-row ${neg ? 'neg' : ''}"><span class="d-rl">${ic(x.kind === 'bank' ? 'building' : x.kind === 'cash' ? 'banknote' : 'card', 16)}${esc(x.name)}${neg ? ' <em>Negative balance</em>' : ''}</span><b>${mny(x.balance)}</b></div>`;
    }).join('');

    /* facebook pipeline */
    const cnt = {}, wcnt = {}; (fbo.data || []).forEach(o => { const t = o.channel === 'website' ? wcnt : cnt; t[o.status] = (t[o.status] || 0) + 1; });
    const mkPipe = c => [['Pending', c.New || 0, 'amber'], ['Confirmed', c.Confirmed || 0, 'blue'],
      ['Courier', (c.Processing || 0) + (c.Packed || 0) + (c.Shipped || 0), 'blue'],
      ['Delivered', c.Delivered || 0, 'green'], ['Returned', (c.Returned || 0) + (c.Failed || 0), 'red']];
    const pipe = mkPipe(cnt), wpipe = mkPipe(wcnt);

    /* recent activity */
    const act = [];
    (rSales.data || []).forEach(x => act.push({ ts: x.created_at, icon: 'bag', text: `Sale ${esc(x.invoice_no)}`, amt: x.total, tone: 'green' }));
    (rPur.data || []).forEach(x => act.push({ ts: x.created_at, icon: 'truck', text: `Purchase ${esc(x.purchase_no)} recorded`, amt: x.landed_total, tone: 'blue' }));
    (rExp.data || []).forEach(x => act.push({ ts: x.created_at, icon: 'wallet', text: `Expense: ${esc(x.expense_categories?.name || x.description || '')}`, amt: x.amount, tone: 'amber' }));
    (rFb.data || []).forEach(x => act.push({ ts: x.created_at, icon: 'message', text: `Facebook order ${esc(x.order_ref)} · ${esc(x.status)}`, amt: x.product_total, tone: 'blue' }));
    (rPay.data || []).forEach(x => act.push({ ts: x.created_at, icon: 'card', text: `Payment received${x.retailers?.name ? ' from ' + esc(x.retailers.name) : ''}`, amt: x.amount, tone: 'green' }));
    act.sort((u, v) => new Date(v.ts) - new Date(u.ts));
    const actHtml = act.slice(0, 8).map(x => `<div class="d-act"><span class="d-ai ${x.tone}">${ic(x.icon, 16)}</span><div class="d-act-t"><div>${x.text}</div><small title="${esc(new Date(x.ts).toLocaleString('en-GB'))}">${rel(x.ts)}</small></div><b>${mny(x.amt)}</b></div>`).join('');

    const kpi = (icon, label, val, sub, tone = '') => `<div class="d-kpi"><div class="d-kl"><span class="d-ki ${tone}">${ic(icon, 20)}</span>${label}</div><div class="d-kv ${tone === 'red' ? 'neg' : ''}">${val}</div>${sub ? `<div class="d-ks">${sub}</div>` : ''}</div>`;

    el.innerHTML = `<div class="dash">
    <div class="d-top"><h1>Dashboard</h1><p class="d-greet">${greeting()}, ${esc(firstName())}</p><small>${longDate()}</small></div>

    <section class="d-today d-span2">
      <div class="d-main">
        <div class="d-main-l">${ic('bag', 20)} Today’s Sales</div>
        <div class="d-main-v">${mny(salesToday)}</div>
        <div class="d-main-s">${subSales}</div>
      </div>
      <div class="d-side">
        <div class="d-mini"><div class="d-ml">${ic('trend', 16)} Today’s Profit</div><div class="d-mv ${N(tr.profit) < 0 ? 'neg' : 'pos'}">${mny(tr.profit)}</div><div class="d-ms">${margin === null ? 'No sales yet' : num(Math.round(margin * 10) / 10) + '% margin'}</div></div>
        <div class="d-mini"><div class="d-ml">${ic('wallet', 16)} Expenses &amp; losses</div><div class="d-mv">${mny(tr.expenses)}</div><div class="d-ms">Today</div></div>
      </div>
    </section>

    ${acts.length ? `<section class="d-span2"><div class="d-acts">${acts.map(x => `<a class="d-act-b" href="${x[2]}"><span class="d-plus">${ic('plus', 12)}</span>${ic(x[1], 26)}<span>${x[0]}</span></a>`).join('')}</div></section>` : ''}

    <section class="d-card">${sec('alert', 'Needs Attention')}<div class="d-alerts">${attHtml}</div></section>

    <section class="d-card">${sec('chart', 'Business Overview')}<div class="d-kpis">
      ${kpi('bag', 'Total Sales', mny(d.total_sales), 'All time')}
      ${kpi('trend', 'Gross Profit', mny(d.gross_profit), `${num(d.gross_margin_pct)}% gross margin`, toneOf(d.gross_profit))}
      ${kpi('trend', 'Net Profit', mny(d.net_profit), `${num(d.net_margin_pct)}% net margin`, toneOf(d.net_profit))}
      ${kpi('wallet', 'Operating Expenses', mny(d.total_expenses), `Damage / loss ${mny(d.damage_loss)}`, 'amber')}
    </div></section>

    <section class="d-card d-span2">${sec('trend', 'Sales &amp; Profit', `<div class="d-seg" id="d-seg"><button data-n="7" class="on">7 Days</button><button data-n="30">30 Days</button><button data-n="90">90 Days</button></div>`)}
      <div class="d-leg"><span><i class="s"></i>Sales</span><span><i class="p"></i>Profit</span></div><div id="d-chart"></div></section>

    <section class="d-card">${sec('package', 'Stock Health', link('#products', 'View all stock'))}
      <div class="d-stats"><div><small>Stock Value</small><b>${mny(d.stock_value)}</b></div><div><small>Stock Quantity</small><b>${num(d.stock_qty)} units</b></div>
      <div class="${N(d.low_stock_count) > 0 ? 'neg' : ''}"><small>Low-stock Items</small><b>${num(d.low_stock_count)}</b></div></div>
      ${low.length ? `<div class="d-list">${low.slice(0, 4).map(x => `<div class="d-li"><div><b>${esc(x.name)}</b><small>Stock: ${num(x.qty_on_hand)} ${esc(x.unit)} · minimum ${num(x.min_stock)}</small></div><a class="d-chip ${N(x.qty_on_hand) <= 0 ? 'red' : 'amber'}" href="#products">${N(x.qty_on_hand) <= 0 ? 'Out of stock' : 'Low'}</a></div>`).join('')}</div>
      ${low.length > 4 ? `<small class="mut">+ ${low.length - 4} more low-stock items</small>` : ''}` : `<p class="d-empty">${ic('check', 16)} All products are above their minimum stock level.</p>`}
    </section>

    <section class="d-card">${sec('landmark', 'Money', link('#finance', 'View accounts'))}
      <div class="d-total"><small>Total balance</small><b class="${toneOf(total)}">${mny(total)}</b></div>
      <div class="d-rows">${acctRows || '<p class="d-empty">No accounts configured.</p>'}</div>
      <div class="d-due"><div><small>Retailer due</small><b>${mny(d.retailer_due)}</b></div><div><small>Supplier due</small><b>${mny(d.supplier_due)}</b></div></div>
    </section>

    <section class="d-card">${sec('message', 'Facebook Orders', link('#facebook', 'View Facebook Orders'))}
      <div class="d-pipe">${pipe.map((x, i) => `<div class="d-step ${x[2]}"><b>${x[1]}</b><small>${x[0]}</small></div>${i < pipe.length - 1 ? `<span class="d-sep">${ic('chevron', 14)}</span>` : ''}`).join('')}</div>
      <div class="d-due"><div><small>COD Pending</small><b>${mny(d.fb_cod_pending)}</b></div><div><small>Courier Advance Pending</small><b>${mny(d.courier_advance_pending)}</b></div></div>
      ${cnt.Cancelled ? `<small class="mut">${cnt.Cancelled} cancelled order(s) not shown in the pipeline.</small>` : ''}
    </section>

    <section class="d-card">${sec('globe', 'Website Orders', link('#weborders', 'View Website Orders'))}
      <div class="d-pipe">${wpipe.map((x, i) => `<div class="d-step ${x[2]}"><b>${x[1]}</b><small>${x[0]}</small></div>${i < wpipe.length - 1 ? `<span class="d-sep">${ic('chevron', 14)}</span>` : ''}`).join('')}</div>
      <div class="d-due"><div><small>COD Pending</small><b>${mny(wbS.cod_pending)}</b></div><div><small>Delivered sales</small><b>${mny(wbS.delivered_sales)}</b></div></div>
      ${wcnt.Cancelled ? `<small class="mut">${wcnt.Cancelled} cancelled order(s) not shown in the pipeline.</small>` : ''}
    </section>

    <section class="d-card">${sec('landmark', 'Capital &amp; Equity')}
      <div class="d-rows">
        <div class="d-row hi"><span class="d-rl">Current business equity</span><b>${mny(d.business_equity)}</b></div>
        <div class="d-row"><span class="d-rl">Initial investment</span><b>${mny(d.initial_investment)}</b></div>
        <div class="d-row"><span class="d-rl">Additional partner capital</span><b>${mny(d.additional_capital)}</b></div>
        <div class="d-row ${N(d.retained_profit) < 0 ? 'neg' : ''}"><span class="d-rl">Retained profit</span><b>${mny(d.retained_profit)}</b></div>
        <div class="d-row"><span class="d-rl">Capital withdrawals</span><b>${mny(d.capital_withdrawals)}</b></div>
        <div class="d-row"><span class="d-rl">Profit withdrawals</span><b>${mny(d.profit_withdrawals)}</b></div>
      </div>${link('#capital', 'Partners &amp; Capital')}
    </section>

    <section class="d-card">${sec('clock', 'Recent Activity')}
      ${actHtml ? `<div class="d-acts-l">${actHtml}</div>` : '<p class="d-empty">No activity recorded yet.</p>'}
    </section>

    <section class="d-card">${sec('usersRound', 'Partners', link('#capital', 'Details'))}
      ${partners.length ? `<div class="d-partners">${partners.map(x => `<div class="d-partner"><div class="d-pn"><b>${esc(x.name)}</b><span class="d-chip green">${num(x.profit_pct)}% share</span></div>
        <div class="d-pg"><div><small>Capital</small><b>${mny(x.capital_balance)}</b></div><div><small>Profit earned</small><b class="${toneOf(x.profit_share)}">${mny(x.profit_share)}</b></div>
        <div><small>Profit withdrawn</small><b>${mny(x.profit_withdrawn)}</b></div><div><small>Equity</small><b>${mny(x.partner_equity)}</b></div></div></div>`).join('')}</div>` : '<p class="d-empty">No partners configured.</p>'}
    </section>

    <section class="d-card d-span2">${sec('receipt', 'Daily Sales, Expenses and Profit')}
      ${daily.length ? `<div class="d-table"><table><thead><tr><th>Date</th><th>Sales</th><th>Expenses</th><th>Profit</th></tr></thead><tbody>${[...daily].reverse().slice(0, 14).map(x =>
        `<tr><td>${shortDay(x.day)}</td><td>${mny(x.sales)}</td><td>${mny(x.expenses)}</td><td class="${N(x.profit) < 0 ? 'neg' : 'pos'}"><b>${mny(x.profit)}</b></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="d-empty">No daily activity recorded yet.</p>'}
    </section></div>`;

    const host = el.querySelector('#d-chart');
    drawChart(host, daily, 7);
    el.querySelector('#d-seg').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('#d-seg button').forEach(x => x.classList.toggle('on', x === b));
      drawChart(host, daily, Number(b.dataset.n));
    };
  }

  return { view };
}

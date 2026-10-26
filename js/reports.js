// Reports and Custom Report. Every figure comes from the database function report_data(),
// and every filter is applied inside the database query.
export function initReports(h) {
  const { sb, $, esc, money, num, toast, errMsg, has, today, LOADING } = h;

  const REPORTS = [
    { id: 'sales', label: 'Sales report', f: ['channel', 'product', 'retailer'] },
    { id: 'purchases', label: 'Purchase report', f: ['supplier', 'product'] },
    { id: 'profit', label: 'Profit report (gross and net)', f: [] },
    { id: 'expenses', label: 'Expense report', f: ['xcategory', 'account'] },
    { id: 'stock', label: 'Stock and stock valuation', f: ['product', 'pcategory'], nodate: true, store: true },
    { id: 'low_stock', label: 'Low-stock report', f: [], nodate: true, store: true },
    { id: 'losses', label: 'Damage / loss report', f: ['product'], store: true },
    { id: 'retailer_due', label: 'Retailer due report', f: ['retailer'] },
    { id: 'supplier_due', label: 'Supplier due report', f: ['supplier'] },
    { id: 'facebook', label: 'Facebook orders report', f: ['status', 'product'] },
    { id: 'website', label: 'Website orders report', f: ['status', 'product'] },
    { id: 'courier', label: 'Courier settlement report', f: ['status'] },
    { id: 'accounts', label: 'Cash, bank and mobile wallet report', f: ['account'] },
    { id: 'collections', label: 'Payment collection report', f: ['retailer', 'account'] },
    { id: 'partner_capital', label: 'Partner capital report', f: ['partner', 'account'] },
    { id: 'partner_withdrawals', label: 'Partner withdrawal report', f: ['partner', 'account'] },
    { id: 'partner_cash', label: 'Partner cash ledger (by partner and medium)', f: ['partner', 'txn_type', 'medium', 'account'], always: true, fin: true },
    { id: 'partner_cash_summary', label: 'Partner cash summary', f: ['partner'], always: true, fin: true },
    { id: 'partner_equity', label: 'Partner equity report', f: ['partner'], nodate: true },
    { id: 'product_profit', label: 'Product profitability', f: ['product'] },
    { id: 'channel_profit', label: 'Channel profitability', f: [] },
    { id: 'salesman', label: 'Salesman performance', f: [] },
    { id: 'daily', label: 'Daily sales, expense and profit', f: [] }
  ];
  const QTY = new Set(['quantity', 'quantity_sold', 'min_stock']);
  const NO_TOTAL = /(unit_cost|average_cost|sell_price|_pct)/;
  const pretty = k => ({ date: 'Date', cogs: 'COGS', sku: 'SKU', amount: 'Amount', item: 'Item' }[k] || k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()));
  const STATUSES = ['New', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Returned', 'Cancelled', 'Failed'];

  async function lists() {
    const safe = async q => { try { const { data, error } = await q; return error ? [] : data; } catch (_) { return []; } };
    const [products, retailers, suppliers, accounts, xcats, pcats, partners] = await Promise.all([
      safe(sb.from('products').select('id,name').order('name')), safe(sb.from('retailers').select('id,name').order('name')),
      safe(sb.from('suppliers').select('id,name').order('name')), safe(sb.from('v_payment_methods').select('id,name').order('name')),
      safe(sb.from('expense_categories').select('id,name').order('name')), safe(sb.from('categories').select('id,name').order('name')),
      safe(sb.from('partners').select('id,name').order('name'))
    ]);
    return { products, retailers, suppliers, accounts, xcats, pcats, partners };
  }

  function fmt(k, v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return QTY.has(k) ? num(v) : /_pct$/.test(k) ? num(v) + '%' : money(v);
    return esc(v);
  }

  function renderTable(rep, rows) {
    if (!rows.length) return { html: '<p class="empty">No records match the selected filters.</p>', csv: '' , empty: true };
    const keys = Object.keys(rows[0]);
    const showTotals = rep.id !== 'profit' && rows.length > 1;
    const totals = {};
    if (showTotals) keys.forEach(k => { if (rows.some(r => typeof r[k] === 'number') && !QTY.has(k) && !NO_TOTAL.test(k)) totals[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0); });
    const head = `<tr>${keys.map(k => `<th>${pretty(k)}</th>`).join('')}</tr>`;
    const body = rows.map(r => `<tr>${keys.map(k => `<td>${fmt(k, r[k])}</td>`).join('')}</tr>`).join('');
    const foot = Object.keys(totals).length ? `<tr>${keys.map((k, i) => `<td><b>${k in totals ? money(totals[k]) : (i === 0 ? 'Total' : '')}</b></td>`).join('')}</tr>` : '';
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = [keys.map(k => q(pretty(k))).join(','), ...rows.map(r => keys.map(k => q(r[k])).join(','))].join('\r\n');
    return { html: `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div><p class="mut">${rows.length} row(s)</p>`, csv };
  }

  function printReport(title, sub, tableHtml) {
    const w = window.open('', '_blank');
    if (!w) return toast('Please allow pop-ups to print the report.', 'err');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:Arial,sans-serif;color:#173a2c;padding:18px}h1{margin:0;font-size:20px;color:#064b32}p{margin:4px 0 12px;color:#555;font-size:12px}
      table{border-collapse:collapse;width:100%;font-size:12px}th{background:#087143;color:#fff;text-align:left;padding:6px}td{padding:6px;border-bottom:1px solid #ccd6d0}
      .tablewrap{overflow:visible}</style></head><body><div style="display:flex;align-items:center;gap:10px"><img src="${location.origin}/assets/logo.jpg" alt="" style="height:40px;width:40px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'"><h1>RS KrishiCare — ${esc(title)}</h1></div><p>${esc(sub)} · Generated ${esc(new Date().toLocaleString('en-GB'))}</p>${tableHtml}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  async function engine(el, mode) {
    el.innerHTML = `<div class="bar"><h2>${mode === 'custom' ? 'Custom Report' : 'Reports'}</h2></div>${LOADING}`;
    const L = await lists();
    const avail = REPORTS.filter(r => has('owner', 'partner', 'accountant') || r.store);
    const iso = d => d.toLocaleDateString('en-CA');
    el.innerHTML = `<div class="bar"><h2>${mode === 'custom' ? 'Custom Report' : 'Reports'}</h2></div>
    <div class="box">
      <label>Report<select id="rsel">${avail.map(r => `<option value="${r.id}">${r.label}</option>`).join('')}</select></label>
      <div id="pfl"></div>
      <div class="btnrow"><button class="btn" id="run">Generate report</button></div>
    </div>
    <div id="out"></div>`;
    const pfl = $('#pfl', el), out = $('#out', el), sel = $('#rsel', el);
    let last = null;
    const sOpts = (rows, all = 'All') => `<option value="">${all}</option>` + rows.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    const FILT = {
      channel: () => `<label>Channel<select name="channel"><option value="">All channels</option><option value="retailer">Retailer</option><option value="facebook">Facebook</option><option value="website">Website</option></select></label>`,
      product: () => `<label>Product<select name="product" class="ss">${sOpts(L.products, 'All products')}</select></label>`,
      retailer: () => `<label>Retailer<select name="retailer" class="ss">${sOpts(L.retailers, 'All retailers')}</select></label>`,
      supplier: () => `<label>Supplier<select name="supplier" class="ss">${sOpts(L.suppliers, 'All suppliers')}</select></label>`,
      account: () => `<label>Payment method / account<select name="account">${sOpts(L.accounts, 'All accounts')}</select></label>`,
      xcategory: () => `<label>Expense category<select name="category">${sOpts(L.xcats, 'All categories')}</select></label>`,
      pcategory: () => `<label>Product category<select name="category">${sOpts(L.pcats, 'All categories')}</select></label>`,
      partner: () => `<label>Partner<select name="partner">${sOpts(L.partners, 'All partners')}</select></label>`,
      medium: () => `<label>Payment medium<select name="medium"><option value="">All</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="mfs">Mobile banking</option></select></label>`,
      txn_type: () => `<label>Transaction type<select name="txn_type"><option value="">All types</option><option value="purchase">Purchase payments</option><option value="sale">Sale receipts</option><option value="expense">Expenses</option><option value="transfer">Transfers</option><option value="adjustment">Opening / adjustments</option><option value="capital">Partner capital</option></select></label>`,
      status: () => `<label>Order status<select name="status"><option value="">All statuses</option>${STATUSES.map(s => `<option>${s}</option>`).join('')}</select></label>`
    };
    const drawFilters = () => {
      const rep = REPORTS.find(r => r.id === sel.value);
      const dates = rep.nodate ? '' : `<div class="row2"><label>From<input name="from" type="date"></label><label>To<input name="to" type="date"></label></div>
        <div class="btnrow" id="per"><button type="button" class="btn ghost sm" data-p="today">Today</button><button type="button" class="btn ghost sm" data-p="7">Last 7 days</button><button type="button" class="btn ghost sm" data-p="month">This month</button><button type="button" class="btn ghost sm" data-p="all">All time</button></div>`;
      const extra = (mode === 'custom' || rep.always) ? rep.f.map(k => FILT[k]()).join('') : '';
      pfl.innerHTML = `<form id="rf">${dates}${extra}</form>`;
      const f = $('#rf', el);
      f.onsubmit = e => e.preventDefault();
      const per = $('#per', el);
      if (per) per.onclick = e => {
        const p = e.target.dataset.p; if (!p) return;
        const now = new Date(); let a = '', b = iso(now);
        if (p === 'today') a = b; else if (p === '7') { const d = new Date(now); d.setDate(d.getDate() - 6); a = iso(d); }
        else if (p === 'month') a = iso(new Date(now.getFullYear(), now.getMonth(), 1)); else b = '';
        f.elements.from.value = a; f.elements.to.value = b;
      };
    };
    sel.onchange = drawFilters; drawFilters();
    $('#run', el).onclick = async () => {
      const rep = REPORTS.find(r => r.id === sel.value), f = $('#rf', el), btn = $('#run', el);
      const p = {}; new FormData(f).forEach((v, k) => { if (v) p[k] = v; });
      btn.disabled = true; out.innerHTML = LOADING;
      try {
        const { data, error } = rep.id === 'salesman' ? await sb.rpc('report_salesman', { p }) : await sb.rpc('report_data', { p_report: rep.id, p });
        if (error) throw error;
        const t = renderTable(rep, data || []);
        const sub = [p.from ? 'From ' + p.from : '', p.to ? 'To ' + p.to : ''].filter(Boolean).join(' ') || 'All dates';
        last = { rep, t, sub };
        out.innerHTML = `<div class="bar"><h3 class="sec">${esc(rep.label)}</h3><span class="mut">${esc(sub)}</span></div>
          ${t.empty ? '' : '<div class="btnrow"><button class="btn ghost sm" id="prt">🖨 Print / Save as PDF</button><button class="btn ghost sm" id="csv">⬇ Download CSV</button></div>'}${t.html}`;
        const prt = $('#prt', out), csv = $('#csv', out);
        if (prt) prt.onclick = () => printReport(last.rep.label, last.sub, last.t.html);
        if (csv) csv.onclick = () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob(['\ufeff' + last.t.csv], { type: 'text/csv;charset=utf-8' }));
          a.download = `RS_KrishiCare_${last.rep.id}_${today()}.csv`; a.click();
        };
      } catch (e) { out.innerHTML = `<p class="err">${esc(errMsg(e))}</p>`; }
      btn.disabled = false;
    };
  }

  return { viewReports: el => engine(el, 'basic'), viewCustom: el => engine(el, 'custom') };
}

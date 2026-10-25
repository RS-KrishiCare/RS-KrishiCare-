// Warehouses: stock per warehouse (Gazipur / Sirajganj), setup of opening stock, transfer, adjustment, low-stock alerts.
// All writes go through database functions (role-checked, audited, atomic). The module starts OFF and is switched on
// by the owner only after every product's warehouse quantities add up to its system stock.
export function initWh(h) {
  const { sb, $, esc, money, num, N, today, toast, errMsg, has, modal, LOADING, confirmReason } = h;
  let cache = null;
  const get = async force => {
    if (!cache || force) {
      const [m, w] = await Promise.all([sb.rpc('wh_mode_on'), sb.from('warehouses').select('id,name,sort_order').eq('is_active', true).order('sort_order')]);
      cache = { on: m.data === true, list: w.data || [] };
    }
    return cache;
  };
  // <select name="warehouse_id"> shown only when the module is active
  const select = (cfg, label = 'Warehouse', name = 'warehouse_id', required = true) => cfg.on
    ? `<label>${label}<select name="${name}" ${required ? 'required' : ''}><option value="">— Select warehouse —</option>${cfg.list.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>` : '';
  const nameMap = cfg => Object.fromEntries(cfg.list.map(w => [w.id, w.name]));
  const api = { get, select, nameMap };

  const table = (heads, rows, empty) => rows.length
    ? `<div class="tablewrap"><table><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="empty">${empty}</p>`;
  const csv = (name, heads, rows) => {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const blob = new Blob(['\ufeff' + [heads, ...rows].map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  async function viewWarehouses(el) {
    el.innerHTML = LOADING;
    const cfg = await get(true), canSetup = has('owner', 'partner', 'warehouse'), canAdj = has('owner', 'warehouse'), isOwner = has('owner');
    const seeValue = has('owner', 'partner', 'accountant', 'warehouse');
    const [sr, cr] = await Promise.all([
      sb.from('v_wh_stock').select('*').order('name').order('sort_order').limit(20000),
      sb.from('categories').select('id,name').order('name')
    ]);
    if (sr.error) { el.innerHTML = `<p class="err pad">${esc(errMsg(sr.error))}</p>`; return; }
    const cats = Object.fromEntries((cr.data || []).map(c => [c.id, c.name]));
    const W = cfg.list;
    const byP = new Map();
    sr.data.forEach(r => {
      if (!byP.has(r.product_id)) byP.set(r.product_id, { id: r.product_id, sku: r.sku, name: r.name, cat: r.category_id, unit: r.unit, active: r.is_active, min: N(r.min_stock), total: N(r.total_qty), q: {}, mn: {}, val: 0, low: {} });
      const p = byP.get(r.product_id); p.q[r.warehouse_id] = N(r.qty); p.mn[r.warehouse_id] = r.min_qty; p.val += N(r.value); p.low[r.warehouse_id] = r.is_low;
    });
    const P = [...byP.values()].map(p => ({ ...p, alloc: W.reduce((s, w) => s + p.q[w.id], 0) })).map(p => ({ ...p, un: p.total - p.alloc }));
    const mism = P.filter(p => Math.abs(p.un) > 0.0005);
    let tab = sessionStorage.getItem('whtab') || 'stock';
    if (!cfg.on && ['transfer', 'adjust'].includes(tab)) tab = 'stock';
    const TABS = [['stock', 'Stock'], ['low', 'Low stock'], ['transfer', 'Transfer'], ['adjust', 'Adjust'], ['setup', cfg.on ? 'Setup' : 'Setup & switch-on']];

    const draw = async () => {
      sessionStorage.setItem('whtab', tab);
      const banner = cfg.on ? '' : `<div class="hint"><b>Warehouse tracking is not switched on yet.</b> Everything works exactly as before. Enter the real stock of each warehouse in <b>Setup</b>; when every product matches, the owner can switch tracking on.${mism.length ? ` <b>${mism.length}</b> of ${P.length} products still need their warehouse stock entered.` : ' All products match — the owner can switch on now.'}</div>`;
      el.innerHTML = `<div class="bar"><h2>Warehouses</h2></div>${banner}
        <div class="tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px">${TABS.map(([k, l]) => `<button class="btn sm ${k === tab ? '' : 'ghost'}" data-tab="${k}">${l}</button>`).join('')}</div><div id="wbody">${LOADING}</div>`;
      el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
      const body = $('#wbody', el);
      if (tab === 'stock') stockTab(body); else if (tab === 'low') lowTab(body);
      else if (tab === 'transfer') await transferTab(body); else if (tab === 'adjust') await adjustTab(body); else setupTab(body);
    };

    /* ---------- Stock dashboard / warehouse report ---------- */
    function stockTab(body) {
      body.innerHTML = `<div class="row2"><input id="q" class="search" placeholder="Search product or code…"><select id="cf" class="search"><option value="">All categories</option>${Object.entries(cats).map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></div>
        <div style="display:flex;gap:8px;margin:6px 0"><button class="btn sm ghost" id="xcsv">Download CSV</button><button class="btn sm ghost" id="xprint">Print</button></div><div id="st"></div>`;
      const heads = ['Product', 'Code', ...W.map(w => w.name + ' stock'), 'Total stock', ...(cfg.on ? [] : ['Not yet assigned']), ...(seeValue ? ['Stock value'] : []), 'Alert'];
      const rowsOf = () => {
        const t = $('#q', body).value.toLowerCase(), c = $('#cf', body).value;
        return P.filter(p => p.active && (!c || p.cat === c) && (p.name.toLowerCase().includes(t) || String(p.sku || '').toLowerCase().includes(t)));
      };
      const alert = p => {
        const a = []; if (p.total <= p.min) a.push('Low (total)');
        W.forEach(w => { if (p.low[w.id]) a.push('Low in ' + w.name); else if (cfg.on && p.q[w.id] === 0 && p.total > 0) a.push('None in ' + w.name); });
        return a;
      };
      const draw2 = () => {
        const L = rowsOf();
        $('#st', body).innerHTML = table(heads, L.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.sku || '')}</td>${W.map(w => `<td>${num(p.q[w.id])}</td>`).join('')}<td><b>${num(p.total)}</b> ${esc(p.unit)}</td>${cfg.on ? '' : `<td>${Math.abs(p.un) > 0.0005 ? `<span class="badge low">${num(p.un)}</span>` : '—'}</td>`}${seeValue ? `<td>${money(p.val)}</td>` : ''}<td>${alert(p).map(a => `<span class="badge low">${esc(a)}</span>`).join(' ') || '—'}</td></tr>`),
          'No products found.') + (seeValue && L.length ? `<p class="mut">Total stock value shown: <b>${money(L.reduce((s, p) => s + p.val, 0))}</b> (warehouse quantity × average cost${cfg.on ? '' : '; only the part already assigned to a warehouse'}).</p>` : '');
      };
      $('#q', body).oninput = draw2; $('#cf', body).onchange = draw2; draw2();
      $('#xprint', body).onclick = () => window.print();
      $('#xcsv', body).onclick = () => csv('warehouse-stock-' + today() + '.csv', heads, rowsOf().map(p => [p.name, p.sku || '', ...W.map(w => p.q[w.id]), p.total, ...(cfg.on ? [] : [p.un]), ...(seeValue ? [p.val] : []), alert(p).join('; ')]));
    }

    /* ---------- Low stock ---------- */
    function lowTab(body) {
      const act = P.filter(p => p.active);
      const total = act.filter(p => p.total <= p.min);
      const wlow = []; act.forEach(p => W.forEach(w => { if (p.low[w.id]) wlow.push([p, w]); }));
      const none = []; if (cfg.on) act.forEach(p => W.forEach(w => { if (p.q[w.id] === 0 && p.total > 0 && !p.low[w.id]) none.push([p, w]); }));
      const setBtn = (p, w) => canSetup ? `<button class="btn sm ghost" data-set="${p.id}|${w.id}">Set alert level</button>` : '';
      body.innerHTML = `<div class="hint">Alerts: <b>total</b> stock at or below the product’s minimum stock; a <b>warehouse</b> at or below the alert level you set for it; and products that have <b>none in one warehouse</b> while stock exists elsewhere (consider a transfer).</div>
        <h3 class="sec">Total stock at or below minimum (${total.length})</h3>${table(['Product', 'Total stock', 'Minimum', ...W.map(w => w.name)], total.map(p => `<tr><td><b>${esc(p.name)}</b></td><td><span class="badge low">${num(p.total)}</span> ${esc(p.unit)}</td><td>${num(p.min)}</td>${W.map(w => `<td>${num(p.q[w.id])}</td>`).join('')}</tr>`), 'No product is below its minimum stock.')}
        <h3 class="sec">Warehouse alert level reached (${wlow.length})</h3>${table(['Product', 'Warehouse', 'Stock', 'Alert level', ''], wlow.map(([p, w]) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(w.name)}</td><td><span class="badge low">${num(p.q[w.id])}</span></td><td>${num(p.mn[w.id])}</td><td>${setBtn(p, w)}</td></tr>`), 'No warehouse is at its alert level.')}
        ${cfg.on ? `<h3 class="sec">None in one warehouse (${none.length})</h3>${table(['Product', 'Empty warehouse', 'Total stock', ''], none.map(([p, w]) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(w.name)}</td><td>${num(p.total)} ${esc(p.unit)}</td><td>${setBtn(p, w)}</td></tr>`), 'Every warehouse has stock of every stocked product.')}` : ''}`;
      body.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
        const [pid, wid] = b.dataset.set.split('|'), p = byP.get(pid), w = W.find(x => x.id === wid);
        modal(`Alert level — ${p.name} in ${w.name}`, `<label>Warn me when stock in ${esc(w.name)} is at or below<input name="min" type="number" step="any" min="0" value="${p.mn[wid] ?? ''}" placeholder="leave empty for no alert"></label>`,
          async fd => { const v = fd.get('min'); const { error } = await sb.rpc('wh_set_min', { p_product: pid, p_warehouse: wid, p_min: v === '' ? null : N(v) }); if (error) throw error; toast('Alert level saved.'); viewWarehouses(el); });
      });
    }

    const pOpts = () => `<option value="">— Select product —</option>${P.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)} — ${W.map(w => w.name + ' ' + num(p.q[w.id])).join(' · ')}</option>`).join('')}`;
    const wOpts = () => `<option value="">— Select —</option>${W.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}`;

    /* ---------- Transfer ---------- */
    async function transferTab(body) {
      if (!cfg.on) { body.innerHTML = '<div class="hint">Transfers become available after warehouse tracking is switched on (see Setup).</div>'; return; }
      const { data: tr } = await sb.from('stock_transfers').select('*').order('created_at', { ascending: false }).limit(60);
      const wn = nameMap(cfg);
      body.innerHTML = `${canSetup ? `<div class="box"><h3 style="margin:0 0 6px">Transfer stock between warehouses</h3><p class="mut">Total stock does not change; the quantity only moves from one warehouse to the other. The warehouse you take from must have enough stock.</p><form id="tf">
        <label>Product<select name="product" class="ss" required>${pOpts()}</select></label>
        <div class="row2"><label>From<select name="from" required>${wOpts()}</select></label><label>To<select name="to" required>${wOpts()}</select></label></div>
        <div class="row2"><label>Quantity<input name="qty" type="number" step="any" min="0" inputmode="decimal" required></label><label>Date<input name="date" type="date" value="${today()}"></label></div>
        <label>Note<input name="note" placeholder="e.g. sent by van"></label><button class="btn go" style="width:100%">Transfer</button></form></div>` : ''}
        <h3 class="sec">Recent transfers</h3>${table(['No.', 'Date', 'Product', 'From', 'To', 'Quantity', 'Note'], (tr || []).map(t => `<tr><td>${esc(t.transfer_no)}</td><td>${esc(t.transfer_date)}</td><td>${esc(byP.get(t.product_id)?.name || '')}</td><td>${esc(wn[t.from_warehouse] || '')}</td><td>${esc(wn[t.to_warehouse] || '')}</td><td><b>${num(t.qty)}</b></td><td>${esc(t.note || '')}</td></tr>`), 'No transfers yet.')}`;
      const f = $('#tf', body); if (f) f.onsubmit = async e => {
        e.preventDefault(); const b = f.querySelector('.go'); b.disabled = true;
        try {
          const fd = new FormData(f);
          const { error } = await sb.rpc('wh_transfer', { p_product: fd.get('product'), p_from: fd.get('from'), p_to: fd.get('to'), p_qty: N(fd.get('qty')), p_date: fd.get('date'), p_note: fd.get('note') || null });
          if (error) throw error; toast('Stock transferred.'); viewWarehouses(el);
        } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
      };
    }

    /* ---------- Adjustment ---------- */
    async function adjustTab(body) {
      if (!cfg.on) { body.innerHTML = '<div class="hint">Warehouse adjustments become available after tracking is switched on. Until then use Inventory Control for losses and stock increases.</div>'; return; }
      const { data: ad } = await sb.from('wh_adjustments').select('*').order('created_at', { ascending: false }).limit(60);
      const wn = nameMap(cfg);
      body.innerHTML = `${canAdj ? `<div class="box"><h3 style="margin:0 0 6px">Adjust stock after a physical count</h3><p class="mut">Enter what you actually counted in the warehouse and the reason. A shortage is recorded as a stock loss at average cost; extra stock found is added at average cost. Every adjustment is kept in the history below.</p><form id="af">
        <label>Product<select name="product" class="ss" required>${pOpts()}</select></label>
        <div class="row2"><label>Warehouse<select name="wh" required>${wOpts()}</select></label><label>Counted quantity<input name="qty" type="number" step="any" min="0" inputmode="decimal" required></label></div>
        <div id="cur" class="mut"></div>
        <div class="row2"><label>If stock is short, record as<select name="kind">${[['adjustment', 'Count adjustment'], ['damage', 'Damage'], ['expired', 'Expired'], ['broken', 'Broken'], ['lost', 'Lost'], ['theft', 'Theft'], ['other', 'Other']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label>Date<input name="date" type="date" value="${today()}"></label></div>
        <label>Reason (required)<input name="reason" required placeholder="e.g. monthly recount — 2 boxes damaged by water"></label>
        <label>Extra notes<input name="notes"></label><button class="btn go" style="width:100%">Save adjustment</button></form></div>` : '<div class="hint">Only the owner and warehouse staff can adjust stock.</div>'}
        <h3 class="sec">Adjustment history</h3>${table(['Date', 'Product', 'Warehouse', 'System', 'Counted', 'Change', 'Reason'], (ad || []).map(a => `<tr><td>${esc(a.adj_date)}</td><td>${esc(byP.get(a.product_id)?.name || '')}</td><td>${esc(wn[a.warehouse_id] || '')}</td><td>${num(a.old_qty)}</td><td>${num(a.new_qty)}</td><td><b>${N(a.delta) > 0 ? '+' : ''}${num(a.delta)}</b></td><td>${esc(a.reason)}${a.notes ? ' — ' + esc(a.notes) : ''}</td></tr>`), 'No adjustments yet.')}`;
      const f = $('#af', body); if (!f) return;
      const showCur = () => { const p = byP.get(f.elements.product.value), w = f.elements.wh.value; $('#cur', body).textContent = p && w ? `System quantity in this warehouse: ${num(p.q[w])} ${p.unit}` : ''; };
      f.elements.product.onchange = showCur; f.elements.wh.onchange = showCur;
      f.onsubmit = async e => {
        e.preventDefault(); const b = f.querySelector('.go'); b.disabled = true;
        try {
          const fd = new FormData(f);
          const { error } = await sb.rpc('wh_adjust_stock', { p_product: fd.get('product'), p_warehouse: fd.get('wh'), p_new_qty: N(fd.get('qty')), p_reason: fd.get('reason'), p_date: fd.get('date'), p_notes: fd.get('notes') || null, p_loss_kind: fd.get('kind') });
          if (error) throw error; toast('Stock adjusted.'); viewWarehouses(el);
        } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
      };
    }

    /* ---------- Setup & switch-on ---------- */
    function setupTab(body) {
      if (cfg.on) {
        body.innerHTML = '<div class="hint"><b>Warehouse tracking is ON.</b> Every purchase, sale and courier shipment needs a warehouse, and stock can never go below zero in a warehouse. Change stock only through purchases, sales, <b>Transfer</b> and <b>Adjust</b>. Older records (made before switch-on) are kept unchanged and are locked from editing.</div>';
        return;
      }
      body.innerHTML = `<div class="hint"><b>How to switch on safely</b><br>1. Physically count the stock of each product in each warehouse.<br>2. Enter the counted quantities below. They must add up to the system’s <b>total stock</b>; nothing is guessed or split automatically.<br>3. If the real count is different from the system total, first correct the system with <b>Inventory Control</b> (damage/loss for a shortage, increase stock for extra), then enter the split.<br>4. When every product shows ✔, the owner presses <b>Switch on</b>. This cannot be undone.<br>Until then, purchases and sales continue as usual. If you sell or buy while counting, re-check the totals before switching on.</div>
        <div class="row2"><input id="q" class="search" placeholder="Search product…"><label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" id="onlym" style="width:auto"> Show only products that do not match</label></div>
        <div id="sl"></div>
        <div class="box" style="margin-top:14px"><h3 style="margin:0 0 6px">Switch on warehouse tracking</h3><p class="mut" id="sw"></p><button class="btn" id="act" ${isOwner ? '' : 'disabled'}>Switch on warehouse tracking</button>${isOwner ? '' : '<p class="mut">Only the owner can do this.</p>'}</div>`;
      const sl = $('#sl', body);
      const draw3 = () => {
        const t = $('#q', body).value.toLowerCase(), only = $('#onlym', body).checked;
        const L = P.filter(p => (p.total > 0 || p.alloc > 0 || !only) && p.name.toLowerCase().includes(t) && (!only || Math.abs(p.un) > 0.0005));
        sl.innerHTML = table(['Product', 'System total', ...W.map(w => w.name + ' (counted)'), 'Status', ''], L.map(p => `<tr data-p="${p.id}"><td><b>${esc(p.name)}</b></td><td>${num(p.total)} ${esc(p.unit)}</td>${W.map(w => `<td><input class="wq" data-w="${w.id}" type="number" step="any" min="0" inputmode="decimal" value="${p.q[w.id]}" style="min-width:80px" ${canSetup ? '' : 'disabled'}></td>`).join('')}<td class="stt">${Math.abs(p.un) > 0.0005 ? `<span class="badge low">${p.un > 0 ? 'Missing ' + num(p.un) : 'Over by ' + num(-p.un)}</span>` : '✔'}</td><td>${canSetup ? '<button class="btn sm" data-save>Save</button>' : ''}</td></tr>`), 'Nothing to show.');
        sl.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
          const tr = b.closest('tr'), p = byP.get(tr.dataset.p), q = {};
          tr.querySelectorAll('.wq').forEach(i => q[i.dataset.w] = N(i.value));
          b.disabled = true;
          try { const { error } = await sb.rpc('wh_set_opening_stock', { p_product: p.id, p_qtys: q }); if (error) throw error; toast('Saved.'); viewWarehouses(el); }
          catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
        });
      };
      $('#q', body).oninput = draw3; $('#onlym', body).onchange = draw3; draw3();
      $('#sw', body).innerHTML = mism.length ? `<b>${mism.length}</b> product(s) do not match yet. Fix them first.` : 'All products match their system stock. You can switch on now.';
      $('#act', body).onclick = () => { if (mism.length) return toast(mism.length + ' product(s) do not match yet.', 'err'); confirmReason('Switch on warehouse tracking', 'From now on every purchase, sale and shipment must name a warehouse. Older records stay unchanged but can no longer be edited or cancelled. This cannot be undone. Continue?',
        async () => { const { error } = await sb.rpc('wh_activate'); return { error }; }, () => { cache = null; viewWarehouses(el); }, true); };
    }
    draw();
  }
  return { viewWarehouses, api };
}

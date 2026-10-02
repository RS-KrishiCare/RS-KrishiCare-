// Operations: Purchases, Retailer Sales, Invoices, Payments & Receivables.
// All accounting truth (stock, WAC, COGS, dues, balances) is computed by the database RPCs.
export function initOps(h) {
  const { sb, $, esc, money, num, N, today, toast, errMsg, has, modal, opts, chk, confirmReason, fsec } = h;
  const numIn = (cls, label, val = 0) => `<label>${label}<input class="${cls}" type="number" step="any" min="0" inputmode="decimal" value="${val}"></label>`;
  const fld = (name, label, val = 0, extra = '') => `<label>${label}<input name="${name}" type="number" step="any" min="0" inputmode="decimal" value="${val}" ${extra}></label>`;

  /* ================= PURCHASES ================= */
  async function viewPurchases(el) {
    const canCreate = has('owner', 'partner', 'warehouse'), canPay = has('owner', 'accountant'), seeDue = has('owner', 'partner', 'accountant');
    const rs = await Promise.all([
      sb.from('suppliers').select('id,name,is_active').order('name'),
      sb.from('products').select('id,name,unit,units_per_carton').eq('is_active', true).order('name'),
      sb.from('v_payment_methods').select('id,name').order('name'),
      sb.from('purchases').select('id,purchase_no,purchase_date,product_total,landed_total,suppliers(name)').order('purchase_date', { ascending: false }).limit(50),
      seeDue ? sb.from('v_supplier_due').select('*').gt('due', 0).order('purchase_date') : Promise.resolve({ data: [] })
    ]);
    chk(rs);
    const [sup, prod, acc, pur, due] = rs.map(r => r.data);
    const sname = Object.fromEntries(sup.map(s => [s.id, s.name]));
    const activeSup = sup.filter(s => s.is_active);

    let form = '';
    if (canCreate) {
      form = (!activeSup.length || !prod.length)
        ? `<div class="hint">Before recording a purchase, add at least one <b>supplier</b> and one <b>product</b>.</div>`
        : `<div class="box stack"><h3 style="margin:0 0 4px">New purchase</h3>
        <form id="pf">
          ${fsec(1, 'Supplier & date', `<label>Supplier<select name="supplier_id" class="ss" required><option value="">— Select supplier —</option>${opts(activeSup)}</select></label>
            <div class="row2"><label>Purchase date<input name="purchase_date" type="date" value="${today()}" required></label><label>Reference<input name="reference"></label></div>`)}
          ${fsec(2, 'Inbound costs', `<div class="row2">${fld('transport_cost', 'Transport agency')}${fld('loading_cost', 'Loading')}</div>
            <div class="row2">${fld('van_cost', 'Van / godown inbound')}${fld('other_cost', 'Other inbound')}</div>`, 'Enter once for the whole purchase — shared equally per carton')}
          ${fsec(3, 'Product lines', `<div id="lines"></div><button type="button" class="btn ghost sm" id="addln">+ Add another product</button>`)}
          ${fsec(4, 'Payment to supplier', `<div class="row2">${fld('paid_amount', 'Amount paid now')}
            <label>Paid from<select name="account_id"><option value="">— Select —</option>${opts(acc)}</select></label></div>`)}
          ${fsec(5, 'Notes & summary', `<label>Notes<input name="notes"></label><div id="prev"></div>
            <button class="btn go" style="width:100%">Save purchase and receive stock</button>`)}
        </form></div>`;
    }

    const dueHtml = seeDue ? `<h3 class="sec">Supplier payables</h3>${due.length
      ? `<div class="tablewrap"><table><thead><tr><th>Purchase</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Due</th>${canPay ? '<th></th>' : ''}</tr></thead><tbody>${due.map(d =>
        `<tr><td>${esc(d.purchase_no)}</td><td>${esc(sname[d.supplier_id] || '')}</td><td>${money(d.product_total)}</td><td>${money(d.paid)}</td><td><b>${money(d.due)}</b></td>${canPay ? `<td><button class="btn sm" data-pay="${d.purchase_id}">Pay</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">No outstanding supplier payables.</p>'}` : '';

    el.innerHTML = `<div class="bar"><h2>Purchases</h2></div>
    <div class="hint">Landing cost = product price + transport + loading + van/godown inbound cost. Enter the day’s inbound costs once (in any field below) — the system shares the total equally per carton across all products in this purchase. Cartons are calculated from each product’s “pieces per carton”. Stock is kept and sold in pieces. Delivery to retailers is a sales expense and is not part of landing cost.</div>
    ${form}${dueHtml}
    <h3 class="sec">Recent purchases</h3>${pur.length
        ? `<div class="tablewrap"><table><thead><tr><th>No.</th><th>Date</th><th>Supplier</th><th>Product total</th><th>Landed total</th><th></th></tr></thead><tbody>${pur.map(p =>
          `<tr><td>${esc(p.purchase_no)}</td><td>${esc(p.purchase_date)}</td><td>${esc(p.suppliers?.name || '')}</td><td>${money(p.product_total)}</td><td>${money(p.landed_total)}</td><td><button class="btn sm ghost" data-det="${p.id}">Details</button>${has('owner') ? ` <button class="btn sm ghost" data-void="${p.id}">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">No purchases recorded yet.</p>'}`;

    el.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
      const d = due.find(x => x.purchase_id === b.dataset.pay);
      modal('Pay supplier — ' + d.purchase_no,
        `${fld('amount', 'Amount', d.due, 'required')}<label>Paid from<select name="account">${opts(acc)}</select></label><label>Date<input name="date" type="date" value="${today()}"></label>`,
        async fd => {
          const { error } = await sb.rpc('pay_supplier', { p_purchase: d.purchase_id, p_amount: N(fd.get('amount')), p_account: fd.get('account'), p_date: fd.get('date'), p_ref: null });
          if (error) throw error; toast('Supplier payment recorded.'); viewPurchases(el);
        });
    });

    el.querySelectorAll('[data-det]').forEach(b => b.onclick = async () => {
      try {
        const pu = pur.find(x => x.id === b.dataset.det);
        const { data, error } = await sb.from('purchase_items').select('qty,cartons,unit_price,allocated_inbound,landed_unit_cost,products(name,unit)').eq('purchase_id', pu.id);
        if (error) throw error;
        modal('Purchase ' + pu.purchase_no,
          `<div class="tablewrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Cartons</th><th>Unit price</th><th>Inbound share</th><th>Landed / piece</th><th>Landed / carton</th></tr></thead><tbody>${data.map(i =>
            `<tr><td>${esc(i.products?.name || '')}</td><td>${num(i.qty)} ${esc(i.products?.unit || '')}</td><td>${num(i.cartons)}</td><td>${money(i.unit_price)}</td><td>${money(i.allocated_inbound)}</td><td><b>${money(i.landed_unit_cost)}</b></td><td>${N(i.cartons) > 0 ? money(N(i.qty) * N(i.landed_unit_cost) / N(i.cartons)) : '—'}</td></tr>`).join('')}</tbody></table></div>`,
          async () => { }, 'Close');
      } catch (err) { toast(errMsg(err), 'err'); }
    });
    el.querySelectorAll('[data-void]').forEach(b => b.onclick = () => {
      const pu = pur.find(x => x.id === b.dataset.void);
      confirmReason('Cancel purchase ' + pu.purchase_no, 'Stock added by this purchase will be removed and the payments will be reversed. This only works while all purchased units are still in stock.',
        r => sb.rpc('void_purchase', { p_purchase: pu.id, p_reason: r }), () => viewPurchases(el));
    });

    const pf = $('#pf', el); if (!pf) return;
    const box = $('#lines', el);
    const upcOf = pid => N(prod.find(x => x.id === pid)?.units_per_carton);
    const lineHtml = () => `<div class="ln"><label>Product<select class="pid ss"><option value="">— Select product —</option>${prod.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.unit)})${p.units_per_carton ? ' · ' + num(p.units_per_carton) + ' per carton' : ''}</option>`).join('')}</select></label>
      <div class="row2">${numIn('q', 'Quantity (pieces)', 1)}${numIn('p', 'Unit purchase price', 0)}</div>
      <div class="row2"><label>Cartons <small>(automatic)</small><input class="c" data-auto="1" type="number" step="any" min="0" inputmode="decimal" value="0"></label><button type="button" class="btn ghost sm rm" style="align-self:end;margin-bottom:10px">✕ Remove</button></div></div>`;
    const autoCartons = () => box.querySelectorAll('.ln').forEach(r => {
      const c = r.querySelector('.c'); if (c.dataset.auto === '0') return;
      const u = upcOf(r.querySelector('.pid').value), q = N(r.querySelector('.q').value);
      c.value = u > 0 ? Math.round(q / u * 1000) / 1000 : 0;
    });
    const calc = () => {
      autoCartons();
      const ls = [...box.querySelectorAll('.ln')].map(r => ({ name: r.querySelector('.pid').selectedOptions[0].text.split(' (')[0], q: N(r.querySelector('.q').value), p: N(r.querySelector('.p').value), c: N(r.querySelector('.c').value) }));
      const inb = ['transport_cost', 'loading_cost', 'van_cost', 'other_cost'].reduce((s, k) => s + N(pf.elements[k].value), 0);
      const tot = ls.reduce((s, l) => s + l.q * l.p, 0), cart = ls.reduce((s, l) => s + l.c, 0), ws = cart > 0 ? cart : ls.reduce((s, l) => s + l.q, 0);
      const paid = N(pf.elements.paid_amount.value);
      const miss = cart > 0 ? ls.filter(l => l.c <= 0).map(l => l.name) : [];
      $('#prev', el).innerHTML = `<div class="sum"><b>Estimate</b> <small>(the database calculates the final figures)</small>
      ${miss.length ? `<div class="err"><span>⚠ Cartons unknown for: ${esc(miss.join(', '))}. Set “pieces per carton” on the product or type the cartons.</span></div>` : ''}
      ${ls.map(l => { const w = cart > 0 ? l.c : l.q; const lt = ws > 0 ? l.q * l.p + inb * w / ws : 0; const lu = l.q > 0 ? lt / l.q : 0; return `<div><span>${esc(l.name)}</span><span>${money(lu)} / piece${l.c > 0 ? ' · ' + money(lt / l.c) + ' / carton' : ''}</span></div>`; }).join('')}
      <div><span>Total cartons</span><span>${num(cart)}</span></div>
      <div><span>Inbound cost per carton</span><span>${cart > 0 ? money(inb / cart) : '—'}</span></div>
      <div><span>Product total</span><span>${money(tot)}</span></div><div><span>Inbound costs (total)</span><span>${money(inb)}</span></div>
      <div><span>Supplier payable after this purchase</span><span>${money(Math.max(0, tot - paid))}</span></div></div>`;
    };
    box.insertAdjacentHTML('beforeend', lineHtml());
    $('#addln', el).onclick = () => { box.insertAdjacentHTML('beforeend', lineHtml()); calc(); };
    box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.children.length > 1) { e.target.closest('.ln').remove(); calc(); } });
    box.addEventListener('input', e => {
      if (e.target.classList.contains('c')) e.target.dataset.auto = '0';
      if (e.target.classList.contains('pid')) e.target.closest('.ln').querySelector('.c').dataset.auto = '1';
    });
    pf.addEventListener('input', calc); calc();
    pf.onsubmit = async e => {
      e.preventDefault(); const b = pf.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(pf);
        const items = [...box.querySelectorAll('.ln')].map(r => ({ product_id: r.querySelector('.pid').value, qty: N(r.querySelector('.q').value), unit_price: N(r.querySelector('.p').value), cartons: N(r.querySelector('.c').value) }));
        if (items.some(i => !i.product_id)) throw new Error('Select a product for every line (or remove the empty line).');
        const p = { supplier_id: fd.get('supplier_id'), purchase_date: fd.get('purchase_date'), reference: fd.get('reference'), transport_cost: N(fd.get('transport_cost')), loading_cost: N(fd.get('loading_cost')), van_cost: N(fd.get('van_cost')), other_cost: N(fd.get('other_cost')), paid_amount: N(fd.get('paid_amount')), account_id: fd.get('account_id') || '', notes: fd.get('notes'), items };
        const { error } = await sb.rpc('create_purchase', { p }); if (error) throw error;
        toast('Purchase saved. Stock has been updated.'); await viewPurchases(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= RETAILER SALES ================= */
  async function viewSales(el) {
    const rs = await Promise.all([
      sb.from('retailers').select('id,name,address,is_active').order('name'),
      sb.from('v_products_sales').select('*').order('name'),
      sb.from('v_payment_methods').select('id,name').order('name'),
      sb.from('v_my_sales').select('*').order('sale_date', { ascending: false }).limit(50)
    ]);
    chk(rs);
    const [ret, prod, acc, sales] = rs.map(r => r.data);
    const rname = Object.fromEntries(ret.map(r => [r.id, r.name]));
    const activeRet = ret.filter(r => r.is_active);
    const pmap = Object.fromEntries(prod.map(p => [p.id, p]));

    const form = (!activeRet.length || !prod.length)
      ? `<div class="hint">Before recording a sale, add a <b>retailer</b> and a <b>product</b>, and receive stock through a purchase.</div>`
      : `<div class="box stack"><h3 style="margin:0 0 4px">New retailer sale</h3><form id="sf">
        ${fsec(1, 'Customer & order', `<label>Retailer<select name="retailer_id" class="ss" required><option value="">— Select retailer —</option>${opts(activeRet)}</select></label>
          <div class="row2"><label>Sale date<input name="sale_date" type="date" value="${today()}" required></label><label>Order reference<input name="order_ref"></label></div>
          <label>Delivery address <small>(optional — defaults to the retailer’s address)</small><input name="delivery_address"></label>`)}
        ${fsec(2, 'Products', `<div id="lines"></div><button type="button" class="btn ghost sm" id="addln">+ Add another product</button>`)}
        ${fsec(3, 'Discount & charges', `<div class="row2">${fld('discount', 'Discount (total)')}${fld('delivery_charge', 'Delivery charge billed to customer')}</div>`)}
        ${fsec(4, 'Our delivery cost', `<div class="row2">${fld('retailer_delivery_cost', 'Retailer delivery cost')}<label>Paid from<select name="delivery_account_id"><option value="">— Select —</option>${opts(acc)}</select></label></div>`, 'Recorded as an expense — not shown on the invoice')}
        ${fsec(5, 'Payment received', `<div class="row2">${fld('paid_amount', 'Amount received now')}<label>Payment method<select name="account_id"><option value="">— Select —</option>${opts(acc)}</select></label></div>`)}
        ${fsec(6, 'Notes & summary', `<label>Notes<input name="notes"></label><div id="prev"></div>
          <button class="btn go" style="width:100%">Save sale and generate invoice</button>`)}
        </form></div>`;

    el.innerHTML = `<div class="bar"><h2>Retailer Sales</h2></div>${form}
    <h3 class="sec">Recent sales</h3>${sales.length
        ? `<div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Retailer</th><th>Total</th><th>Paid</th><th>Due</th><th></th></tr></thead><tbody>${sales.map(s =>
          `<tr><td>${esc(s.invoice_no)}</td><td>${esc(s.sale_date)}</td><td>${esc(rname[s.retailer_id] || '')}</td><td>${money(s.total)}</td><td>${money(s.paid)}</td><td><b>${money(s.due)}</b></td><td><button class="btn sm ghost" data-inv="${s.id}">Invoice</button>${has('owner') ? ` <button class="btn sm ghost" data-void="${s.id}">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">No sales recorded yet.</p>'}`;
    el.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => openInvoice(b.dataset.inv).catch(e => toast(errMsg(e), 'err')));
    el.querySelectorAll('[data-void]').forEach(b => b.onclick = () => {
      const s = sales.find(x => x.id === b.dataset.void);
      confirmReason('Cancel sale ' + s.invoice_no, 'Stock returns to the warehouse at its original cost and the delivery expense is reversed. Payments received on this sale must be reversed first.',
        r => sb.rpc('void_sale', { p_sale: s.id, p_reason: r }), () => viewSales(el));
    });

    const sf = $('#sf', el); if (!sf) return;
    const box = $('#lines', el);
    let rp = {};
    const priceFor = pid => rp[pid] ?? pmap[pid]?.sell_price ?? 0;
    const lineHtml = () => `<div class="ln"><label>Product<select class="pid ss"><option value="">— Select product —</option>${prod.map(p => `<option value="${p.id}">${esc(p.name)} — in stock ${num(p.qty_on_hand)} ${esc(p.unit)}</option>`).join('')}</select></label>
      <div class="row2">${numIn('q', 'Quantity', 1)}<label>Unit price<input class="p" data-auto="1" type="number" step="any" min="0" inputmode="decimal" value="${priceFor('')}"></label></div>
      <div class="row2">${numIn('ld', 'Line discount', 0)}<button type="button" class="btn ghost sm rm" style="align-self:end;margin-bottom:10px">✕ Remove</button></div></div>`;
    const refreshPrices = () => box.querySelectorAll('.ln').forEach(r => { const p = r.querySelector('.p'); if (p.dataset.auto !== '0') p.value = priceFor(r.querySelector('.pid').value); });
    const calc = () => {
      const ls = [...box.querySelectorAll('.ln')].map(r => ({ pid: r.querySelector('.pid').value, q: N(r.querySelector('.q').value), p: N(r.querySelector('.p').value), ld: N(r.querySelector('.ld').value) }));
      const sub = ls.reduce((s, l) => s + l.q * l.p - l.ld, 0);
      const total = sub - N(sf.elements.discount.value) + N(sf.elements.delivery_charge.value), paid = N(sf.elements.paid_amount.value);
      const over = ls.filter(l => l.pid && l.q > N(pmap[l.pid]?.qty_on_hand)).map(l => pmap[l.pid]?.name);
      $('#prev', el).innerHTML = `<div class="sum">${over.length ? `<div class="err"><span>⚠ Insufficient stock: ${esc(over.join(', '))}</span></div>` : ''}
      <div><span>Subtotal</span><span>${money(sub)}</span></div><div><span>Total payable</span><b>${money(total)}</b></div>
      <div><span>Balance due after this sale</span><span>${money(Math.max(0, total - paid))}</span></div></div>`;
    };
    box.insertAdjacentHTML('beforeend', lineHtml());
    $('#addln', el).onclick = () => { box.insertAdjacentHTML('beforeend', lineHtml()); calc(); };
    box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.children.length > 1) { e.target.closest('.ln').remove(); calc(); } });
    box.addEventListener('input', e => {
      if (e.target.classList.contains('p')) e.target.dataset.auto = '0';
      if (e.target.classList.contains('pid')) { const p = e.target.closest('.ln').querySelector('.p'); p.dataset.auto = '1'; p.value = priceFor(e.target.value); }
    });
    sf.addEventListener('input', calc);
    const loadPrices = async () => {
      if (!sf.elements.retailer_id.value) { rp = {}; refreshPrices(); calc(); return; }
      const { data } = await sb.from('retailer_prices').select('product_id,price').eq('retailer_id', sf.elements.retailer_id.value);
      rp = Object.fromEntries((data || []).map(x => [x.product_id, x.price])); refreshPrices(); calc();
    };
    sf.elements.retailer_id.addEventListener('change', loadPrices); await loadPrices();

    sf.onsubmit = async e => {
      e.preventDefault(); const b = sf.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(sf);
        const items = [...box.querySelectorAll('.ln')].map(r => ({ product_id: r.querySelector('.pid').value, qty: N(r.querySelector('.q').value), unit_price: N(r.querySelector('.p').value), line_discount: N(r.querySelector('.ld').value) }));
        if (items.some(i => !i.product_id)) throw new Error('Select a product for every line (or remove the empty line).');
        const p = { retailer_id: fd.get('retailer_id'), sale_date: fd.get('sale_date'), order_ref: fd.get('order_ref'), delivery_address: fd.get('delivery_address'), discount: N(fd.get('discount')), delivery_charge: N(fd.get('delivery_charge')), retailer_delivery_cost: N(fd.get('retailer_delivery_cost')), delivery_account_id: fd.get('delivery_account_id') || '', paid_amount: N(fd.get('paid_amount')), account_id: fd.get('account_id') || '', notes: fd.get('notes'), items };
        const { data: id, error } = await sb.rpc('create_sale', { p }); if (error) throw error;
        toast('Sale saved.'); await openInvoice(id); await viewSales(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= INVOICE (shared by retailer sales and Facebook orders) ================= */
  function words(n) {
    n = Math.round(Number(n) || 0); if (!n) return 'Zero Taka Only';
    const o = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const u100 = x => x < 20 ? o[x] : t[Math.floor(x / 10)] + (x % 10 ? ' ' + o[x % 10] : '');
    const u1000 = x => (x >= 100 ? o[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? u100(x % 100) : '');
    const parts = [];
    if (n >= 1e7) { parts.push(u100(Math.floor(n / 1e7)) + ' Crore'); n %= 1e7; }
    if (n >= 1e5) { parts.push(u100(Math.floor(n / 1e5)) + ' Lakh'); n %= 1e5; }
    if (n >= 1e3) { parts.push(u100(Math.floor(n / 1e3)) + ' Thousand'); n %= 1e3; }
    if (n) parts.push(u1000(n));
    return 'Taka ' + parts.join(' ') + ' Only';
  }
  const dfmt = d => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  async function showInvoice(inv) {
    const { data: st } = await sb.from('settings').select('value').eq('key', 'business').maybeSingle();
    const b = st?.value || {};
    const rows = inv.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td>${num(i.qty)}</td><td>${num(i.unit_price)}</td><td>${num(i.line_total)}</td></tr>`).join('');
    const blank = Array.from({ length: Math.max(0, 6 - inv.items.length) }, (_, k) => `<tr><td>${inv.items.length + k + 1}</td><td>&nbsp;</td><td></td><td></td><td></td></tr>`).join('');
    const m = document.createElement('div'); m.className = 'modal inv';
    m.innerHTML = `<div class="sheet"><div class="invoice-actions no-print">
      <button class="btn" id="pr">🖨 Print / Save as PDF</button><button class="btn ghost" id="cl">Close</button></div>
      <div class="invoice-paper" id="paper">
      <div class="invoice-top"><div class="invoice-brand"><img src="assets/logo.jpg" alt="" onerror="this.style.display='none'"><div><h1>${esc(b.name || 'RS KrishiCare')}</h1><p>${esc(b.subtitle || 'Agricultural tools and supplies')}</p></div></div>
        <div class="invoice-title">INVOICE<small>Customer copy</small></div></div>
      <div class="invoice-bar"><span>${esc(b.founder || '')}</span><span>${esc(b.founder_title || '')}</span></div>
      <div class="invoice-info">
        <div><label>Address</label>${esc(b.address || '')}</div><div><label>Mobile</label>${esc(b.phone || '')} (Order &amp; Info)</div>
        <div><label>Invoice No.</label>${esc(inv.no)}</div><div><label>Date</label>${dfmt(inv.date)}</div>
        <div><label>Customer</label>${esc(inv.customer || '')}</div><div><label>Mobile</label>${esc(inv.mobile || '')}</div>
        <div><label>Address</label>${esc(inv.address || '')}</div><div><label>Payment method</label>${esc(inv.method || '')}</div>
        <div><label>Delivery address</label>${esc(inv.delivery || inv.address || '')}</div><div><label>Order reference</label>${esc(inv.reference || '')}</div>
      </div>
      <table class="invoice-table"><thead><tr><th>SL</th><th>Product description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${rows}${blank}</tbody></table>
      <div class="invoice-bottom"><div class="invoice-words"><b>Amount in words</b><br><br>${words(inv.total)}</div>
        <div class="invoice-summary"><div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
        <div><span>Delivery charge</span><span>${money(inv.deliveryCharge)}</span></div><div><span>Discount</span><span>${money(inv.discount)}</span></div>
        <div class="total"><span>Total payable</span><span>${money(inv.total)}</span></div>
        <div><span>${esc(inv.paidLabel || 'Paid / advance')}</span><span>${money(inv.paid)}</span></div><div><span>${esc(inv.dueLabel || 'Balance due')}</span><span>${money(inv.due)}</span></div></div></div>
      <div class="invoice-note"><b>Notes</b><br>${esc(inv.notes || '')}</div>
      <div class="invoice-sign"><div>Customer signature</div><div>Authorized signature</div></div>
      <div class="invoice-thanks">Thank you for choosing RS KrishiCare.</div></div></div>`;
    document.body.appendChild(m);
    $('#cl', m).onclick = () => m.remove();
    $('#pr', m).onclick = () => window.print();
  }

  async function openInvoice(saleId) {
    const [s, it] = await Promise.all([
      sb.from('v_my_sales').select('*').eq('id', saleId).maybeSingle(),
      sb.from('v_my_sale_items').select('*').eq('sale_id', saleId)
    ]);
    chk([s, it]);
    if (!s.data) throw new Error('Invoice not found.');
    const x = s.data;
    const { data: r } = await sb.from('retailers').select('*').eq('id', x.retailer_id).maybeSingle();
    await showInvoice({
      no: x.invoice_no, date: x.sale_date, customer: r?.name, mobile: r?.phone, address: r?.address, delivery: x.delivery_address,
      method: x.payment_method || (N(x.paid) > 0 ? '' : 'Due'), reference: x.order_ref, notes: x.notes,
      items: (it.data || []).map(i => ({ name: i.product_name, qty: i.qty, unit_price: i.unit_price, line_total: i.line_total })),
      subtotal: x.subtotal, deliveryCharge: x.delivery_charge, discount: x.discount, total: x.total, paid: x.paid, due: x.due
    });
  }

  async function openFbInvoice(orderId) {
    const [o, it] = await Promise.all([
      sb.from('v_my_fb_orders').select('*').eq('id', orderId).maybeSingle(),
      sb.from('v_fb_items').select('*').eq('order_id', orderId)
    ]);
    chk([o, it]);
    if (!o.data) throw new Error('Order not found.');
    const x = o.data;
    await showInvoice({
      no: x.invoice_no, date: x.created_at, customer: x.customer_name, mobile: x.mobile, address: x.address, delivery: x.address,
      method: 'Cash on delivery (COD)', reference: x.order_ref,
      notes: (x.courier_advance > 0 ? 'Courier advance is a pass-through amount for the courier and is not part of the product price. ' : '') + (x.notes || ''),
      items: (it.data || []).map(i => ({ name: i.product_name, qty: i.qty, unit_price: i.unit_price, line_total: i.line_total })),
      subtotal: x.subtotal, deliveryCharge: 0, discount: x.discount, total: x.product_total,
      paid: x.courier_advance, paidLabel: 'Courier advance (pass-through)', due: Number(x.cod_amount) - Number(x.cod_received), dueLabel: 'Balance due (COD)'
    });
  }

  /* ================= PAYMENTS / RECEIVABLES ================= */
  async function viewPayments(el) {
    const fin = has('owner', 'partner', 'accountant');
    const rs = await Promise.all([
      sb.from('retailers').select('id,name').order('name'),
      sb.from('v_payment_methods').select('id,name').order('name'),
      sb.from('v_my_sales').select('id,invoice_no,retailer_id,sale_date,total,paid,due').gt('due', 0).order('sale_date'),
      fin ? sb.from('payments').select('id,payment_date,amount,retailers(name),financial_accounts(name)').order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] })
    ]);
    chk(rs);
    const [ret, acc, open, recent] = rs.map(r => r.data);
    const dueBy = {}; open.forEach(o => dueBy[o.retailer_id] = (dueBy[o.retailer_id] || 0) + N(o.due));
    const list = ret.filter(r => dueBy[r.id]);

    el.innerHTML = `<div class="bar"><h2>Payments & Receivables</h2></div>
    <h3 class="sec">Outstanding balances</h3>${list.length
        ? `<div class="tablewrap"><table><thead><tr><th>Retailer</th><th>Outstanding due</th></tr></thead><tbody>${list.map(r => `<tr><td>${esc(r.name)}</td><td><b>${money(dueBy[r.id])}</b></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">No outstanding balances.</p>'}
    ${list.length ? `<div class="box"><h3 style="margin:0 0 6px">Receive payment</h3><form id="pyf">
      <label>Retailer<select name="retailer_id" class="ss" required><option value="">— Select retailer —</option>${list.map(r => `<option value="${r.id}">${esc(r.name)} — due ${money(dueBy[r.id])}</option>`).join('')}</select></label>
      <div class="row2">${fld('amount', 'Payment amount', 0, 'required')}<label>Payment method<select name="account_id" required>${opts(acc)}</select></label></div>
      <div class="row2"><label>Date<input name="payment_date" type="date" value="${today()}"></label><label>Reference<input name="reference"></label></div>
      <div id="inv"></div><div id="tot" class="sum" style="display:none"></div>
      <button class="btn go" style="width:100%">Save payment</button></form></div>` : ''}
    ${fin ? `<h3 class="sec">Recent payments</h3>${recent.length
        ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Retailer</th><th>Amount</th><th>Method</th>${has('owner', 'accountant') ? '<th></th>' : ''}</tr></thead><tbody>${recent.map(p =>
          `<tr><td>${esc(p.payment_date)}</td><td>${esc(p.retailers?.name || '')}</td><td>${money(p.amount)}</td><td>${esc(p.financial_accounts?.name || '')}</td>${has('owner', 'accountant') ? `<td><button class="btn sm ghost" data-rev="${p.id}">Reverse</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">No payments recorded yet.</p>'}` : ''}`;
    el.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => {
      const p = recent.find(x => x.id === b.dataset.rev);
      confirmReason('Reverse payment of ' + money(p.amount), 'The money is taken back out of the account and the invoice balances are restored. Use this to correct a wrongly recorded payment.',
        r => sb.rpc('reverse_payment', { p_payment: p.id, p_reason: r }), () => viewPayments(el));
    });

    const f = $('#pyf', el); if (!f) return;
    const sum = () => {
      const als = [...f.querySelectorAll('.al')], a = als.reduce((s, i) => s + N(i.value), 0), amt = N(f.elements.amount.value);
      const t = $('#tot', el); t.style.display = als.length ? 'block' : 'none';
      t.innerHTML = `<div><span>Payment</span><span>${money(amt)}</span></div><div><span>Allocated to invoices</span><span>${money(a)}</span></div>
      <div class="${Math.abs(amt - a) > 0.001 ? 'err' : ''}"><span>Unallocated (must be zero)</span><b>${money(amt - a)}</b></div>`;
    };
    const showInv = () => {
      const rid = f.elements.retailer_id.value, rows = open.filter(o => o.retailer_id === rid);
      $('#inv', el).innerHTML = rows.length ? `<h3 class="sec">Allocate to invoices</h3>${rows.map(o =>
        `<label>${esc(o.invoice_no)} · ${esc(o.sale_date)} · due ${money(o.due)}<input class="al" data-id="${o.id}" data-due="${o.due}" type="number" step="any" min="0" max="${o.due}" inputmode="decimal" value="0"></label>`).join('')}
        <button type="button" class="btn ghost sm" id="auto">Auto-allocate (oldest first)</button>` : '';
      const au = $('#auto', el); if (au) au.onclick = () => { let left = N(f.elements.amount.value); f.querySelectorAll('.al').forEach(i => { const v = Math.min(left, N(i.dataset.due)); i.value = v; left -= v; }); sum(); };
      sum();
    };
    f.elements.retailer_id.addEventListener('change', showInv); f.addEventListener('input', sum);
    f.onsubmit = async e => {
      e.preventDefault(); const b = f.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(f);
        const allocations = [...f.querySelectorAll('.al')].map(i => ({ sale_id: i.dataset.id, amount: N(i.value) })).filter(x => x.amount > 0);
        const p = { retailer_id: fd.get('retailer_id'), amount: N(fd.get('amount')), account_id: fd.get('account_id'), payment_date: fd.get('payment_date'), reference: fd.get('reference'), allocations };
        const { error } = await sb.rpc('receive_retailer_payment', { p }); if (error) throw error;
        toast('Payment recorded.'); await viewPayments(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  return { viewPurchases, viewSales, viewPayments, openInvoice, openFbInvoice };
}

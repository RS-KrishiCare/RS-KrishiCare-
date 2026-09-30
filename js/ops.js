// Operations screens: Purchases, Retailer Sales (+Invoice), Payments/Receivables.
// All accounting truth (stock, WAC, COGS, dues, balances) is computed by the database RPCs.
export function initOps(h) {
  const { sb, $, esc, money, num, toast, errMsg, has, modal } = h;
  const today = () => new Date().toISOString().slice(0, 10);
  const N = v => Number(v || 0);
  const opts = (rows, sel = '') => rows.map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
  const chk = rs => { for (const r of rs) if (r.error) throw r.error; };
  const numIn = (cls, label, val = 0) => `<label>${label}<input class="${cls}" type="number" step="any" min="0" inputmode="decimal" value="${val}"></label>`;
  const fld = (name, label, val = 0, extra = '') => `<label>${label}<input name="${name}" type="number" step="any" min="0" inputmode="decimal" value="${val}" ${extra}></label>`;

  /* ================= PURCHASES ================= */
  async function viewPurchases(el) {
    const canCreate = has('owner', 'partner', 'warehouse'), canPay = has('owner', 'accountant'), seeDue = has('owner', 'partner', 'accountant');
    const rs = await Promise.all([
      sb.from('suppliers').select('id,name,is_active').order('name'),
      sb.from('products').select('id,name,unit').eq('is_active', true).order('name'),
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
        ? `<div class="hint">ক্রয় লিখতে আগে অন্তত একজন <b>সরবরাহকারী</b> এবং একটি <b>পণ্য</b> যোগ করুন।</div>`
        : `<div class="box"><h3 style="margin:0 0 6px">নতুন ক্রয়</h3>
        <form id="pf">
          <label>সরবরাহকারী<select name="supplier_id" required>${opts(activeSup)}</select></label>
          <div class="row2"><label>তারিখ<input name="purchase_date" type="date" value="${today()}" required></label>
          <label>ক্রয় রেফারেন্স<input name="reference"></label></div>
          <h3 class="sec">বাইরের খরচ (ল্যান্ডিং কস্টে যোগ হবে)</h3>
          <div class="row2">${fld('transport_cost', 'ট্রান্সপোর্ট এজেন্সি')}${fld('loading_cost', 'লোডিং')}</div>
          <div class="row2">${fld('van_cost', 'ভ্যান/গোডাউন ইনবাউন্ড')}${fld('other_cost', 'অন্যান্য ইনবাউন্ড')}</div>
          <h3 class="sec">পণ্যের লাইন</h3><div id="lines"></div>
          <button type="button" class="btn ghost sm" id="addln">+ আরেকটি পণ্য</button>
          <h3 class="sec">পরিশোধ</h3>
          <div class="row2">${fld('paid_amount', 'সরবরাহকারীকে পরিশোধ')}
          <label>অ্যাকাউন্ট<select name="account_id"><option value="">— নির্বাচন —</option>${opts(acc)}</select></label></div>
          <label>নোট<input name="notes"></label>
          <div id="prev"></div>
          <button class="btn go" style="width:100%">ক্রয় সংরক্ষণ ও স্টক গ্রহণ</button>
        </form></div>`;
    }

    const dueHtml = seeDue ? `<h3 class="sec">সরবরাহকারী বকেয়া</h3>${due.length
      ? `<div class="tablewrap"><table><thead><tr><th>ক্রয়</th><th>সরবরাহকারী</th><th>মোট</th><th>পরিশোধ</th><th>বকেয়া</th>${canPay ? '<th></th>' : ''}</tr></thead><tbody>${due.map(d =>
        `<tr><td>${esc(d.purchase_no)}</td><td>${esc(sname[d.supplier_id] || '')}</td><td>${money(d.product_total)}</td><td>${money(d.paid)}</td><td><b>${money(d.due)}</b></td>${canPay ? `<td><button class="btn sm" data-pay="${d.purchase_id}">পরিশোধ</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">কোনো সরবরাহকারী বকেয়া নেই</p>'}` : '';

    el.innerHTML = `<div class="bar"><h2>ক্রয়</h2></div>
    <div class="hint">ল্যান্ডিং কস্ট = পণ্যের দাম + ট্রান্সপোর্ট + লোডিং + ভ্যান/গোডাউন খরচ। বাইরের খরচ কার্টন অনুযায়ী সমানভাবে ভাগ হয়। রিটেইলারকে ডেলিভারি খরচ এর অংশ নয়।</div>
    ${form}${dueHtml}
    <h3 class="sec">সাম্প্রতিক ক্রয়</h3>${pur.length
        ? `<div class="tablewrap"><table><thead><tr><th>নং</th><th>তারিখ</th><th>সরবরাহকারী</th><th>পণ্যের মোট</th><th>ল্যান্ডেড মোট</th></tr></thead><tbody>${pur.map(p =>
          `<tr><td>${esc(p.purchase_no)}</td><td>${esc(p.purchase_date)}</td><td>${esc(p.suppliers?.name || '')}</td><td>${money(p.product_total)}</td><td>${money(p.landed_total)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">এখনো কোনো ক্রয় নেই</p>'}`;

    el.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
      const d = due.find(x => x.purchase_id === b.dataset.pay);
      modal('পরিশোধ — ' + d.purchase_no,
        `${fld('amount', 'টাকা', d.due, 'required')}<label>অ্যাকাউন্ট<select name="account">${opts(acc)}</select></label><label>তারিখ<input name="date" type="date" value="${today()}"></label>`,
        async fd => {
          const { error } = await sb.rpc('pay_supplier', { p_purchase: d.purchase_id, p_amount: N(fd.get('amount')), p_account: fd.get('account'), p_date: fd.get('date'), p_ref: null });
          if (error) throw error; toast('পরিশোধ সংরক্ষিত হয়েছে'); viewPurchases(el);
        });
    });

    const pf = $('#pf', el); if (!pf) return;
    const box = $('#lines', el);
    const lineHtml = () => `<div class="ln"><label>পণ্য<select class="pid">${prod.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select></label>
      <div class="row2">${numIn('q', 'পরিমাণ', 1)}${numIn('p', 'একক ক্রয়মূল্য', 0)}</div>
      <div class="row2">${numIn('c', 'কার্টন সংখ্যা', 0)}<button type="button" class="btn ghost sm rm" style="align-self:end;margin-bottom:10px">✕ বাদ দিন</button></div></div>`;
    const calc = () => {
      const ls = [...box.querySelectorAll('.ln')].map(r => ({ name: r.querySelector('.pid').selectedOptions[0].text, q: N(r.querySelector('.q').value), p: N(r.querySelector('.p').value), c: N(r.querySelector('.c').value) }));
      const inb = ['transport_cost', 'loading_cost', 'van_cost', 'other_cost'].reduce((s, k) => s + N(pf.elements[k].value), 0);
      const tot = ls.reduce((s, l) => s + l.q * l.p, 0), cart = ls.reduce((s, l) => s + l.c, 0), ws = cart > 0 ? cart : ls.reduce((s, l) => s + l.q, 0);
      const paid = N(pf.elements.paid_amount.value);
      $('#prev', el).innerHTML = `<div class="sum"><b>আনুমানিক হিসাব</b> <small>(চূড়ান্ত হিসাব ডেটাবেস করে)</small>
      ${ls.map(l => { const w = cart > 0 ? l.c : l.q; const lu = l.q > 0 && ws > 0 ? (l.q * l.p + inb * w / ws) / l.q : 0; return `<div><span>${esc(l.name)}</span><span>ল্যান্ডেড ইউনিট ${money(lu)}</span></div>`; }).join('')}
      <div><span>পণ্যের মোট</span><span>${money(tot)}</span></div><div><span>বাইরের খরচ</span><span>${money(inb)}</span></div>
      <div><span>সরবরাহকারী বকেয়া থাকবে</span><span>${money(Math.max(0, tot - paid))}</span></div></div>`;
    };
    box.insertAdjacentHTML('beforeend', lineHtml());
    $('#addln', el).onclick = () => { box.insertAdjacentHTML('beforeend', lineHtml()); calc(); };
    box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.children.length > 1) { e.target.closest('.ln').remove(); calc(); } });
    pf.addEventListener('input', calc); calc();
    pf.onsubmit = async e => {
      e.preventDefault(); const b = pf.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(pf);
        const items = [...box.querySelectorAll('.ln')].map(r => ({ product_id: r.querySelector('.pid').value, qty: N(r.querySelector('.q').value), unit_price: N(r.querySelector('.p').value), cartons: N(r.querySelector('.c').value) }));
        const p = { supplier_id: fd.get('supplier_id'), purchase_date: fd.get('purchase_date'), reference: fd.get('reference'), transport_cost: N(fd.get('transport_cost')), loading_cost: N(fd.get('loading_cost')), van_cost: N(fd.get('van_cost')), other_cost: N(fd.get('other_cost')), paid_amount: N(fd.get('paid_amount')), account_id: fd.get('account_id') || '', notes: fd.get('notes'), items };
        const { error } = await sb.rpc('create_purchase', { p }); if (error) throw error;
        toast('ক্রয় সংরক্ষিত হয়েছে, স্টক বেড়েছে'); await viewPurchases(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= SALES ================= */
  async function viewSales(el) {
    const rs = await Promise.all([
      sb.from('retailers').select('id,name,is_active').order('name'),
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
      ? `<div class="hint">বিক্রি লিখতে আগে <b>রিটেইলার</b> এবং <b>পণ্য</b> যোগ করুন, এবং ক্রয়ের মাধ্যমে স্টক তুলুন।</div>`
      : `<div class="box"><h3 style="margin:0 0 6px">নতুন রিটেইলার বিক্রয়</h3><form id="sf">
        <label>রিটেইলার<select name="retailer_id" required>${opts(activeRet)}</select></label>
        <div class="row2"><label>তারিখ<input name="sale_date" type="date" value="${today()}" required></label><label>অর্ডার রেফারেন্স<input name="order_ref"></label></div>
        <h3 class="sec">পণ্য</h3><div id="lines"></div><button type="button" class="btn ghost sm" id="addln">+ আরেকটি পণ্য</button>
        <h3 class="sec">ডিসকাউন্ট ও চার্জ</h3>
        <div class="row2">${fld('discount', 'ডিসকাউন্ট (মোট)')}${fld('delivery_charge', 'ডেলিভারি চার্জ (কাস্টমারকে বিল)')}</div>
        <h3 class="sec">আমাদের ডেলিভারি খরচ <small>(ইনভয়েসে যায় না, আলাদা খরচ)</small></h3>
        <div class="row2">${fld('retailer_delivery_cost', 'রিটেইলার ডেলিভারি খরচ')}<label>যে অ্যাকাউন্ট থেকে দেওয়া হলো<select name="delivery_account_id"><option value="">— নির্বাচন —</option>${opts(acc)}</select></label></div>
        <h3 class="sec">পেমেন্ট</h3>
        <div class="row2">${fld('paid_amount', 'এখন পাওয়া গেল')}<label>মাধ্যম<select name="account_id"><option value="">— নির্বাচন —</option>${opts(acc)}</select></label></div>
        <label>নোট<input name="notes"></label><div id="prev"></div>
        <button class="btn go" style="width:100%">বিক্রয় সংরক্ষণ ও ইনভয়েস</button></form></div>`;

    el.innerHTML = `<div class="bar"><h2>রিটেইলার বিক্রয়</h2></div>${form}
    <h3 class="sec">সাম্প্রতিক বিক্রয়</h3>${sales.length
        ? `<div class="tablewrap"><table><thead><tr><th>ইনভয়েস</th><th>তারিখ</th><th>রিটেইলার</th><th>মোট</th><th>পরিশোধ</th><th>বকেয়া</th><th></th></tr></thead><tbody>${sales.map(s =>
          `<tr><td>${esc(s.invoice_no)}</td><td>${esc(s.sale_date)}</td><td>${esc(rname[s.retailer_id] || '')}</td><td>${money(s.total)}</td><td>${money(s.paid)}</td><td><b>${money(s.due)}</b></td><td><button class="btn sm ghost" data-inv="${s.id}">ইনভয়েস</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">এখনো কোনো বিক্রয় নেই</p>'}`;
    el.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => openInvoice(b.dataset.inv).catch(e => toast(errMsg(e), 'err')));

    const sf = $('#sf', el); if (!sf) return;
    const box = $('#lines', el);
    let rp = {};
    const priceFor = pid => rp[pid] ?? pmap[pid]?.sell_price ?? 0;
    const lineHtml = () => `<div class="ln"><label>পণ্য<select class="pid">${prod.map(p => `<option value="${p.id}">${esc(p.name)} — স্টক ${num(p.qty_on_hand)} ${esc(p.unit)}</option>`).join('')}</select></label>
      <div class="row2">${numIn('q', 'পরিমাণ', 1)}<label>একক মূল্য<input class="p" data-auto="1" type="number" step="any" min="0" inputmode="decimal" value="${priceFor(prod[0].id)}"></label></div>
      <div class="row2">${numIn('ld', 'এই লাইনে ডিসকাউন্ট', 0)}<button type="button" class="btn ghost sm rm" style="align-self:end;margin-bottom:10px">✕ বাদ দিন</button></div></div>`;
    const refreshPrices = () => box.querySelectorAll('.ln').forEach(r => { const p = r.querySelector('.p'); if (p.dataset.auto !== '0') p.value = priceFor(r.querySelector('.pid').value); });
    const calc = () => {
      const ls = [...box.querySelectorAll('.ln')].map(r => ({ pid: r.querySelector('.pid').value, q: N(r.querySelector('.q').value), p: N(r.querySelector('.p').value), ld: N(r.querySelector('.ld').value) }));
      const sub = ls.reduce((s, l) => s + l.q * l.p - l.ld, 0);
      const total = sub - N(sf.elements.discount.value) + N(sf.elements.delivery_charge.value), paid = N(sf.elements.paid_amount.value);
      const over = ls.filter(l => l.q > N(pmap[l.pid]?.qty_on_hand)).map(l => pmap[l.pid]?.name);
      $('#prev', el).innerHTML = `<div class="sum">${over.length ? `<div class="err"><span>⚠ স্টক কম: ${esc(over.join(', '))}</span></div>` : ''}
      <div><span>সাবটোটাল</span><span>${money(sub)}</span></div><div><span>মোট প্রদেয়</span><b>${money(total)}</b></div>
      <div><span>বাকি থাকবে</span><span>${money(Math.max(0, total - paid))}</span></div></div>`;
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
      const { data } = await sb.from('retailer_prices').select('product_id,price').eq('retailer_id', sf.elements.retailer_id.value);
      rp = Object.fromEntries((data || []).map(x => [x.product_id, x.price])); refreshPrices(); calc();
    };
    sf.elements.retailer_id.addEventListener('change', loadPrices); await loadPrices();

    sf.onsubmit = async e => {
      e.preventDefault(); const b = sf.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(sf);
        const items = [...box.querySelectorAll('.ln')].map(r => ({ product_id: r.querySelector('.pid').value, qty: N(r.querySelector('.q').value), unit_price: N(r.querySelector('.p').value), line_discount: N(r.querySelector('.ld').value) }));
        const p = { retailer_id: fd.get('retailer_id'), sale_date: fd.get('sale_date'), order_ref: fd.get('order_ref'), discount: N(fd.get('discount')), delivery_charge: N(fd.get('delivery_charge')), retailer_delivery_cost: N(fd.get('retailer_delivery_cost')), delivery_account_id: fd.get('delivery_account_id') || '', paid_amount: N(fd.get('paid_amount')), account_id: fd.get('account_id') || '', notes: fd.get('notes'), items };
        const { data: id, error } = await sb.rpc('create_sale', { p }); if (error) throw error;
        toast('বিক্রয় সংরক্ষিত হয়েছে'); await openInvoice(id); await viewSales(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= INVOICE ================= */
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
  const dfmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  async function openInvoice(saleId) {
    const [s, it, st] = await Promise.all([
      sb.from('v_my_sales').select('*').eq('id', saleId).maybeSingle(),
      sb.from('v_my_sale_items').select('*').eq('sale_id', saleId),
      sb.from('settings').select('value').eq('key', 'business').maybeSingle()
    ]);
    chk([s, it, st]);
    if (!s.data) throw new Error('ইনভয়েস পাওয়া যায়নি');
    const sale = s.data, items = it.data || [], b = st.data?.value || {};
    const { data: r } = await sb.from('retailers').select('*').eq('id', sale.retailer_id).maybeSingle();
    const rows = items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.product_name)}</td><td>${num(i.qty)}</td><td>${num(i.unit_price)}</td><td>${num(i.line_total)}</td></tr>`).join('');
    const blank = Array.from({ length: Math.max(0, 6 - items.length) }, (_, k) => `<tr><td>${items.length + k + 1}</td><td>&nbsp;</td><td></td><td></td><td></td></tr>`).join('');
    const m = document.createElement('div'); m.className = 'modal inv';
    m.innerHTML = `<div class="sheet"><div class="invoice-actions no-print">
      <button class="btn" id="pr">🖨 প্রিন্ট / PDF</button><button class="btn ghost" id="cl">বন্ধ করুন</button></div>
      <div class="invoice-paper" id="paper">
      <div class="invoice-top"><div class="invoice-brand"><img src="assets/logo.jpg" alt="" onerror="this.style.display='none'"><div><h1>${esc(b.name || 'RS KrishiCare')}</h1><p>${esc(b.subtitle || 'Agricultural tools and supplies')}</p></div></div>
        <div class="invoice-title">INVOICE<small>Customer copy</small></div></div>
      <div class="invoice-bar"><span>${esc(b.founder || '')}</span><span>${esc(b.founder_title || '')}</span></div>
      <div class="invoice-info">
        <div><label>ঠিকানা</label>${esc(b.address || '')}</div><div><label>মোবাইল</label>${esc(b.phone || '')} (Order &amp; Info)</div>
        <div><label>Invoice No.</label>${esc(sale.invoice_no)}</div><div><label>Date</label>${dfmt(sale.sale_date)}</div>
        <div><label>Customer</label>${esc(r?.name || '')}</div><div><label>Mobile</label>${esc(r?.phone || '')}</div>
        <div><label>Address</label>${esc(r?.address || '')}</div><div><label>Payment method</label>${esc(sale.payment_method || (N(sale.paid) > 0 ? '—' : 'Due'))}</div>
        <div><label>Delivery address</label>${esc(r?.address || '')}</div><div><label>Order reference</label>${esc(sale.order_ref || '')}</div>
      </div>
      <table class="invoice-table"><thead><tr><th>SL</th><th>Product description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${rows}${blank}</tbody></table>
      <div class="invoice-bottom"><div class="invoice-words"><b>Amount in words</b><br><br>${words(sale.total)}</div>
        <div class="invoice-summary"><div><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
        <div><span>Delivery charge</span><span>${money(sale.delivery_charge)}</span></div><div><span>Discount</span><span>${money(sale.discount)}</span></div>
        <div class="total"><span>Total payable</span><span>${money(sale.total)}</span></div>
        <div><span>Paid / advance</span><span>${money(sale.paid)}</span></div><div><span>Balance due</span><span>${money(sale.due)}</span></div></div></div>
      <div class="invoice-note"><b>Notes</b><br>${esc(sale.notes || '')}</div>
      <div class="invoice-sign"><div>Customer signature</div><div>Authorized signature</div></div>
      <div class="invoice-thanks">Thank you for choosing RS KrishiCare.</div></div></div>`;
    document.body.appendChild(m);
    $('#cl', m).onclick = () => m.remove();
    $('#pr', m).onclick = () => window.print();
  }

  /* ================= PAYMENTS / RECEIVABLES ================= */
  async function viewPayments(el) {
    const fin = has('owner', 'partner', 'accountant');
    const rs = await Promise.all([
      sb.from('retailers').select('id,name').order('name'),
      sb.from('v_payment_methods').select('id,name').order('name'),
      sb.from('v_my_sales').select('id,invoice_no,retailer_id,sale_date,total,paid,due').gt('due', 0).order('sale_date'),
      fin ? sb.from('payments').select('payment_date,amount,retailers(name),financial_accounts(name)').order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] })
    ]);
    chk(rs);
    const [ret, acc, open, recent] = rs.map(r => r.data);
    const dueBy = {}; open.forEach(o => dueBy[o.retailer_id] = (dueBy[o.retailer_id] || 0) + N(o.due));
    const list = ret.filter(r => dueBy[r.id]);

    el.innerHTML = `<div class="bar"><h2>পেমেন্ট / পাওনা</h2></div>
    <h3 class="sec">বকেয়ার তালিকা</h3>${list.length
        ? `<div class="tablewrap"><table><thead><tr><th>রিটেইলার</th><th>বকেয়া</th></tr></thead><tbody>${list.map(r => `<tr><td>${esc(r.name)}</td><td><b>${money(dueBy[r.id])}</b></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">কোনো বকেয়া নেই</p>'}
    ${list.length ? `<div class="box"><h3 style="margin:0 0 6px">পেমেন্ট গ্রহণ</h3><form id="pyf">
      <label>রিটেইলার<select name="retailer_id" required><option value="">— নির্বাচন —</option>${list.map(r => `<option value="${r.id}">${esc(r.name)} — বকেয়া ${money(dueBy[r.id])}</option>`).join('')}</select></label>
      <div class="row2">${fld('amount', 'পেমেন্টের পরিমাণ', 0, 'required')}<label>মাধ্যম<select name="account_id" required>${opts(acc)}</select></label></div>
      <div class="row2"><label>তারিখ<input name="payment_date" type="date" value="${today()}"></label><label>রেফারেন্স<input name="reference"></label></div>
      <div id="inv"></div><div id="tot" class="sum" style="display:none"></div>
      <button class="btn go" style="width:100%">পেমেন্ট সংরক্ষণ</button></form></div>` : ''}
    ${fin ? `<h3 class="sec">সাম্প্রতিক পেমেন্ট</h3>${recent.length
        ? `<div class="tablewrap"><table><thead><tr><th>তারিখ</th><th>রিটেইলার</th><th>পরিমাণ</th><th>মাধ্যম</th></tr></thead><tbody>${recent.map(p =>
          `<tr><td>${esc(p.payment_date)}</td><td>${esc(p.retailers?.name || '')}</td><td>${money(p.amount)}</td><td>${esc(p.financial_accounts?.name || '')}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">এখনো কোনো পেমেন্ট নেই</p>'}` : ''}`;

    const f = $('#pyf', el); if (!f) return;
    const sum = () => {
      const als = [...f.querySelectorAll('.al')], a = als.reduce((s, i) => s + N(i.value), 0), amt = N(f.elements.amount.value);
      const t = $('#tot', el); t.style.display = als.length ? 'block' : 'none';
      t.innerHTML = `<div><span>পেমেন্ট</span><span>${money(amt)}</span></div><div><span>বণ্টন করা হয়েছে</span><span>${money(a)}</span></div>
      <div class="${Math.abs(amt - a) > 0.001 ? 'err' : ''}"><span>অবশিষ্ট (০ হতে হবে)</span><b>${money(amt - a)}</b></div>`;
    };
    const showInv = () => {
      const rid = f.elements.retailer_id.value, rows = open.filter(o => o.retailer_id === rid);
      $('#inv', el).innerHTML = rows.length ? `<h3 class="sec">কোন ইনভয়েসে কত</h3>${rows.map(o =>
        `<label>${esc(o.invoice_no)} · ${esc(o.sale_date)} · বকেয়া ${money(o.due)}<input class="al" data-id="${o.id}" data-due="${o.due}" type="number" step="any" min="0" max="${o.due}" inputmode="decimal" value="0"></label>`).join('')}
        <button type="button" class="btn ghost sm" id="auto">স্বয়ংক্রিয় বণ্টন (পুরোনো আগে)</button>` : '';
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
        toast('পেমেন্ট সংরক্ষিত হয়েছে'); await viewPayments(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  return { viewPurchases, viewSales, viewPayments, openInvoice };
}

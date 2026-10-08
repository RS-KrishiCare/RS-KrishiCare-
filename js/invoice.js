// Shared document renderer for invoices and estimates (kept in its own file so every screen uses the same version).
export function makeShowInvoice(h) {
  const { sb, $, esc, money, num } = h;
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

  return async function showInvoice(inv) {
    const { data: st } = await sb.from('settings').select('value').eq('key', 'business').maybeSingle();
    const b = st?.value || {};
    const rows = inv.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td>${num(i.qty)}</td><td>${num(i.unit_price)}</td><td>${num(i.line_total)}</td></tr>`).join('');
    const blank = Array.from({ length: Math.max(0, 6 - inv.items.length) }, (_, k) => `<tr><td>${inv.items.length + k + 1}</td><td>&nbsp;</td><td></td><td></td><td></td></tr>`).join('');
    const m = document.createElement('div'); m.className = 'modal inv';
    m.innerHTML = `<div class="sheet"><div class="invoice-actions no-print">
      <button class="btn" id="pr">🖨 Print / Save as PDF</button><button class="btn ghost" id="cl">Close</button></div>
      <div class="invoice-paper" id="paper">
      <div class="invoice-top"><div class="invoice-brand"><img src="assets/logo.jpg" alt="" onerror="this.style.display='none'"><div><h1>${esc(b.name || 'RS KrishiCare')}</h1><p>${esc(b.subtitle || 'Agricultural tools and supplies')}</p></div></div>
        <div class="invoice-title">${esc(inv.title || 'INVOICE')}<small>${esc(inv.subtitle || 'Customer copy')}</small></div></div>
      <div class="invoice-bar"><span>${esc(b.founder || '')}</span><span>${esc(b.founder_title || '')}</span></div>
      <div class="invoice-info">
        <div><label>Address</label>${esc(b.address || '')}</div><div><label>Mobile</label>${esc(b.phone || '')} (Order &amp; Info)</div>
        <div><label>${esc(inv.noLabel || 'Invoice No.')}</label>${esc(inv.no)}</div><div><label>Date</label>${dfmt(inv.date)}</div>
        <div><label>Customer</label>${esc(inv.customer || '')}</div><div><label>Mobile</label>${esc(inv.mobile || '')}</div>
        <div><label>Address</label>${esc(inv.address || '')}</div><div><label>${esc(inv.methodLabel || 'Payment method')}</label>${esc(inv.method || '')}</div>
        <div><label>Delivery address</label>${esc(inv.delivery || inv.address || '')}</div><div><label>${esc(inv.refLabel || 'Order reference')}</label>${esc(inv.reference || '')}</div>
      </div>
      <table class="invoice-table"><thead><tr><th>SL</th><th>Product description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${rows}${blank}</tbody></table>
      <div class="invoice-bottom"><div class="invoice-words"><b>Amount in words</b><br><br>${words(inv.total)}</div>
        <div class="invoice-summary"><div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
        <div><span>Delivery charge</span><span>${money(inv.deliveryCharge)}</span></div><div><span>Discount</span><span>${money(inv.discount)}</span></div>
        <div class="total"><span>${esc(inv.totalLabel || 'Total payable')}</span><span>${money(inv.total)}</span></div>
        ${inv.estimate ? '' : `<div><span>${esc(inv.paidLabel || 'Paid / advance')}</span><span>${money(inv.paid)}</span></div><div><span>${esc(inv.dueLabel || 'Balance due')}</span><span>${money(inv.due)}</span></div>`}</div></div>
      <div class="invoice-note" style="white-space:pre-line"><b>Notes</b><br>${esc(inv.notes || '')}</div>
      <div class="invoice-sign"><div>Customer signature</div><div>Authorized signature</div></div>
      <div class="invoice-thanks">Thank you for choosing RS KrishiCare.</div></div></div>`;
    document.body.appendChild(m);
    $('#cl', m).onclick = () => { document.body.classList.remove('printing-doc'); m.remove(); };
    $('#pr', m).onclick = () => {
      document.body.classList.add('printing-doc');
      const done = () => document.body.classList.remove('printing-doc');
      window.addEventListener('afterprint', done, { once: true });
      window.print();
    };
  }
}

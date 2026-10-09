// Estimates (quotations) for retailers.
// An estimate is only a saved, printable document. It never changes stock, sales, payments,
// expenses, accounts, profit or any report.
import { makeShowInvoice } from './invoice.js';

export function initEst(h, ops) {
  const { sb, $, esc, money, num, N, today, toast, errMsg, has, opts, chk, confirmReason, fsec, carry } = h;
  const showInvoice = makeShowInvoice(h);
  const numIn = (cls, label, val = 0) => `<label>${label}<input class="${cls}" type="number" step="any" min="0" inputmode="decimal" value="${val}"></label>`;
  const fld = (name, label, val = 0) => `<label>${label}<input name="${name}" type="number" step="any" min="0" inputmode="decimal" value="${val}"></label>`;
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const dshow = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const STATUS = { open: 'Open', accepted: 'Accepted', declined: 'Declined', converted: 'Converted' };
  const DEFAULT_NOTE = 'This is an estimate only and not an invoice. Prices are valid until the date shown. Stock availability is not guaranteed until the order is confirmed.';

  async function viewEstimates(el, editId = null) {
    const rs = await Promise.all([
      sb.from('retailers').select('id,name,phone,address,is_active').order('name'),
      sb.from('v_products_sales').select('id,name,unit,sell_price').order('name'),
      sb.from('estimates').select('*').order('created_at', { ascending: false }).limit(100),
      editId ? sb.from('estimate_items').select('*').eq('estimate_id', editId) : Promise.resolve({ data: [] }),
      editId ? sb.from('estimates').select('*').eq('id', editId).maybeSingle() : Promise.resolve({ data: null })
    ]);
    chk(rs);
    const [ret, prod, list, eitems, erow] = rs.map(r => r.data);
    const saleIds = list.filter(e => e.sale_id).map(e => e.sale_id);
    const invMap = {};
    if (saleIds.length) { const { data: sv } = await sb.from('v_my_sales').select('id,invoice_no').in('id', saleIds); (sv || []).forEach(x => { invMap[x.id] = x.invoice_no; }); }
    const ed = erow || null;
    const rmap = Object.fromEntries(ret.map(r => [r.id, r]));
    const pmap = Object.fromEntries(prod.map(p => [p.id, p]));
    const retOpts = (ed && ed.retailer_id && !ret.find(r => r.id === ed.retailer_id)) ? ret : ret.filter(r => r.is_active || (ed && r.id === ed.retailer_id));

    const form = !prod.length
      ? '<div class="hint">Add products first so they can be listed in an estimate.</div>'
      : `<div class="box stack"><h3 id="etitle" style="margin:0 0 4px">${ed ? 'Edit estimate ' + esc(ed.estimate_no) : 'New estimate'}</h3>
        <div id="ebar"></div><form id="esf">
        ${fsec(1, 'Customer', `<label>Retailer <small>(optional — choose to fill the details and use special prices)</small><select name="retailer_id" class="ss"><option value="">— Select retailer —</option>${opts(retOpts, ed?.retailer_id || '')}</select></label>
          <label>Customer name<input name="customer_name" required value="${esc(ed?.customer_name || '')}"></label>
          <div class="row2"><label>Mobile<input name="mobile" type="tel" value="${esc(ed?.mobile || '')}"></label><label>Reference<input name="reference" value="${esc(ed?.reference || '')}"></label></div>
          <label>Address<input name="address" value="${esc(ed?.address || '')}"></label>`)}
        ${fsec(2, 'Estimate dates', `<div class="row2"><label>Estimate date<input name="estimate_date" type="date" required value="${ed?.estimate_date || today()}"></label>
          <label>Valid until<input name="valid_until" type="date" value="${ed ? (ed.valid_until || '') : addDays(today(), 7)}"></label></div>`)}
        ${fsec(3, 'Products', `<div id="lines"></div><button type="button" class="btn ghost sm" id="addln">+ Add another product</button>`)}
        ${fsec(4, 'Discount & charges', `<div class="row2">${fld('discount', 'Discount (total)', ed ? ed.discount : 0)}${fld('delivery_charge', 'Delivery charge', ed ? ed.delivery_charge : 0)}</div>`)}
        ${fsec(5, 'Terms & summary', `<label>Notes / terms<textarea name="notes" rows="3">${esc(ed ? (ed.notes || '') : DEFAULT_NOTE)}</textarea></label>
          ${ed ? `<label>Status<select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${ed.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
          <div id="prev"></div><button class="btn go" style="width:100%">${ed ? 'Save changes' : 'Save estimate and generate document'}</button>`)}
        </form></div>`;

    const rows = list.map(e => {
      const expired = e.status === 'open' && e.valid_until && e.valid_until < today();
      const done = e.status === 'converted';
      const canConv = e.status === 'open' || e.status === 'accepted';
      return `<tr><td style="white-space:normal;min-width:190px"><button class="btn sm ghost" data-view="${e.id}">View / Print</button>
      ${canConv ? ` <button class="btn sm" data-conv="${e.id}">Convert to sale</button>` : ''}${done ? '' : ` <button class="btn sm ghost" data-edit="${e.id}">Edit</button> <button class="btn sm ghost" data-del="${e.id}">Delete</button>`}</td>
      <td><b>${esc(e.estimate_no)}</b></td><td>${esc(dshow(e.estimate_date))}</td><td>${e.valid_until ? esc(dshow(e.valid_until)) : '—'}</td><td>${esc(e.customer_name)}</td><td><b>${money(e.total)}</b></td>
      <td><span class="badge ${e.status === 'declined' ? 'low' : ''}">${done ? 'Converted' + (invMap[e.sale_id] ? ' · ' + esc(invMap[e.sale_id]) : '') : expired ? 'Expired' : STATUS[e.status]}</span></td></tr>`;
    }).join('');

    el.innerHTML = `<div class="bar"><h2>Estimates</h2></div>
    <div class="hint"><b>Estimates are quotations only.</b> They do not change stock, sales, payments, expenses, profit or any account, and they never appear in reports. When the retailer agrees, press <b>Convert to sale</b> — you can add or remove products first — and only then does it enter your books.</div>
    ${form}
    <h3 class="sec">Saved estimates</h3>
    ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Actions</th><th>No.</th><th>Date</th><th>Valid until</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No estimates saved yet.</p>'}`;

    el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openEstimate(b.dataset.view).catch(e => toast(errMsg(e), 'err')));
    el.querySelectorAll('[data-conv]').forEach(b => b.onclick = async () => {
      try {
        const e = list.find(x => x.id === b.dataset.conv);
        const { data: its, error } = await sb.from('estimate_items').select('*').eq('estimate_id', e.id); if (error) throw error;
        carry.convert = { id: e.id, estimate_no: e.estimate_no, retailer_id: e.retailer_id || '', reference: e.reference || '', address: e.address || '', discount: e.discount, delivery_charge: e.delivery_charge,
          items: its.map(i => ({ product_id: i.product_id, product_name: i.product_name, qty: i.qty, unit_price: i.unit_price, line_discount: i.line_discount })) };
        location.hash = '#sales';
      } catch (err) { toast(errMsg(err), 'err'); }
    });
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => { await viewEstimates(el, b.dataset.edit); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const e = list.find(x => x.id === b.dataset.del);
      confirmReason('Delete estimate ' + e.estimate_no, 'This removes the estimate document only. Nothing in your accounts or stock is affected.',
        r => sb.rpc('delete_estimate', { p_id: e.id, p_reason: r }), () => viewEstimates(el));
    });

    const f = $('#esf', el); if (!f) return;
    if (ed) $('#ebar', el).innerHTML = `<div class="hint"><b>Editing ${esc(ed.estimate_no)}.</b> The estimate number stays the same. <button type="button" class="link" id="ecancel">Cancel editing</button></div>`;
    if (ed) $('#ecancel', el).onclick = () => viewEstimates(el);

    const box = $('#lines', el);
    let rp = {};
    const priceFor = pid => rp[pid] ?? pmap[pid]?.sell_price ?? 0;
    const lineHtml = it => {
      const missing = it && it.product_id && !pmap[it.product_id];
      return `<div class="ln"><label>Product<select class="pid ss ss-hl"><option value="">— Select product —</option>${missing ? `<option value="${it.product_id}" selected>${esc(it.product_name)}</option>` : ''}${prod.map(p => `<option value="${p.id}" ${it && it.product_id === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</select></label>
      <div class="row2">${numIn('q', 'Quantity', it ? it.qty : 1)}<label>Unit price<input class="p" data-auto="${it ? 0 : 1}" type="number" step="any" min="0" inputmode="decimal" value="${it ? it.unit_price : priceFor('')}"></label></div>
      <div class="row2">${numIn('ld', 'Line discount', it ? it.line_discount : 0)}<button type="button" class="btn ghost sm rm" style="align-self:end;margin-bottom:10px">✕ Remove</button></div></div>`;
    };
    const calc = () => {
      const ls = [...box.querySelectorAll('.ln')].map(r => ({ q: N(r.querySelector('.q').value), p: N(r.querySelector('.p').value), ld: N(r.querySelector('.ld').value) }));
      const sub = ls.reduce((s, l) => s + l.q * l.p - l.ld, 0);
      const total = sub - N(f.elements.discount.value) + N(f.elements.delivery_charge.value);
      $('#prev', el).innerHTML = `<div class="sum"><div><span>Subtotal</span><span>${money(sub)}</span></div><div><span>Estimated total</span><b>${money(total)}</b></div></div>`;
    };
    if (ed && eitems.length) eitems.forEach(i => box.insertAdjacentHTML('beforeend', lineHtml(i))); else box.insertAdjacentHTML('beforeend', lineHtml(null));
    $('#addln', el).onclick = () => { box.insertAdjacentHTML('beforeend', lineHtml(null)); calc(); };
    box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.children.length > 1) { e.target.closest('.ln').remove(); calc(); } });
    box.addEventListener('input', e => {
      if (e.target.classList.contains('p')) e.target.dataset.auto = '0';
      if (e.target.classList.contains('pid')) { const p = e.target.closest('.ln').querySelector('.p'); p.dataset.auto = '1'; p.value = priceFor(e.target.value); }
    });
    f.addEventListener('input', calc);
    const refreshPrices = () => box.querySelectorAll('.ln').forEach(r => { const p = r.querySelector('.p'); if (p.dataset.auto !== '0') p.value = priceFor(r.querySelector('.pid').value); });
    f.elements.retailer_id.addEventListener('change', async () => {
      const id = f.elements.retailer_id.value, r = rmap[id];
      if (r) { f.elements.customer_name.value = r.name; f.elements.mobile.value = r.phone || ''; f.elements.address.value = r.address || ''; }
      rp = {};
      if (id) { const { data } = await sb.from('retailer_prices').select('product_id,price').eq('retailer_id', id); rp = Object.fromEntries((data || []).map(x => [x.product_id, x.price])); }
      refreshPrices(); calc();
    });
    calc();

    f.onsubmit = async e => {
      e.preventDefault(); const b = f.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(f);
        const items = [...box.querySelectorAll('.ln')].map(r => ({ product_id: r.querySelector('.pid').value, qty: N(r.querySelector('.q').value), unit_price: N(r.querySelector('.p').value), line_discount: N(r.querySelector('.ld').value) }));
        if (items.some(i => !i.product_id)) throw new Error('Select a product for every line (or remove the empty line).');
        const p = { retailer_id: fd.get('retailer_id') || '', customer_name: fd.get('customer_name'), mobile: fd.get('mobile'), address: fd.get('address'), reference: fd.get('reference'),
          estimate_date: fd.get('estimate_date'), valid_until: fd.get('valid_until') || '', discount: N(fd.get('discount')), delivery_charge: N(fd.get('delivery_charge')),
          notes: fd.get('notes'), status: fd.get('status') || 'open', items };
        const { data: id, error } = await sb.rpc('save_estimate', { p, p_id: editId });
        if (error) throw error;
        toast(editId ? 'Estimate updated.' : 'Estimate saved.');
        await openEstimate(id); await viewEstimates(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  async function openEstimate(id) {
    const [e, it] = await Promise.all([
      sb.from('estimates').select('*').eq('id', id).maybeSingle(),
      sb.from('estimate_items').select('*').eq('estimate_id', id)
    ]);
    chk([e, it]);
    if (!e.data) throw new Error('Estimate not found.');
    const x = e.data;
    await showInvoice({
      estimate: true, layout: 'reference', titlePre: 'Estimated', title: 'INVOICE', subtitle: 'Customer copy', noLabel: 'Estimate No.', totalLabel: 'Estimated total',
      methodLabel: 'Valid until', method: x.valid_until ? dshow(x.valid_until).replace(/ /g, '-') : 'Not specified', refLabel: 'Reference',
      no: x.estimate_no, date: x.estimate_date, customer: x.customer_name, mobile: x.mobile, address: x.address, delivery: x.address, reference: x.reference,
      notes: x.notes, items: (it.data || []).map(i => ({ name: i.product_name, qty: i.qty, unit_price: i.unit_price, line_total: i.line_total })),
      subtotal: x.subtotal, deliveryCharge: x.delivery_charge, discount: x.discount, total: x.total
    });
  }

  return { viewEstimates, openEstimate };
}

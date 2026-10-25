// Facebook orders, Expenses, Finance & Accounts, Partners & Capital, Inventory Control, Audit Log, Settings.
// Every write goes through database RPCs (atomic, role-checked, audited).
export function initFin(h, ops) {
  const { sb, $, esc, money, num, N, today, toast, errMsg, has, modal, opts, chk, listView, LOADING, confirmReason, fsec } = h;
  const numIn = (cls, label, val = 0) => `<label>${label}<input class="${cls}" type="number" step="any" min="0" inputmode="decimal" value="${val}"></label>`;
  const fld = (name, label, val = 0, extra = '') => `<label>${label}<input name="${name}" type="number" step="any" min="0" inputmode="decimal" value="${val}" ${extra}></label>`;
  const table = (heads, rows, empty) => rows.length
    ? `<div class="tablewrap"><table><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : `<p class="empty">${empty}</p>`;
  const label = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

  /* ================= FACEBOOK ORDERS ================= */
  const NEXT = {
    New: ['Confirmed', 'Cancelled'], Confirmed: ['Processing', 'Cancelled'], Processing: ['Packed', 'Shipped', 'Cancelled'],
    Packed: ['Shipped', 'Cancelled'], Shipped: ['Delivered', 'Returned', 'Failed'], Delivered: [], Returned: [], Cancelled: [], Failed: []
  };
  const FINISHED = ['Delivered', 'Returned', 'Failed', 'Cancelled'];

  async function viewFacebook(el, channel = 'facebook') {
    const web = channel === 'website', canCreate = !web && has('owner', 'partner', 'salesman'), canStatus = has('owner', 'partner', 'warehouse', 'accountant'), canSettle = has('owner', 'accountant');
    const rs = await Promise.all([
      sb.from('couriers').select('id,name').eq('is_active', true).order('name'),
      sb.from('v_products_sales').select('id,name,unit,facebook_price,qty_on_hand').order('name'),
      sb.from('v_payment_methods').select('id,name').order('name'),
      sb.from('v_my_fb_orders').select('*').eq('channel', channel).order('created_at', { ascending: false }).limit(100)
    ]);
    chk(rs);
    const [cour, prod, acc, orders] = rs.map(r => r.data);
    const pmap = Object.fromEntries(prod.map(p => [p.id, p]));

    const form = !canCreate ? '' : !prod.length
      ? `<div class="hint">Add products before creating Facebook orders.</div>`
      : `<div class="box stack"><h3 style="margin:0 0 4px">New Facebook order</h3><form id="ff">
        ${fsec(1, 'Customer & delivery', `<label>Customer name<input name="customer_name" required></label>
          <div class="row2"><label>Mobile<input name="mobile" type="tel" required></label>
          <label>Courier<select name="courier_id" class="ss"><option value="">— Not assigned —</option>${opts(cour)}</select></label></div>
          <label>Delivery address<input name="address" required></label>`)}
        ${fsec(2, 'Products', `<div id="lines"></div><button type="button" class="btn ghost sm" id="addln">+ Add another product</button>`)}
        ${fsec(3, 'Courier advance', `<div class="row2">${fld('courier_advance', 'Advance received from customer')}<label>Received via<select name="advance_account_id"><option value="">— Select —</option>${opts(acc)}</select></label></div>`, 'Pass-through — not revenue and not an expense')}
        ${fsec(4, 'Notes & summary', `<label>Notes<input name="notes"></label><div id="prev"></div>
          <button class="btn go" style="width:100%">Create order</button>`)}
        </form></div>`;

    // a website order cannot be Confirmed until its advance delivery charge is verified (the database enforces this too)
    const nextOf = o => NEXT[o.status].filter(s => !(web && o.status === 'New' && s === 'Confirmed' && !o.delivery_charge_verified));
    const rowsHtml = orders.map(o => {
      const codPending = o.status === 'Delivered' ? Number(o.cod_amount) - Number(o.cod_received) : 0;
      const done = FINISHED.includes(o.status) && (Number(o.courier_advance) === 0 || o.advance_settled) && (o.status !== 'Delivered' || codPending <= 0);
      return `<tr><td><b>${esc(o.order_ref)}</b><br><small>${esc(String(o.created_at).slice(0, 10))}</small></td>
      <td>${esc(o.customer_name)}<br><small>${esc(o.mobile || '')}</small></td>
      <td><span class="badge ${['Returned', 'Failed', 'Cancelled'].includes(o.status) ? 'low' : ''}">${esc(web && o.status === 'New' ? 'Pending Confirmation' : o.status)}</span>${web && o.status === 'New' ? `<br><small>${o.delivery_charge_verified ? 'Delivery charge verified' : '<b>Delivery charge not verified</b>'}</small>` : ''}${done ? '<br><small>Settlement completed</small>' : ''}</td>
      <td>${money(o.product_total)}</td><td>${money(o.courier_advance)}${Number(o.courier_advance) > 0 ? `<br><small>${o.advance_settled ? 'Settled to courier' : 'Pending settlement'}</small>` : ''}</td>
      <td>${o.status === 'Delivered' ? money(codPending) : '—'}</td>
      <td style="white-space:normal;min-width:190px">
        <button class="btn sm ghost" data-a="inv" data-id="${o.id}">Invoice</button>
        ${web && o.status === 'New' && !o.delivery_charge_verified && canSettle ? `<button class="btn sm go" data-a="dcv" data-id="${o.id}">Verify delivery charge</button>` : ''}
        ${canStatus && nextOf(o).length ? `<button class="btn sm" data-a="st" data-id="${o.id}">Update status</button>` : ''}
        ${canSettle && Number(o.courier_advance) > 0 && !o.advance_settled && FINISHED.includes(o.status) ? `<button class="btn sm ghost" data-a="adv" data-id="${o.id}">Settle advance</button>` : ''}
        ${canSettle && o.status === 'Delivered' && codPending > 0 ? `<button class="btn sm ghost" data-a="cod" data-id="${o.id}">Receive COD</button>` : ''}
        ${canSettle && Number(o.cod_received) > 0 ? `<button class="btn sm ghost" data-a="rcod" data-id="${o.id}">Reverse COD</button>` : ''}
        ${canSettle && o.advance_settled ? `<button class="btn sm ghost" data-a="radv" data-id="${o.id}">Undo settlement</button>` : ''}
      </td></tr>`;
    });

    el.innerHTML = `<div class="bar"><h2>${web ? 'Website Orders' : 'Facebook Orders'}</h2></div>
    ${web ? '<div class="hint"><b>Website orders (product price = cash on delivery).</b> A new order is <b>Pending Confirmation</b>. Call the customer, tell them the delivery charge and collect it in advance, then press <b>Verify delivery charge</b>. Only after that can you set the order to <b>Confirmed</b>. Stock leaves the warehouse when an order is <b>Shipped</b>; the sale is recognised when it is <b>Delivered</b>; if it is <b>Returned</b> or <b>Failed</b> the stock returns automatically. The delivery charge you collected is held for the courier (it is not income) and is paid on with <b>Settle advance</b>.</div>' : `<div class="hint"><b>How it works:</b> COD equals the product total only. Stock leaves the warehouse when an order is <b>Shipped</b>; revenue is recognised when it is <b>Delivered</b>. If an order is <b>Returned</b> or <b>Failed</b>, the stock returns automatically. The courier advance never affects profit; it is settled to the courier in every outcome and is not refunded to the customer.</div>`}
    ${form}<h3 class="sec">Orders</h3>
    ${table(['Order', 'Customer', 'Status', 'Product total (COD)', web ? 'Delivery charge (advance)' : 'Courier advance', 'COD pending', ''], rowsHtml, web ? 'No website orders yet.' : 'No Facebook orders yet.')}`;

    el.onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const o = orders.find(x => x.id === b.dataset.id); if (!o) return;
      try {
        if (b.dataset.a === 'inv') await ops.openFbInvoice(o.id);
        if (b.dataset.a === 'st') modal('Update status — ' + o.order_ref,
          `<label>New status<select name="status">${nextOf(o).map(s => `<option>${s}</option>`).join('')}</select></label><label>Note (optional)<input name="note"></label>
           <p class="mut">Shipped: stock leaves the warehouse. Delivered: revenue is recognised. Returned / Failed: stock returns to the warehouse.</p>`,
          async fd => { const { error } = await sb.rpc('fb_set_status', { p_order: o.id, p_status: fd.get('status'), p_note: fd.get('note') || null }); if (error) throw error; toast('Order status updated.'); viewFacebook(el, channel); });
        if (b.dataset.a === 'dcv') modal('Verify delivery charge — ' + o.order_ref,
          `<p>Call the customer, tell them the delivery charge, and collect it <b>in advance</b>. Record it here only after the money has really been received. The order can be confirmed afterwards. The product price (<b>${money(o.product_total)}</b>) is still collected on delivery.</p>${fld('amount', 'Delivery charge received (৳)', 0, 'required')}<label>Received via<select name="account">${opts(acc)}</select></label><label>Date<input name="date" type="date" value="${today()}"></label>`,
          async fd => { if (!(N(fd.get('amount')) > 0)) throw new Error('Enter the delivery charge amount you received.'); const { error } = await sb.rpc('web_verify_delivery_charge', { p_order: o.id, p_amount: N(fd.get('amount')), p_account: fd.get('account'), p_date: fd.get('date') }); if (error) throw error; toast('Delivery charge verified. You can now confirm the order.'); viewFacebook(el, channel); });
        if (b.dataset.a === 'adv') modal('Settle courier advance — ' + o.order_ref,
          `<p>Pay <b>${money(o.courier_advance)}</b> to the courier. This has no effect on profit.</p><label>Paid from<select name="account">${opts(acc)}</select></label><label>Date<input name="date" type="date" value="${today()}"></label>`,
          async fd => { const { error } = await sb.rpc('fb_settle_advance', { p_order: o.id, p_account: fd.get('account'), p_date: fd.get('date') }); if (error) throw error; toast('Courier advance settled.'); viewFacebook(el, channel); });
        if (b.dataset.a === 'cod') modal('Receive COD — ' + o.order_ref,
          `${fld('amount', 'Amount received', Number(o.cod_amount) - Number(o.cod_received), 'required')}<label>Received into<select name="account">${opts(acc)}</select></label><label>Date<input name="date" type="date" value="${today()}"></label>`,
          async fd => { const { error } = await sb.rpc('fb_receive_cod', { p_order: o.id, p_amount: N(fd.get('amount')), p_account: fd.get('account'), p_date: fd.get('date') }); if (error) throw error; toast('COD recorded.'); viewFacebook(el, channel); });
        if (b.dataset.a === 'rcod') confirmReason('Reverse COD — ' + o.order_ref, `The ${money(o.cod_received)} received for this order is taken back out of the account(s) it was deposited into. Use this to correct a wrongly recorded COD receipt.`,
          r => sb.rpc('fb_reverse_cod', { p_order: o.id, p_reason: r }), () => viewFacebook(el, channel));
        if (b.dataset.a === 'radv') confirmReason('Undo courier settlement — ' + o.order_ref, `The ${money(o.courier_advance)} paid to the courier is returned to the account it was paid from, and the advance becomes pending again.`,
          r => sb.rpc('fb_reverse_advance', { p_order: o.id, p_reason: r }), () => viewFacebook(el, channel));
      } catch (err) { toast(errMsg(err), 'err'); }
    };

    const ff = $('#ff', el); if (!ff) return;
    const box = $('#lines', el);
    const lineHtml = () => `<div class="ln"><label>Product<select class="pid ss"><option value="">— Select product —</option>${prod.map(p => `<option value="${p.id}">${esc(p.name)} — in stock ${num(p.qty_on_hand)} ${esc(p.unit)}</option>`).join('')}</select></label>
      <div class="row2">${numIn('q', 'Quantity', 1)}<label>Selling price<input class="p" data-auto="1" type="number" step="any" min="0" inputmode="decimal" value="0"></label></div>
      <div class="row2">${numIn('d', 'Discount', 0)}<button type="button" class="btn ghost sm rm" style="align-self:end;margin-bottom:10px">✕ Remove</button></div></div>`;
    const calc = () => {
      const ls = [...box.querySelectorAll('.ln')].map(r => ({ q: N(r.querySelector('.q').value), p: N(r.querySelector('.p').value), d: N(r.querySelector('.d').value) }));
      const total = ls.reduce((s, l) => s + l.q * l.p - l.d, 0), adv = N(ff.elements.courier_advance.value);
      $('#prev', el).innerHTML = `<div class="sum"><div><span>Product total</span><span>${money(total)}</span></div>
      <div><span>Courier advance received (pass-through)</span><span>${money(adv)}</span></div>
      <div><b>COD to collect</b><b>${money(total)}</b></div></div>`;
    };
    box.insertAdjacentHTML('beforeend', lineHtml());
    $('#addln', el).onclick = () => { box.insertAdjacentHTML('beforeend', lineHtml()); calc(); };
    box.addEventListener('click', e => { if (e.target.classList.contains('rm') && box.children.length > 1) { e.target.closest('.ln').remove(); calc(); } });
    box.addEventListener('input', e => {
      if (e.target.classList.contains('p')) e.target.dataset.auto = '0';
      if (e.target.classList.contains('pid')) { const p = e.target.closest('.ln').querySelector('.p'); p.dataset.auto = '1'; p.value = pmap[e.target.value]?.facebook_price ?? 0; }
    });
    ff.addEventListener('input', calc); calc();
    ff.onsubmit = async e => {
      e.preventDefault(); const b = ff.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(ff);
        const items = [...box.querySelectorAll('.ln')].map(r => ({ product_id: r.querySelector('.pid').value, qty: N(r.querySelector('.q').value), unit_price: N(r.querySelector('.p').value), discount: N(r.querySelector('.d').value) }));
        if (items.some(i => !i.product_id)) throw new Error('Select a product for every line (or remove the empty line).');
        const p = { customer_name: fd.get('customer_name'), mobile: fd.get('mobile'), address: fd.get('address'), courier_id: fd.get('courier_id') || '', courier_advance: N(fd.get('courier_advance')), advance_account_id: fd.get('advance_account_id') || '', notes: fd.get('notes'), items };
        const { error } = await sb.rpc('create_fb_order', { p }); if (error) throw error;
        toast('Order created.'); await viewFacebook(el, channel);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= EXPENSES ================= */
  async function viewExpenses(el) {
    const rs = await Promise.all([
      sb.from('expense_categories').select('id,name').eq('is_active', true).order('name'),
      sb.from('v_payment_methods').select('id,name').order('name'),
      sb.from('expenses').select('id,expense_date,description,amount,reference,expense_categories(name),financial_accounts(name)').order('expense_date', { ascending: false }).order('created_at', { ascending: false }).limit(200)
    ]);
    chk(rs);
    const [cats, acc, exp] = rs.map(r => r.data);
    const by = {}; exp.forEach(e => { const k = e.expense_categories?.name || 'Other'; by[k] = (by[k] || 0) + N(e.amount); });
    const canAdd = has('owner', 'partner', 'accountant');
    el.innerHTML = `<div class="bar"><h2>Expenses</h2></div>
    <div class="hint">Expenses are kept separate from purchase cost (COGS). Retailer delivery is recorded here as a sales expense. Supplier payments, partner withdrawals and account transfers are not expenses.</div>
    ${canAdd ? `<div class="box"><h3 style="margin:0 0 6px">Record expense</h3><form id="ef">
      <div class="row2"><label>Category<select name="category_id" required>${opts(cats)}</select></label>${fld('amount', 'Amount', 0, 'required')}</div>
      <div class="row2"><label>Date<input name="expense_date" type="date" value="${today()}" required></label><label>Paid from<select name="account_id" required>${opts(acc)}</select></label></div>
      <label>Description<input name="description" required></label>
      <div class="row2"><label>Reference<input name="reference"></label><label>Notes<input name="notes"></label></div>
      <button class="btn go" style="width:100%">Save expense</button></form></div>` : ''}
    <h3 class="sec">By category (latest 200 entries)</h3><div class="grid">${Object.keys(by).length ? Object.entries(by).map(([k, v]) => `<div class="card"><div class="l">${esc(k)}</div><div class="v">${money(v)}</div></div>`).join('') : '<div class="card"><div class="l">Total expenses</div><div class="v">৳ 0.00</div></div>'}</div>
    <h3 class="sec">Expense ledger</h3>
    ${table(['Date', 'Category', 'Description', 'Paid from', 'Reference', 'Amount', ''], exp.map(e => `<tr><td>${esc(e.expense_date)}</td><td>${esc(e.expense_categories?.name || '')}</td><td>${esc(e.description || '')}</td><td>${esc(e.financial_accounts?.name || '')}</td><td>${esc(e.reference || '')}</td><td><b>${money(e.amount)}</b></td><td>${canAdd ? `<button class="btn sm ghost" data-del="${e.id}">Delete</button>` : ''}</td></tr>`), 'No expenses recorded yet.')}`;
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const x = exp.find(r => r.id === b.dataset.del);
      confirmReason('Delete expense', `Delete “${esc(x.description || '')}” (${money(x.amount)})? The amount is returned to the account. Use this to correct a wrongly entered expense; the original entry stays in the Audit Log.`,
        r => sb.rpc('void_expense', { p_expense: x.id, p_reason: r }), () => viewExpenses(el));
    });
    const f = $('#ef', el); if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault(); const b = f.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(f);
        const p = { category_id: fd.get('category_id'), amount: N(fd.get('amount')), expense_date: fd.get('expense_date'), account_id: fd.get('account_id'), description: fd.get('description'), reference: fd.get('reference'), notes: fd.get('notes') };
        const { error } = await sb.rpc('record_expense', { p }); if (error) throw error;
        toast('Expense recorded.'); await viewExpenses(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= FINANCE & ACCOUNTS ================= */
  async function viewFinance(el, editId = null) {
    const rs = await Promise.all([
      sb.from('v_account_balances').select('*').order('name'),
      sb.from('v_dashboard').select('retailer_due,supplier_due,courier_advance_pending,fb_cod_pending').maybeSingle(),
      sb.from('account_transactions').select('id,txn_date,direction,amount,kind,description,financial_accounts(name)').order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      sb.from('account_transfers').select('*').order('transfer_date', { ascending: false }).order('created_at', { ascending: false }).limit(50)
    ]);
    chk(rs);
    const [bal, d, tx, trs] = [rs[0].data, rs[1].data || {}, rs[2].data, rs[3].data];
    const canMove = has('owner', 'accountant');
    const nm = Object.fromEntries(bal.map(a => [a.account_id, a.name]));
    const bo = Object.fromEntries(bal.map(a => [a.account_id, N(a.balance)]));
    const ed = editId ? trs.find(t => t.id === editId) : null;
    // Money that can leave an account. While editing, the transfer being edited is first "taken back".
    const avail = id => (bo[id] || 0) + (ed && id === ed.from_account ? N(ed.amount) : 0) - (ed && id === ed.to_account ? N(ed.amount) : 0);
    const fromOpts = bal.map(a => { const v = avail(a.account_id); return `<option value="${a.account_id}" ${v <= 0 ? 'disabled' : ''} ${ed && ed.from_account === a.account_id ? 'selected' : ''}>${esc(a.name)} — ${money(v)}${v <= 0 ? ' (no balance)' : ''}</option>`; }).join('');
    const toOpts = bal.map(a => `<option value="${a.account_id}" ${ed && ed.to_account === a.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    const trRows = trs.map(t => `<tr>${canMove ? `<td style="white-space:nowrap"><button class="btn sm ghost" data-te="${t.id}">Edit</button> <button class="btn sm ghost" data-td="${t.id}">Delete</button></td>` : ''}
      <td>${esc(t.transfer_date)}</td><td>${esc(nm[t.from_account] || '')}</td><td>${esc(nm[t.to_account] || '')}</td><td><b>${money(t.amount)}</b></td><td>${esc(t.note || '')}</td></tr>`);

    el.innerHTML = `<div class="bar"><h2>Finance & Accounts</h2></div>
    <h3 class="sec">Account balances</h3><div class="grid">${bal.map(a => `<div class="card ${Number(a.balance) < 0 ? 'neg' : ''}"><div class="l">${esc(a.name)}</div><div class="v">${money(a.balance)}</div></div>`).join('')}</div>
    <h3 class="sec">Receivables and payables</h3><div class="grid">
      <div class="card"><div class="l">Retailer receivable</div><div class="v">${money(d.retailer_due)}</div></div>
      <div class="card"><div class="l">Supplier payable</div><div class="v">${money(d.supplier_due)}</div></div>
      <div class="card"><div class="l">Facebook COD pending</div><div class="v">${money(d.fb_cod_pending)}</div></div>
      <div class="card"><div class="l">Courier advance pending</div><div class="v">${money(d.courier_advance_pending)}</div></div></div>
    ${canMove ? `<div class="box"><h3 id="ttitle" style="margin:0 0 6px">${ed ? 'Edit transfer' : 'Transfer between accounts'}</h3>
      <p class="mut">A transfer only moves money between your own accounts. It is never income or expense. You cannot transfer more than the source account holds, and an account with no balance cannot be a source.</p>
      ${ed ? `<div class="hint"><b>Editing a transfer of ${money(ed.amount)}.</b> <button type="button" class="link" id="tcancel">Cancel editing</button></div>` : ''}
      <form id="tf">
      <div class="row2"><label>From<select name="from" required><option value="">— Select account —</option>${fromOpts}</select></label>
      <label>To<select name="to" required><option value="">— Select account —</option>${toOpts}</select></label></div>
      <div class="row2">${fld('amount', 'Amount', ed ? ed.amount : 0, 'required')}<label>Date<input name="date" type="date" value="${ed ? ed.transfer_date : today()}"></label></div>
      <label>Note<input name="note" value="${esc(ed ? (ed.note || '') : '')}"></label>
      <div id="tmsg" class="sum"></div>
      <button class="btn go" style="width:100%">${ed ? 'Save changes' : 'Transfer'}</button></form></div>` : ''}
    <h3 class="sec">Transfers between accounts</h3>
    ${table([...(canMove ? ['Actions'] : []), 'Date', 'From', 'To', 'Amount', 'Note'], trRows, 'No transfers recorded yet.')}
    <h3 class="sec">Recent transactions</h3>
    ${table(['Date', 'Account', 'Type', 'In', 'Out', 'Details'], tx.map(t => `<tr><td>${esc(t.txn_date)}</td><td>${esc(t.financial_accounts?.name || '')}</td><td>${esc(label(t.kind))}</td><td>${t.direction === 'in' ? money(t.amount) : ''}</td><td>${t.direction === 'out' ? money(t.amount) : ''}</td><td>${esc(t.description || '')}</td></tr>`), 'No transactions yet.')}`;

    el.querySelectorAll('[data-te]').forEach(b => b.onclick = async () => { await viewFinance(el, b.dataset.te); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    el.querySelectorAll('[data-td]').forEach(b => b.onclick = () => {
      const t = trs.find(x => x.id === b.dataset.td);
      confirmReason('Delete transfer', `Delete the transfer of ${money(t.amount)} from ${esc(nm[t.from_account] || '')} to ${esc(nm[t.to_account] || '')}? Both account balances go back as if it never happened. This is refused if the received money has already been spent.`,
        r => sb.rpc('delete_transfer', { p_transfer: t.id, p_reason: r }), () => viewFinance(el));
    });

    const f = $('#tf', el); if (!f) return;
    if (ed) $('#tcancel', el).onclick = () => viewFinance(el);
    const go = f.querySelector('.go');
    const check = () => {
      const from = f.elements.from.value, to = f.elements.to.value, amt = N(f.elements.amount.value);
      let msg = 'Choose the source account.', bad = !from;
      if (from && to && from === to) { msg = '<span class="err">Choose two different accounts.</span>'; bad = true; }
      else if (from && amt > avail(from) + 1e-9) { msg = `<span class="err">Not enough money in ${esc(nm[from])}. Available: ${money(avail(from))}.</span>`; bad = true; }
      else if (from) msg = `Available in ${esc(nm[from])}: <b>${money(avail(from))}</b>${amt > 0 ? ` · after transfer: ${money(avail(from) - amt)}` : ''}`;
      $('#tmsg', el).innerHTML = `<div><span>${msg}</span></div>`;
      go.disabled = bad || !to || !(amt > 0);
    };
    f.addEventListener('input', check); f.addEventListener('change', check); check();
    f.onsubmit = async e => {
      e.preventDefault(); go.disabled = true;
      try {
        const fd = new FormData(f);
        const args = { p_from: fd.get('from'), p_to: fd.get('to'), p_amount: N(fd.get('amount')), p_date: fd.get('date'), p_note: fd.get('note') || null };
        const { error } = ed ? await sb.rpc('update_transfer', { p_transfer: ed.id, ...args }) : await sb.rpc('transfer_funds', args);
        if (error) throw error; toast(ed ? 'Transfer updated.' : 'Transfer recorded.'); await viewFinance(el);
      } catch (err) { toast(errMsg(err), 'err'); check(); }
    };
  }

  /* ================= PARTNERS & CAPITAL ================= */
  const PT = { additional_capital: 'Additional capital contribution', initial_investment: 'Initial investment', capital_withdrawal: 'Capital withdrawal', profit_withdrawal: 'Profit withdrawal' };
  async function viewCapital(el) {
    const rs = await Promise.all([
      sb.from('v_partner_summary').select('*').order('name'),
      sb.from('v_payment_methods').select('id,name').order('name'),
      sb.from('partners').select('id,name').eq('is_active', true).order('name'),
      sb.from('partner_transactions').select('id,txn_date,kind,amount,reference,reason,partners(name),financial_accounts(name)').order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(200)
    ]);
    chk(rs);
    const [ps, acc, partners, tx] = rs.map(r => r.data);
    const canAdd = has('owner', 'accountant');
    el.innerHTML = `<div class="bar"><h2>Partners & Capital</h2></div>
    <div class="hint">Capital contributions are not revenue. Profit does not increase the investment. Capital withdrawals and profit withdrawals are separate and are never expenses.</div>
    <h3 class="sec">Partner equity</h3>
    ${table(['Partner', 'Profit share', 'Initial investment', 'Additional capital', 'Capital withdrawn', 'Profit entitlement', 'Profit withdrawn', 'Equity'],
      ps.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${num(x.profit_pct)}%</td><td>${money(x.initial_investment)}</td><td>${money(x.additional_capital)}</td><td>${money(x.capital_withdrawn)}</td><td>${money(x.profit_share)}</td><td>${money(x.profit_withdrawn)}</td><td><b>${money(x.partner_equity)}</b></td></tr>`), 'No partners configured.')}
    ${canAdd ? `<div class="box"><h3 style="margin:0 0 6px">Record partner transaction</h3><form id="cf">
      <label>Transaction type<select name="kind">${Object.entries(PT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <div class="row2"><label>Partner<select name="partner">${opts(partners)}</select></label>${fld('amount', 'Amount', 0, 'required')}</div>
      <div class="row2"><label>Date<input name="date" type="date" value="${today()}" required></label><label>Account<select name="account">${opts(acc)}</select></label></div>
      <div class="row2"><label>Reference<input name="reference"></label><label>Reason / notes<input name="reason"></label></div>
      <button class="btn go" style="width:100%">Save transaction</button></form></div>` : ''}
    <h3 class="sec">Transaction history</h3>
    ${table(['Date', 'Partner', 'Type', 'Amount', 'Account', 'Reference', 'Reason', ''], tx.map(t => `<tr><td>${esc(t.txn_date)}</td><td>${esc(t.partners?.name || '')}</td><td>${esc(PT[t.kind] || t.kind)}</td><td><b>${money(t.amount)}</b></td><td>${esc(t.financial_accounts?.name || '')}</td><td>${esc(t.reference || '')}</td><td>${esc(t.reason || '')}</td><td>${has('owner') ? `<button class="btn sm ghost" data-rv="${t.id}">Reverse</button>` : ''}</td></tr>`), 'No partner transactions yet.')}`;
    el.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => {
      const t = tx.find(r => r.id === b.dataset.rv);
      confirmReason('Reverse partner entry', `Reverse this ${esc(PT[t.kind] || t.kind)} of ${money(t.amount)}? The account balance is corrected. Use this only to fix a wrongly recorded entry.`,
        r => sb.rpc('void_partner_txn', { p_txn: t.id, p_reason: r }), () => viewCapital(el));
    });
    const f = $('#cf', el); if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault(); const b = f.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(f);
        const { error } = await sb.rpc('record_partner_txn', { p_partner: fd.get('partner'), p_kind: fd.get('kind'), p_amount: N(fd.get('amount')), p_account: fd.get('account'), p_date: fd.get('date'), p_ref: fd.get('reference') || null, p_reason: fd.get('reason') || null, p_notes: null });
        if (error) throw error; toast('Transaction recorded.'); await viewCapital(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= INVENTORY CONTROL ================= */
  const MV = { purchase_receipt: 'Purchase receipt', sale: 'Retailer sale', facebook_ship: 'Facebook shipment', facebook_return: 'Facebook return', loss: 'Damage / loss', adjustment_in: 'Stock adjustment (increase)' };
  async function viewInventory(el) {
    const canAct = has('owner', 'warehouse');
    const rs = await Promise.all([
      sb.from('products').select('id,name,unit,qty_on_hand,avg_cost').eq('is_active', true).order('name'),
      sb.from('stock_losses').select('id,loss_date,qty,unit_cost,total_cost,reason,notes,products(name)').order('loss_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      sb.from('inventory_movements').select('id,movement_date,movement_type,qty_change,unit_cost,qty_after,note,product_id,products(name)').order('created_at', { ascending: false }).limit(150)
    ]);
    chk(rs);
    const [prod, loss, mv] = rs.map(r => r.data);
    const popt = prod.map(p => `<option value="${p.id}">${esc(p.name)} — ${num(p.qty_on_hand)} ${esc(p.unit)}</option>`).join('');
    el.innerHTML = `<div class="bar"><h2>Inventory Control</h2></div>
    <div class="hint">Stock never changes silently. Every change is recorded with quantity, cost, reason, date and user. Damage and loss reduce stock and appear as a business loss.</div>
    ${canAct && prod.length ? `<div class="box"><h3 style="margin:0 0 6px">Record damage / loss</h3><form id="lf">
      <label>Product<select name="product" class="ss" required><option value="">— Select product —</option>${popt}</select></label>
      <div class="row2">${fld('qty', 'Quantity lost', 0, 'required')}<label>Reason<select name="reason">${['damage', 'expired', 'broken', 'lost', 'theft', 'other'].map(r => `<option value="${r}">${label(r)}</option>`).join('')}</select></label></div>
      <div class="row2"><label>Date<input name="date" type="date" value="${today()}"></label><label>Notes<input name="notes"></label></div>
      <button class="btn go" style="width:100%">Record loss</button></form></div>
    <div class="box"><h3 style="margin:0 0 6px">Increase stock (adjustment)</h3><p class="mut">Use only for verified stock found or opening stock. Normal stock arrives through Purchases.</p><form id="af">
      <label>Product<select name="product" class="ss" required><option value="">— Select product —</option>${popt}</select></label>
      <div class="row2">${fld('qty', 'Quantity to add', 0, 'required')}${fld('cost', 'Unit cost', 0, 'required')}</div>
      <div class="row2"><label>Date<input name="date" type="date" value="${today()}"></label><label>Notes<input name="notes" required placeholder="Reason for adjustment"></label></div>
      <button class="btn go" style="width:100%">Save adjustment</button></form></div>` : (canAct ? '<div class="hint">Add products first.</div>' : '')}
    <h3 class="sec">Damage / loss history</h3>
    ${table(['Date', 'Product', 'Reason', 'Quantity', 'Unit cost', 'Loss value', 'Notes'], loss.map(l => `<tr><td>${esc(l.loss_date)}</td><td>${esc(l.products?.name || '')}</td><td>${esc(label(l.reason))}</td><td>${num(l.qty)}</td><td>${money(l.unit_cost)}</td><td><b>${money(l.total_cost)}</b></td><td>${esc(l.notes || '')}</td></tr>`), 'No losses recorded.')}
    <h3 class="sec">Stock movement history</h3>
    <label style="max-width:320px">Filter by product<select id="mvf" class="ss"><option value="">All products</option>${prod.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
    <div id="mvt"></div>`;
    const drawMv = () => {
      const f = $('#mvf', el).value, rows = mv.filter(m => !f || m.product_id === f);
      $('#mvt', el).innerHTML = table(['Date', 'Product', 'Type', 'Change', 'Unit cost', 'Balance after', 'Reference'],
        rows.map(m => `<tr><td>${esc(m.movement_date)}</td><td>${esc(m.products?.name || '')}</td><td>${esc(MV[m.movement_type] || label(m.movement_type))}</td><td><b>${N(m.qty_change) > 0 ? '+' : ''}${num(m.qty_change)}</b></td><td>${money(m.unit_cost)}</td><td>${num(m.qty_after)}</td><td>${esc(m.note || '')}</td></tr>`), 'No stock movements yet.');
    };
    $('#mvf', el).onchange = drawMv; drawMv();
    const lf = $('#lf', el), af = $('#af', el);
    if (lf) lf.onsubmit = async e => {
      e.preventDefault(); const b = lf.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(lf);
        const { error } = await sb.rpc('record_stock_loss', { p_product: fd.get('product'), p_qty: N(fd.get('qty')), p_reason: fd.get('reason'), p_date: fd.get('date'), p_notes: fd.get('notes') || null });
        if (error) throw error; toast('Loss recorded. Stock reduced.'); await viewInventory(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
    if (af) af.onsubmit = async e => {
      e.preventDefault(); const b = af.querySelector('.go'); b.disabled = true;
      try {
        const fd = new FormData(af);
        const { error } = await sb.rpc('adjust_stock_up', { p_product: fd.get('product'), p_qty: N(fd.get('qty')), p_unit_cost: N(fd.get('cost')), p_date: fd.get('date'), p_notes: fd.get('notes') });
        if (error) throw error; toast('Stock adjustment saved.'); await viewInventory(el);
      } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
    };
  }

  /* ================= AUDIT LOG ================= */
  async function viewAudit(el) {
    const rs = await Promise.all([
      sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('profiles').select('id,full_name')
    ]);
    chk(rs);
    const [logs, pf] = rs.map(r => r.data);
    const nm = Object.fromEntries(pf.map(p => [p.id, p.full_name]));
    const short = v => v ? esc(JSON.stringify(v).slice(0, 140)) : '';
    el.innerHTML = `<div class="bar"><h2>Audit Log</h2></div><p class="mut">The latest 300 recorded actions.</p>` +
      table(['Time', 'User', 'Role', 'Action', 'Module', 'Record', 'Before', 'After'],
        logs.map(l => `<tr><td>${esc(new Date(l.created_at).toLocaleString('en-GB'))}</td><td>${esc(nm[l.user_id] || '')}</td><td>${esc(l.role || '')}</td><td>${esc(l.action)}</td><td>${esc(l.module || '')}</td><td><small>${esc(String(l.record_id || '').slice(0, 13))}</small></td><td><small>${short(l.old_value)}</small></td><td><small>${short(l.new_value)}</small></td></tr>`), 'No activity recorded yet.');
  }

  /* ================= SETTINGS ================= */
  async function viewSettings(el) {
    const SECTIONS = {
      couriers: () => listView($('#sec', el), {
        title: 'Couriers', table: 'couriers', canEdit: true, newTitle: 'New courier', editTitle: 'Edit courier', empty: 'No couriers yet.', searchKeys: ['name', 'phone'],
        fields: [{ key: 'name', label: 'Courier name', req: true }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'is_active', label: 'Active', type: 'check' }],
        cols: [{ h: 'Name', f: x => `<b>${esc(x.name)}</b>` }, { h: 'Phone', f: x => esc(x.phone || '—') }, { h: 'Status', f: x => x.is_active ? 'Active' : 'Inactive' }],
        load: async () => { const { data, error } = await sb.from('couriers').select('*').order('name'); if (error) throw error; return data; }
      }),
      banners: () => listView($('#sec', el), {
        title: 'Website banners', table: 'site_banners', canEdit: true, newTitle: 'New banner', editTitle: 'Edit banner', empty: 'No banners yet. The website shows a default banner until you add one.', searchKeys: ['title'],
        note: 'Banners rotate automatically on the website home page and can be swiped. Use a wide photo (about 1200 × 500). Title and text are optional. A lower order number shows first.',
        fields: [{ key: 'image_url', label: 'Banner image', type: 'image' }, { key: 'title', label: 'Title (optional)' }, { key: 'subtitle', label: 'Text under the title (optional)' }, { key: 'link_url', label: 'Link when tapped (optional, e.g. #/p/… or https://…)' }, { key: 'sort_order', label: 'Order (1 = first)', type: 'number' }, { key: 'is_active', label: 'Show on the website', type: 'check' }],
        cols: [{ h: '', f: x => x.image_url ? `<img src="${esc(x.image_url)}" alt="" style="width:80px;height:34px;object-fit:cover;border-radius:6px">` : '' }, { h: 'Title', f: x => esc(x.title || '—') }, { h: 'Order', f: x => num(x.sort_order) }, { h: 'Status', f: x => x.is_active ? 'Shown' : 'Hidden' }],
        validate: p => { if (!p.image_url) throw new Error('Please add a banner image.'); },
        load: async () => { const { data, error } = await sb.from('site_banners').select('*').order('sort_order'); if (error) throw error; return data; }
      }),
      productcats: () => listView($('#sec', el), {
        title: 'Product categories', table: 'categories', canEdit: true, newTitle: 'New product category', editTitle: 'Edit product category', empty: 'No categories.', searchKeys: ['name'],
        note: 'These appear in the product form and in the Category filter of purchases and sales. Deactivate a category instead of deleting it.',
        fields: [{ key: 'name', label: 'Category name', req: true }, { key: 'is_active', label: 'Active', type: 'check' }],
        cols: [{ h: 'Name', f: x => `<b>${esc(x.name)}</b>` }, { h: 'Status', f: x => x.is_active ? 'Active' : 'Inactive' }],
        load: async () => { const { data, error } = await sb.from('categories').select('*').order('name'); if (error) throw error; return data; }
      }),
      categories: () => listView($('#sec', el), {
        title: 'Expense categories', table: 'expense_categories', canEdit: true, newTitle: 'New category', editTitle: 'Edit category', empty: 'No categories.', searchKeys: ['name'],
        fields: [{ key: 'name', label: 'Category name', req: true }, { key: 'is_active', label: 'Active', type: 'check' }],
        cols: [{ h: 'Name', f: x => `<b>${esc(x.name)}</b>${x.is_retailer_delivery ? ' <span class="badge">Retailer delivery</span>' : ''}` }, { h: 'Status', f: x => x.is_active ? 'Active' : 'Inactive' }],
        load: async () => { const { data, error } = await sb.from('expense_categories').select('*').order('name'); if (error) throw error; return data; }
      }),
      accounts: () => listView($('#sec', el), {
        title: 'Payment accounts & methods', table: 'financial_accounts', canEdit: true, newTitle: 'New account', editTitle: 'Edit account', empty: 'No accounts.', searchKeys: ['name'],
        note: 'Every payment method is an account with its own balance. Deactivate an account instead of deleting it.',
        fields: [{ key: 'name', label: 'Account name', req: true }, { key: 'kind', label: 'Type', type: 'select', def: 'mfs', options: [['cash', 'Cash'], ['bank', 'Bank'], ['mfs', 'Mobile wallet']] }, { key: 'is_active', label: 'Active', type: 'check' }],
        cols: [{ h: 'Name', f: x => `<b>${esc(x.name)}</b>` }, { h: 'Type', f: x => esc(label(x.kind)) }, { h: 'Status', f: x => x.is_active ? 'Active' : 'Inactive' }],
        load: async () => { const { data, error } = await sb.from('financial_accounts').select('*').order('name'); if (error) throw error; return data; }
      }),
      partners: async () => {
        const { data: pp } = await sb.from('partners').select('profit_pct,ownership_pct').eq('is_active', true);
        const sp = (pp || []).reduce((s, x) => s + N(x.profit_pct), 0), so = (pp || []).reduce((s, x) => s + N(x.ownership_pct), 0);
        const warn = (Math.abs(sp - 100) > 0.001 || Math.abs(so - 100) > 0.001) ? `<b style="color:#c62828">⚠ Active partners’ profit shares total ${num(sp)}% and ownership totals ${num(so)}%. Both should be exactly 100%.</b>` : `Profit shares total ${num(sp)}% and ownership totals ${num(so)}% — correct.`;
        return listView($('#sec', el), {
        title: 'Partners', table: 'partners', canEdit: true, newTitle: 'New partner', editTitle: 'Edit partner', empty: 'No partners.', searchKeys: ['name'],
        note: warn,
        fields: [{ key: 'name', label: 'Partner name', req: true }, { key: 'ownership_pct', label: 'Ownership %', type: 'number' }, { key: 'profit_pct', label: 'Profit share %', type: 'number' }, { key: 'is_active', label: 'Active', type: 'check' }],
        cols: [{ h: 'Name', f: x => `<b>${esc(x.name)}</b>` }, { h: 'Ownership', f: x => num(x.ownership_pct) + '%' }, { h: 'Profit share', f: x => num(x.profit_pct) + '%' }, { h: 'Status', f: x => x.is_active ? 'Active' : 'Inactive' }],
        load: async () => { const { data, error } = await sb.from('partners').select('*').order('name'); if (error) throw error; return data; }
        });
      },
      shop: async () => {
        const { data } = await sb.from('settings').select('value').eq('key', 'shop').maybeSingle();
        const on = !!(data?.value && data.value.show_stock);
        $('#sec', el).innerHTML = `<div class="bar"><h2>Website options</h2></div><p class="mut">Customers can always add products to the cart and order them, whether or not there is stock. This option only controls whether the website shows “In stock / Out of stock”.</p><form id="sf" class="box"><label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="show_stock" ${on ? 'checked' : ''} style="width:auto"> Show product stock availability (In stock / Out of stock) on the website</label><button class="btn" style="width:100%;margin-top:10px">Save</button></form>`;
        $('#sf', el).onsubmit = async e => {
          e.preventDefault(); const value = { show_stock: !!new FormData(e.target).get('show_stock') };
          const { error } = await sb.from('settings').upsert({ key: 'shop', value }); if (error) return toast(errMsg(error), 'err');
          toast('Website options saved.');
        };
      },
      business: async () => {
        const { data } = await sb.from('settings').select('value').eq('key', 'business').maybeSingle();
        const b = data?.value || {};
        const K = [['name', 'Business name'], ['subtitle', 'Subtitle'], ['founder', 'Founder name'], ['founder_title', 'Founder title'], ['address', 'Address'], ['phone', 'Phone'], ['tagline', 'Product line (shown under the address on estimates)']];
        $('#sec', el).innerHTML = `<div class="bar"><h2>Business information</h2></div><p class="mut">Shown on every invoice.</p><form id="bf" class="box">${K.map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(b[k] || '')}"></label>`).join('')}<button class="btn" style="width:100%">Save</button></form>`;
        $('#bf', el).onsubmit = async e => {
          e.preventDefault(); const fd = new FormData(e.target);
          const value = Object.fromEntries(K.map(([k]) => [k, fd.get(k)]));
          const { error } = await sb.from('settings').upsert({ key: 'business', value }); if (error) return toast(errMsg(error), 'err');
          toast('Business information saved.');
        };
      }
    };
    const T = [['business', 'Business info'], ['couriers', 'Couriers'], ['banners', 'Website banners'], ['shop', 'Website options'], ['productcats', 'Product categories'], ['categories', 'Expense categories'], ['accounts', 'Payment accounts'], ['partners', 'Partners']];
    el.innerHTML = `<div class="bar"><h2>Settings</h2></div><div class="btnrow">${T.map(([k, l]) => `<button class="btn ghost sm" data-s="${k}">${l}</button>`).join('')}</div><div id="sec">${LOADING}</div>`;
    const open = k => { el.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === k)); SECTIONS[k](); };
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => open(b.dataset.s));
    open('business');
  }

  return { viewFacebook, viewExpenses, viewFinance, viewCapital, viewInventory, viewAudit, viewSettings };
}

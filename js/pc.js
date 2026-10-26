// Partner Cash: how much business cash each partner holds, opening cash, adjustments, hand-overs,
// bank deposits, the switch that turns partner-wise tracking on, and the partner cash ledger.
// All figures come from the database (views v_partner_cash / v_funds and RPCs). Nothing is calculated here
// except display totals.
export function initPc(h) {
  const { sb, $, esc, money, N, today, toast, errMsg, has, modal, opts, LOADING } = h;
  const canMove = () => has('owner', 'accountant');
  const when = d => d ? String(d).slice(0, 10) : '';
  const card = (l, v, cls = '', sub = '') => `<div class="card ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const KIND = { bank: 'Bank', mfs: 'Mobile banking', cash: 'Cash' };

  async function viewPartnerCash(el) {
    el.innerHTML = LOADING;
    const st = await sb.rpc('pc_status');
    if (st.error) {
      el.innerHTML = `<div class="bar"><h2>Partner Cash</h2></div><div class="hint"><b>The Partner Cash database update is not installed yet.</b><br>Run the file <b>partner_cash_migration.sql</b> once in Supabase → SQL Editor, then reload this page. Nothing in the app changes until you do that and switch tracking on here.</div>`;
      return;
    }
    const status = st.data || {};
    const [pcR, fundsR, adjR] = await Promise.all([
      sb.from('v_partner_cash').select('*').order('name'),
      sb.from('v_funds').select('*').eq('is_active', true).order('name'),
      sb.from('cash_adjustments').select('id,kind,amount,adj_date,reason,created_at,partners(name)').order('created_at', { ascending: false }).limit(50)
    ]);
    if (pcR.error || fundsR.error) { el.innerHTML = `<p class="err">${esc(errMsg(pcR.error || fundsR.error))}</p>`; return; }
    const pc = pcR.data || [], funds = fundsR.data || [], adj = adjR.data || [];
    const hasOpening = Object.fromEntries(adj.filter(a => a.kind === 'opening').map(a => [a.partners?.name, true]));
    const owner = has('owner');

    const partnerFund = Object.fromEntries(funds.filter(f => f.is_partner_cash).map(f => [f.partner_id, f]));
    const totalWith = pc.reduce((s, x) => s + N(x.balance), 0);
    const others = funds.filter(f => !f.is_partner_cash);
    const bank = others.filter(f => f.kind === 'bank'), mfs = others.filter(f => f.kind === 'mfs'), oldCash = others.filter(f => f.kind === 'cash');
    const sum = a => a.reduce((s, x) => s + N(x.balance), 0);
    const totalFunds = totalWith + sum(others);

    const switchBox = status.enabled
      ? `<div class="hint" style="background:#eef7ec;color:#1b5e20"><b>Partner-wise tracking is ON</b>${status.start_date ? ` since ${esc(when(status.start_date))}` : ''}. Purchases, sales and expenses now ask which partner paid or received the money. Earlier transactions stay unchanged.${owner ? ` <button class="link" id="pc-off">Switch off</button>` : ''}</div>`
      : `<div class="hint"><b>Partner-wise tracking is OFF.</b> The app works exactly as before. To start: (1) enter each partner’s opening cash, (2) press “Switch on”. Old transactions are never assigned to a partner by guessing — tracking starts from the date you choose.
        <div style="margin-top:8px">${pc.map(x => `<div>${hasOpening[x.name] ? '✓' : '○'} ${esc(x.name)} — opening cash ${hasOpening[x.name] ? 'set' : 'not set'}</div>`).join('')}</div>
        ${owner ? `<div class="row2" style="margin-top:10px"><button class="btn ghost" id="pc-open">Set opening cash</button><button class="btn" id="pc-on">Switch on</button></div>` : '<small>Only the owner can switch this on.</small>'}</div>`;

    const partnerCards = pc.map(x => `<div class="box" style="margin:10px 0">
      <h3 style="margin:0 0 6px">${esc(x.name)} — business cash in hand</h3>
      <div class="grid">${card('Cash balance now', `<span class="${N(x.balance) < 0 ? 'err' : ''}">${money(x.balance)}</span>`)}
        ${card('Opening cash', money(x.opening_cash))}${card('Cash received', money(x.cash_received), '', 'from sales / payments')}
        ${card('Paid for business', money(x.cash_paid), '', 'purchases, expenses')}
        ${card('Transferred in', money(x.transfers_in))}${card('Transferred out', money(x.transfers_out), '', 'hand-over / bank deposit')}
        ${card('Adjustments', money(x.adjustments))}${N(x.partner_entries) !== 0 ? card('Capital / withdrawals', money(x.partner_entries)) : ''}</div>
      <small>Balance = opening cash + cash received − cash paid ± transfers ± adjustments. This is business money held by ${esc(x.name)}, not personal income.</small>
      ${canMove() ? `<div class="row2" style="margin-top:8px"><button class="btn ghost sm" data-adj="${x.partner_id}">Adjust cash</button><button class="btn ghost sm" data-mv="${x.account_id}">Hand over / deposit</button></div>` : ''}
      ${owner && !hasOpening[x.name] ? `<button class="btn ghost sm" style="margin-top:8px" data-open="${x.partner_id}">Set opening cash</button>` : ''}</div>`).join('');

    const fundsHtml = `<div class="grid">
      ${pc.map(x => card(`${esc(x.name)} Cash`, money(x.balance))).join('')}
      ${card('Total Cash with Partners', money(totalWith), 'strong')}
      ${card('Bank Balance', money(sum(bank)), '', bank.length > 1 ? bank.map(b => `${esc(b.name)} ${money(b.balance)}`).join(' · ') : '')}
      ${mfs.map(m => card(esc(m.name), money(m.balance))).join('')}
      ${oldCash.length ? card('Old cash account', money(sum(oldCash)), '', 'before partner tracking — move it to a partner with “Hand over”') : ''}
      ${card('Total Business Funds', money(totalFunds), 'strong', 'partners’ cash + bank + mobile banking')}</div>`;

    el.innerHTML = `<div class="bar"><h2>Partner Cash</h2><button class="btn ghost sm" id="rf2">Refresh</button></div>
      ${switchBox}
      <h3 class="sec">Business funds</h3>${fundsHtml}
      <h3 class="sec">Cash with each partner</h3>${partnerCards || '<p class="empty">No partners found.</p>'}
      <h3 class="sec">Opening cash &amp; adjustments</h3>${adj.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Partner</th><th>Type</th><th>Amount</th><th>Reason</th><th>Recorded</th></tr></thead><tbody>${adj.map(a =>
        `<tr><td>${esc(when(a.adj_date))}</td><td>${esc(a.partners?.name || '')}</td><td>${a.kind === 'opening' ? 'Opening cash' : a.kind === 'increase' ? 'Increase' : 'Decrease'}</td><td><b>${money(a.amount)}</b></td><td>${esc(a.reason)}</td><td>${esc(new Date(a.created_at).toLocaleString('en-GB'))}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">No opening cash or adjustments yet.</p>'}
      <h3 class="sec">Partner cash ledger</h3>
      <form class="box" id="lf"><div class="row2"><label>From<input name="from" type="date"></label><label>To<input name="to" type="date" value="${today()}"></label></div>
        <div class="row2"><label>Partner<select name="partner"><option value="">All partners</option>${pc.map(x => `<option value="${x.partner_id}">${esc(x.name)}</option>`).join('')}</select></label>
          <label>Type<select name="txn_type"><option value="">All types</option><option value="purchase">Purchase payments</option><option value="sale">Sale receipts</option><option value="expense">Expenses</option><option value="transfer">Transfers</option><option value="adjustment">Opening / adjustments</option><option value="capital">Partner capital</option></select></label></div>
        <div class="row2"><label>Payment medium<select name="medium"><option value="">All</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="mfs">Mobile banking</option></select></label>
          <label>Account<select name="account"><option value="">All accounts</option>${funds.map(f => `<option value="${f.account_id}">${esc(f.name)}</option>`).join('')}</select></label></div>
        <button class="btn" style="width:100%">Show</button></form><div id="lg"></div>`;

    $('#rf2', el).onclick = () => viewPartnerCash(el);
    const refresh = () => viewPartnerCash(el);
    const partnerOpts = pc.map(x => `<option value="${x.partner_id}">${esc(x.name)}</option>`).join('');

    const openCash = pid => modal('Set opening cash', `<label>Partner<select name="partner">${partnerOpts}</select></label>
      <label>Cash in hand (৳)<input name="amount" type="number" step="any" min="0" inputmode="decimal" required></label>
      <label>As of date<input name="date" type="date" value="${today()}" required></label><label>Note<input name="reason" placeholder="e.g. counted on the day we started"></label>
      <small>Opening cash can be set once per partner. Later corrections are made with “Adjust cash”.</small>`,
      async fd => { const { error } = await sb.rpc('pc_set_opening', { p_partner: fd.get('partner'), p_amount: N(fd.get('amount')), p_date: fd.get('date'), p_reason: fd.get('reason') || null }); if (error) throw error; toast('Opening cash saved.'); refresh(); }, 'Save');
    if (pid) setTimeout(() => { const s = document.querySelector('.sheet select[name=partner]'); if (s) s.value = pid; }, 0);
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openCash(b.dataset.open));
    const ob = $('#pc-open', el); if (ob) ob.onclick = () => openCash();

    const on = $('#pc-on', el);
    if (on) on.onclick = () => modal('Switch on partner-wise tracking',
      `<p>From the start date, every purchase, sale and expense must say which partner paid or received the money. Cash payments reduce the partner’s cash and cannot exceed the cash he holds. Earlier transactions are not changed.</p>
       <label>Tracking starts on<input name="date" type="date" value="${today()}" required></label>`,
      async fd => { const { error } = await sb.rpc('pc_activate', { p_start: fd.get('date') }); if (error) throw error; toast('Partner-wise tracking is on.'); refresh(); }, 'Switch on');
    const off = $('#pc-off', el);
    if (off) off.onclick = () => modal('Switch off partner-wise tracking', '<p>Forms go back to a single “paid from” account. Nothing already recorded is changed. You can switch it on again later.</p>',
      async () => { const { error } = await sb.rpc('pc_deactivate'); if (error) throw error; toast('Partner-wise tracking is off.'); refresh(); }, 'Switch off');

    el.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => modal('Adjust partner cash',
      `<label>Partner<select name="partner">${partnerOpts}</select></label>
       <label>Change<select name="dir"><option value="increase">Increase (cash found / correction up)</option><option value="decrease">Decrease (cash missing / correction down)</option></select></label>
       <label>Amount (৳)<input name="amount" type="number" step="any" min="0" inputmode="decimal" required></label>
       <label>Date<input name="date" type="date" value="${today()}" required></label>
       <label>Reason (required)<input name="reason" required minlength="3" placeholder="e.g. recount found ৳500 less"></label>
       <small>The reason, date and your name are saved in the adjustment list and the Audit Log.</small>`,
      async fd => { const { error } = await sb.rpc('pc_adjust', { p_partner: fd.get('partner'), p_direction: fd.get('dir'), p_amount: N(fd.get('amount')), p_date: fd.get('date'), p_reason: fd.get('reason') }); if (error) throw error; toast('Cash adjusted.'); refresh(); }, 'Save adjustment'));
    el.querySelectorAll('[data-adj]').forEach(b => { const orig = b.onclick; b.onclick = () => { orig(); setTimeout(() => { const s = document.querySelector('.sheet select[name=partner]'); if (s) s.value = b.dataset.adj; }, 0); }; });

    el.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
      const acc = funds.map(f => `<option value="${f.account_id}">${esc(f.name)} (${esc(KIND[f.kind] || f.kind)}) — ${money(f.balance)}</option>`).join('');
      modal('Hand over / deposit / withdraw', `<p>Moves business money between two accounts. This is an internal transfer — it is <b>not</b> income or expense.</p>
        <label>From<select name="from">${acc}</select></label><label>To<select name="to">${acc}</select></label>
        <label>Amount (৳)<input name="amount" type="number" step="any" min="0" inputmode="decimal" required></label>
        <label>Date<input name="date" type="date" value="${today()}" required></label><label>Note<input name="note" placeholder="e.g. deposited at Sonali Bank"></label>`,
        async fd => { if (fd.get('from') === fd.get('to')) throw new Error('Choose two different accounts.'); const { error } = await sb.rpc('transfer_funds', { p_from: fd.get('from'), p_to: fd.get('to'), p_amount: N(fd.get('amount')), p_date: fd.get('date'), p_note: fd.get('note') || null }); if (error) throw error; toast('Transfer recorded.'); refresh(); }, 'Transfer');
      setTimeout(() => { const s = document.querySelector('.sheet select[name=from]'); if (s) s.value = b.dataset.mv; }, 0);
    });

    const lf = $('#lf', el), lg = $('#lg', el);
    const draw = async () => {
      lg.innerHTML = LOADING;
      const fd = new FormData(lf), q = {};
      ['from', 'to', 'partner', 'txn_type', 'medium', 'account'].forEach(k => { if (fd.get(k)) q[k] = fd.get(k); });
      const { data, error } = await sb.rpc('report_data', { p_report: 'partner_cash', p: q });
      if (error) { lg.innerHTML = `<p class="err">${esc(errMsg(error))}</p>`; return; }
      const rows = data || [];
      const inn = rows.reduce((s, r) => s + N(r.received), 0), out = rows.reduce((s, r) => s + N(r.paid), 0);
      lg.innerHTML = rows.length ? `<div class="hint">${rows.length} entries · money in ${money(inn)} · money out ${money(out)}</div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Partner</th><th>Medium</th><th>Type</th><th>In</th><th>Out</th><th>Details</th></tr></thead><tbody>${rows.map(r =>
        `<tr><td>${esc(r.date)}</td><td>${esc(r.partner)}</td><td>${esc(r.medium)}</td><td>${esc(r.type)}</td><td>${r.received != null ? money(r.received) : ''}</td><td>${r.paid != null ? money(r.paid) : ''}</td><td>${esc(r.details || '')}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">No partner entries for this filter.</p>';
    };
    lf.onsubmit = e => { e.preventDefault(); draw(); };
    draw();
  }
  return { viewPartnerCash };
}

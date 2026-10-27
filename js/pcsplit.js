// Partner-wise payment lines (Partner Cash Tracking) for Purchases, Sales and Expenses.
// A transaction can be paid / received by several partners, each with his own amount and medium.
// The database does all the accounting; this file only collects the lines and warns when they do not
// add up to the actual payment. If the feature is not switched on (or the SQL is not installed yet),
// getPc() says "disabled" and every screen keeps working exactly as before.
const N = v => Number(v || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = n => Math.round(N(n) * 100) / 100;

export async function getPc(sb) {
  try {
    const [s, a] = await Promise.all([sb.rpc('pc_status'), sb.from('v_payment_methods').select('id,name,kind').order('name')]);
    const st = s.data;
    if (s.error || !st || !st.enabled || !(st.partners || []).length) return { enabled: false };
    return { enabled: true, partners: st.partners, accounts: (a.data || []).filter(x => x.kind !== 'cash') };
  } catch (_) { return { enabled: false }; }
}

/* select : the old single "paid from / payment method" <select>; it is hidden while partner lines are used
   dir    : 'paid' | 'received'
   getTotal() : the actual money that moves now (the partner lines must add up to exactly this)            */
export function bindPc(pc, form, { select, dir, getTotal, title }) {
  if (!pc || !pc.enabled || !select) return { active: false, edit() { }, read: () => ({ lines: [] }) };
  const old = select.closest('label') || select;
  const box = document.createElement('div');
  box.className = 'pcs';
  const word = dir === 'received' ? 'Received by' : 'Paid by';
  box.innerHTML = `<div class="pcs-h">${esc(title || word)} <small>— medium · amount (partner only for cash)</small></div><div class="pcs-rows"></div>
    <button type="button" class="btn ghost sm pcs-add">+ Add another partner</button><div class="pcs-sum"></div>`;
  old.insertAdjacentElement('afterend', box);
  old.style.display = 'none'; select.required = false;
  const rows = box.querySelector('.pcs-rows'), sum = box.querySelector('.pcs-sum');
  let editing = false;

  const rowHtml = () => `<div class="pcs-row">
    <select class="pcs-m" aria-label="Medium"><option value="cash">Cash (partner’s own cash)</option>${pc.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
    <select class="pcs-p" aria-label="Which partner’s cash">${pc.partners.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
    <input class="pcs-a" type="number" step="any" min="0" inputmode="decimal" placeholder="Amount ৳" aria-label="Amount">
    <button type="button" class="btn ghost sm pcs-x" aria-label="Remove">✕</button></div>`;
  const lines = () => [...rows.querySelectorAll('.pcs-row')].map(r => ({
    partner_id: r.querySelector('.pcs-m').value === 'cash' ? r.querySelector('.pcs-p').value : '', medium: r.querySelector('.pcs-m').value, amount: r2(r.querySelector('.pcs-a').value), el: r }));
  const total = () => r2(getTotal());

  const refresh = () => {
    if (editing) return;
    rows.querySelectorAll('.pcs-row').forEach(r => { r.querySelector('.pcs-p').style.display = r.querySelector('.pcs-m').value === 'cash' ? '' : 'none'; });
    const t = total(), ls = lines();
    if (ls.length === 1 && !ls[0].el.dataset.touched) ls[0].el.querySelector('.pcs-a').value = t > 0 ? t : '';
    const s = r2(lines().reduce((a, l) => a + l.amount, 0)), diff = r2(t - s);
    box.classList.toggle('bad', t > 0 && Math.abs(diff) > 0.005);
    if (t <= 0) sum.innerHTML = '<span class="mut">Nothing is paid or received now, so no partner is needed.</span>';
    else if (Math.abs(diff) <= 0.005) sum.innerHTML = `<span class="ok">✓ Partner amounts match the payment (${money(t)}).</span>`;
    else sum.innerHTML = `<span class="err">⚠ Partner amounts total ${money(s)} but the payment is ${money(t)} — ${diff > 0 ? 'short by ' : 'over by '}${money(Math.abs(diff))}.</span>`;
  };
  const add = () => {
    const had = rows.children.length;
    rows.insertAdjacentHTML('beforeend', rowHtml());
    const r = rows.lastElementChild;
    if (had) { // a further partner starts with the amount that is still unassigned and the next partner in the list
      const s = r2(lines().slice(0, -1).reduce((a, l) => a + l.amount, 0));
      r.querySelector('.pcs-a').value = Math.max(0, r2(total() - s)) || '';
      r.dataset.touched = '1';
      const used = new Set(lines().slice(0, -1).filter(l => l.partner_id).map(l => l.partner_id)), next = pc.partners.find(p => !used.has(p.id));
      if (next) r.querySelector('.pcs-p').value = next.id;
    }
    refresh();
  };
  rows.addEventListener('input', e => { if (e.target.classList.contains('pcs-a')) e.target.closest('.pcs-row').dataset.touched = '1'; refresh(); });
  rows.addEventListener('change', refresh);
  rows.addEventListener('click', e => { const x = e.target.closest('.pcs-x'); if (x && rows.children.length > 1) { x.closest('.pcs-row').remove(); refresh(); } });
  box.querySelector('.pcs-add').onclick = add;
  form.addEventListener('input', refresh);
  add();

  return {
    active: true,
    // while an existing record is being edited the old single selector is used (payments are not re-split on edit)
    edit(on) { editing = !!on; box.style.display = on ? 'none' : ''; old.style.display = on ? '' : 'none'; select.required = false; },
    // -> { lines:[{partner_id,medium,amount}], error:string|null }
    read() {
      const t = total();
      if (t <= 0) return { lines: [], error: null };
      const ls = lines().filter(l => l.amount > 0);
      if (!ls.length) return { lines: [], error: 'Enter how the money was paid or received (cash with the partner, or an account).' };
      const s = r2(ls.reduce((a, l) => a + l.amount, 0));
      if (Math.abs(s - t) > 0.005) return { lines: [], error: `Partner amounts total ${money(s)} but the payment is ${money(t)}. They must match exactly.` };
      return { lines: ls.map(({ partner_id, medium, amount }) => ({ partner_id, medium, amount })), error: null };
    }
  };
}

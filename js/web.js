// Website Activity: new customer accounts and what visitors currently have in their carts.
export function initWeb(h) {
  const { sb, $, esc, money, num, toast, errMsg, LOADING } = h;
  const when = t => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const card = (l, v, cls = '') => `<div class="card ${cls}"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const table = (heads, rows, empty) => rows.length ? `<div class="tablewrap"><table><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="empty">${empty}</p>`;

  async function viewWebActivity(el) {
    const [a, c] = await Promise.all([sb.rpc('customer_stats'), sb.rpc('web_cart_overview')]);
    if (a.error) throw a.error; if (c.error) throw c.error;
    const s = a.data || {}, v = c.data || {};
    el.innerHTML = `<div class="bar"><h2>Website Activity</h2></div>
    <div class="hint">Customer accounts opened on your website and what visitors currently have in their carts. Carts are saved from the visitor’s phone a moment after every change and disappear when the order is placed or the cart is emptied. Visitors who are not logged in appear as “Guest visitor”.</div>
    <h3 class="sec">New customer accounts</h3><div class="grid">
      ${card('Total accounts', num(s.total), 'hi')}${card('Today', num(s.today))}${card('Last 7 days', num(s.last7))}${card('Last 30 days', num(s.last30))}</div>
    <h3 class="sec">Carts right now</h3><div class="grid">
      ${card('Open carts', num(v.open_carts), 'hi')}${card('Items in carts', num(v.items_in_carts))}${card('Value in carts', money(v.cart_value))}</div>
    <h3 class="sec">Products in carts</h3>
    ${table(['Product', 'Carts', 'Total quantity'], (v.by_product || []).map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${num(x.carts)}</td><td>${num(x.qty)}</td></tr>`), 'No products are in any cart right now.')}
    <h3 class="sec">Open carts</h3>
    ${table(['Visitor', 'What is in the cart', 'Value', 'Last change'], (v.carts || []).map(k => `<tr><td>${esc(k.who)}</td><td style="white-space:normal;min-width:220px">${(k.items || []).map(i => `${esc(i.name)} × ${num(i.qty)}`).join('<br>')}</td><td><b>${money((k.items || []).reduce((t, i) => t + Number(i.qty) * Number(i.price || 0), 0))}</b></td><td>${esc(when(k.updated_at))}</td></tr>`), 'No open carts.')}
    <h3 class="sec">Customer accounts (latest 50)</h3>
    ${table(['Name', 'Email', 'Mobile', 'Joined', 'Orders'], (s.recent || []).map(u => `<tr><td><b>${esc(u.name || '')}</b></td><td>${esc(u.email || '')}</td><td>${esc(u.phone || '—')}</td><td>${esc(when(u.created_at))}</td><td>${num(u.orders)}</td></tr>`), 'No customer accounts yet.')}`;
  }
  return { viewWebActivity };
}

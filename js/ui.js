// Global form behaviour: select-all on focus for numbers, no accidental mouse-wheel changes,
// and searchable dropdowns (any <select class="ss">, including ones added later).
let enhanceFn = null;

// Product -> category lookup used by the automatic Category filter.
const catData = { cats: [], map: {} };
export async function refreshCatData(sb) {
  try {
    const [c, p] = await Promise.all([
      sb.from('categories').select('id,name').eq('is_active', true).order('name'),
      sb.from('v_products_sales').select('id,category_id')
    ]);
    if (!c.error) catData.cats = c.data || [];
    if (!p.error) catData.map = Object.fromEntries((p.data || []).map(x => [x.id, x.category_id]));
  } catch (_) { /* the filter simply shows "All categories" if this cannot load */ }
}
export function setSelect(sel, value) {
  if (enhanceFn && sel.classList.contains('ss') && !sel.dataset.ss) enhanceFn(sel);   // not enhanced yet (just inserted)
  sel.value = value;
  sel.dispatchEvent(new Event('ss:sync'));
}

export function initUI() {
  /* ---- number inputs ---- */
  let justFocused = null;
  document.addEventListener('focusin', e => {
    const t = e.target;
    if (t && t.matches && t.matches('input[type=number]')) {
      justFocused = t;
      setTimeout(() => { try { t.select(); } catch (_) { } }, 0);
    }
  });
  document.addEventListener('mouseup', e => { if (justFocused && e.target === justFocused) e.preventDefault(); justFocused = null; });
  // Scrolling the mouse wheel must scroll the page, never change a number.
  document.addEventListener('wheel', () => {
    const a = document.activeElement;
    if (a && a.tagName === 'INPUT' && a.type === 'number') a.blur();
  }, { passive: true });

  /* ---- searchable select ---- */
  function enhance(sel) {
    if (sel.dataset.ss) return;
    sel.dataset.ss = '1';
    const wrap = document.createElement('div'); wrap.className = 'ss-wrap';
    if (sel.classList.contains('ss-hl')) wrap.classList.add('ss-hl');
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
    sel.classList.add('ss-native'); sel.tabIndex = -1;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'ss-in'; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-expanded', 'false');
    const list = document.createElement('div'); list.className = 'ss-list'; list.hidden = true; list.setAttribute('role', 'listbox');
    wrap.append(inp, list);
    const options = () => [...sel.options].filter(o => o.value !== '');
    inp.placeholder = ([...sel.options].find(o => o.value === '')?.text) || 'Search or select…';
    const shown = () => sel.selectedOptions[0] && sel.value !== '' ? sel.selectedOptions[0].text : '';
    inp.value = shown();
    let items = [], active = -1;

    const render = q => {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      items = options().filter(o => { const t = o.text.toLowerCase(); return words.every(w => t.includes(w)); }).slice(0, 150);
      active = items.findIndex(o => o.value === sel.value);
      list.innerHTML = items.length
        ? items.map((o, i) => `<div class="ss-opt${o.value === sel.value ? ' sel' : ''}${i === active ? ' act' : ''}" role="option" data-i="${i}"></div>`).join('')
        : '<div class="ss-none">No matches</div>';
      list.querySelectorAll('.ss-opt').forEach((d, i) => { d.textContent = items[i].text; });
    };
    const open = () => { render(inp.dataset.q || ''); list.hidden = false; inp.setAttribute('aria-expanded', 'true'); list.scrollIntoView({ block: 'nearest' }); const a = list.querySelector('.act'); if (a) a.scrollIntoView({ block: 'nearest' }); };
    const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.dataset.q = ''; };
    const choose = o => {
      sel.value = o ? o.value : '';
      inp.value = shown(); close();
      inp.classList.remove('ss-bad');
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const move = d => {
      if (list.hidden) return open();
      if (!items.length) return;
      active = (active + d + items.length) % items.length;
      list.querySelectorAll('.ss-opt').forEach((x, i) => x.classList.toggle('act', i === active));
      list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
    };

    inp.addEventListener('focus', () => { inp.select(); open(); });
    inp.addEventListener('click', () => { if (list.hidden) open(); });
    inp.addEventListener('input', e => { e.stopPropagation(); inp.dataset.q = inp.value; render(inp.value); list.hidden = false; active = items.length ? 0 : -1; list.querySelector('.ss-opt')?.classList.add('act'); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { if (!list.hidden) { e.preventDefault(); if (items[active]) choose(items[active]); } }
      else if (e.key === 'Escape') { inp.value = shown(); close(); }
    });
    inp.addEventListener('blur', () => {
      setTimeout(() => {
        if (inp.value.trim() === '' && sel.value !== '') choose(null);   // cleared by the user
        else inp.value = shown();                                          // revert unfinished typing
        close();
      }, 120);
    });
    list.addEventListener('mousedown', e => {
      e.preventDefault();
      const d = e.target.closest('.ss-opt'); if (d) choose(items[Number(d.dataset.i)]);
    });
    sel.addEventListener('invalid', () => { inp.classList.add('ss-bad'); inp.focus(); });
    sel.addEventListener('ss:sync', () => { inp.value = shown(); inp.disabled = sel.disabled; });
    document.addEventListener('mousedown', e => { if (!wrap.contains(e.target)) close(); });
  }

  enhanceFn = enhance;
  const scan = root => { if (root.matches?.('select.ss')) enhance(root); root.querySelectorAll?.('select.ss').forEach(enhance); };
  // ---- Category filter: wherever a product can be selected, a Category selector appears just before it ----
  const PRODUCT_SELECT = 'select.pid, select[name=product], select#mvf';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function applyCategory(sel, cat) {
    if (!sel._all) sel._all = [...sel.options].map(o => o.cloneNode(true));
    const cur = sel.value;
    const keep = o => o.value === '' || !cat || (cat === '__none' ? !catData.map[o.value] : catData.map[o.value] === cat);
    sel.innerHTML = '';
    sel._all.filter(keep).forEach(o => sel.appendChild(o.cloneNode(true)));
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
    setSelect(sel, sel.value);
    if (sel.value !== cur) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }   // filtered-out product was cleared
  }
  function addCategoryFilter(sel) {
    if (sel.dataset.catf) return;
    sel.dataset.catf = '1';
    const label = sel.closest('label'); if (!label || !label.parentNode) return;
    if (label.previousElementSibling?.classList.contains('catf')) return;
    label.insertAdjacentHTML('beforebegin', `<label class="catf">Category<select class="pcat ss"><option value="">All categories</option>${catData.cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="__none">No category</option></select></label>`);
    const cs = label.previousElementSibling.querySelector('select');
    cs.addEventListener('change', () => applyCategory(sel, cs.value));
  }
  const scanProducts = root => { if (root.matches?.(PRODUCT_SELECT)) addCategoryFilter(root); root.querySelectorAll?.(PRODUCT_SELECT).forEach(addCategoryFilter); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { scanProducts(n); scan(n); } }))).observe(document.body, { childList: true, subtree: true });
  scanProducts(document.body); scan(document.body);
}

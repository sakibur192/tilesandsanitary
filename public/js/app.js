// Baybex Tile ERP — shop app (part 1: shell, dashboard, POS, sales, products, stock, purchases)
const APP = { me: null, cache: {} };
const PAGES = {};
const can = p => APP.me && APP.me.user.perms.includes(p);
const S = () => APP.me.tenant.settings;
BX.onUnauthorized = () => { if (!APP._redirecting) { APP._redirecting = true; location.href = '/#login'; } };

APP.load = async (key, force) => {
  const urls = { accounts: '/api/accounts', categories: '/api/categories', brands: '/api/brands', expcats: '/api/expense-categories', products: '/api/products', roles: '/api/roles', branches: '/api/branches', employees: '/api/employees' };
  if (!force && APP.cache[key]) return APP.cache[key];
  APP.cache[key] = await BX.get(urls[key]);
  return APP.cache[key];
};
APP.drop = (...keys) => keys.forEach(k => delete APP.cache[k]);
const accOptions = (accs, sel) => accs.map(a => `<option value="${a.id}" ${String(a.id) === String(sel) ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
const cashId = accs => (accs.find(a => a.type === 'cash') || accs[0] || {}).id;

const MENU = () => [
  { g: L('প্রধান', 'Main') },
  { id: 'dashboard', ic: '🏠', t: L('ড্যাশবোর্ড', 'Dashboard'), p: 'dashboard' },
  { id: 'pos', ic: '🧾', t: L('বিক্রি করুন (POS)', 'New Sale (POS)'), p: 'pos' },
  { id: 'due', ic: '📒', t: L('বাকির হিসাব', 'Customer Due'), p: 'customers' },
  { id: 'cashbook', ic: '💵', t: L('দৈনিক ক্যাশবুক', 'Daily Cashbook'), p: 'cashbook' },
  { g: L('বিক্রি', 'Sales') },
  { id: 'sales', ic: '📄', t: L('বিক্রির তালিকা', 'Sales List'), p: 'sales' },
  { id: 'returns', ic: '↩️', t: L('বিক্রয় ফেরত', 'Sales Return'), p: 'sales' },
  { id: 'quotations', ic: '📝', t: L('কোটেশন / এস্টিমেট', 'Quotation / Estimate'), p: 'quotation' },
  { id: 'deliveries', ic: '🚚', t: L('ডেলিভারি', 'Delivery'), p: 'delivery' },
  { id: 'customers', ic: '👥', t: L('কাস্টমার', 'Customers'), p: 'customers' },
  { g: L('মালামাল', 'Inventory') },
  { id: 'products', ic: '📦', t: L('পণ্য', 'Products'), p: 'products' },
  { id: 'stock', ic: '🏬', t: L('স্টক', 'Stock'), p: 'stock' },
  { id: 'calculator', ic: '📐', t: L('টাইলস ক্যালকুলেটর', 'Tile Calculator'), p: null },
  { id: 'purchases', ic: '🛒', t: L('ক্রয় (পারচেজ)', 'Purchases'), p: 'purchase' },
  { id: 'suppliers', ic: '🏭', t: L('সাপ্লায়ার ও পাওনা', 'Suppliers & Payable'), p: 'suppliers' },
  { g: L('হিসাব', 'Accounts') },
  { id: 'expenses', ic: '💸', t: L('খরচ', 'Expenses'), p: 'expenses' },
  { id: 'accounts', ic: '🏦', t: L('ক্যাশ/বিকাশ/ব্যাংক', 'Cash/bKash/Bank'), p: 'accounts' },
  { id: 'reports', ic: '📊', t: L('রিপোর্ট ও লাভ-ক্ষতি', 'Reports & P/L'), p: 'reports' },
  { id: 'employees', ic: '🧑‍🔧', t: L('কর্মচারী', 'Employees'), p: 'employees' },
  { g: L('সেটিংস', 'Settings') },
  { id: 'settings', ic: '⚙️', t: L('দোকান সেটিংস', 'Shop Settings'), p: 'settings' },
  { id: 'users', ic: '🔐', t: L('ইউজার ও পারমিশন', 'Users & Permissions'), p: 'users' },
  { id: 'billing', ic: '💳', t: L('সাবস্ক্রিপশন', 'Subscription'), p: null },
];

async function boot() {
  try { APP.me = await BX.get('/api/me'); } catch (e) { return; }
  const st = S();
  if (!localStorage.getItem('bx_lang')) { BX.setLang(st.language || 'bn'); }
  if (!localStorage.getItem('bx_digits')) BX.setDigits(st.digits || BX.lang);
  if (APP.me.platform.primary_color) document.documentElement.style.setProperty('--pri', APP.me.platform.primary_color);
  BX.branch = APP.me.user.branch_id || localStorage.getItem('bx_branch_' + APP.me.tenant.id) || (APP.me.branches[0] || {}).id;
  if (!APP.me.branches.find(b => String(b.id) === String(BX.branch))) BX.branch = (APP.me.branches[0] || {}).id;
  shell();
  window.addEventListener('hashchange', route);
  route();
}

function shell() {
  const me = APP.me;
  document.documentElement.lang = BX.lang;
  $('#shopName').textContent = me.tenant.name;
  $('#brandName').textContent = me.platform.brand_name;
  $('#userName').textContent = me.user.name;
  $('#supportLink').textContent = '☎ ' + L('সাপোর্ট', 'Support') + ': ' + BX.dg(me.platform.support_phone || '');
  $('#supportLink').href = 'tel:' + (me.platform.support_phone || '');
  const items = MENU().filter(m => m.g || !m.p || can(m.p));
  $('#menu').innerHTML = items.filter((m, i) => !(m.g && (!items[i + 1] || items[i + 1].g))).map(m => m.g ? `<div class="grp">${m.g}</div>` : `<a href="#/${m.id}" data-id="${m.id}"><span class="ic">${m.ic}</span>${m.t}</a>`).join('');
  const bn = [['dashboard', '🏠', L('হোম', 'Home')], ['pos', '🧾', L('বিক্রি', 'Sell')], ['due', '📒', L('বাকি', 'Due')], ['cashbook', '💵', L('ক্যাশ', 'Cash')], ['menu', '☰', L('মেনু', 'Menu')]];
  $('#bottomNav').innerHTML = bn.filter(b => b[0] === 'menu' || items.find(m => m.id === b[0])).map(b => `<a href="${b[0] === 'menu' ? '#' : '#/' + b[0]}" data-id="${b[0]}"><span class="ic">${b[1]}</span>${b[2]}</a>`).join('');
  $('#bottomNav [data-id=menu]').onclick = e => { e.preventDefault(); toggleMenu(true); };
  const bs = $('#branchSel');
  if (me.branches.length > 1 && !me.user.branch_id) {
    bs.innerHTML = me.branches.map(b => `<option value="${b.id}" ${String(b.id) === String(BX.branch) ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
    bs.classList.remove('hidden');
    bs.onchange = () => { BX.branch = bs.value; localStorage.setItem('bx_branch_' + me.tenant.id, bs.value); APP.drop('products'); route(); };
  } else bs.classList.add('hidden');
  $$('.top .seg button').forEach(b => {
    b.classList.toggle('on', b.dataset.l === BX.lang);
    b.onclick = () => { BX.setLang(b.dataset.l); BX.setDigits(b.dataset.l); shell(); route(); };
  });
  $('#menuBtn').onclick = () => toggleMenu(true);
  $('#overlay').onclick = () => toggleMenu(false);
  $('#userBtn').onclick = userMenu;
  // banners
  const t = me.tenant; const days = Math.round((new Date(t.plan_expires) - new Date(me.today)) / 864e5);
  let ban = '';
  if (me.user.impersonated) ban += `<div class="banner info">👁 ${L('সুপার অ্যাডমিন হিসেবে দেখছেন', 'Viewing as super admin')} — <a href="#" onclick="logout();return false">${L('বের হন', 'Exit')}</a></div>`;
  if (t.expired) ban += `<div class="banner bad">⛔ ${L('আপনার সাবস্ক্রিপশনের মেয়াদ শেষ। নতুন এন্ট্রি বন্ধ — শুধু দেখা যাবে।', 'Your subscription has expired. New entries are blocked — view only.')} <a href="#/billing">${L('এখনই রিনিউ করুন', 'Renew now')} →</a></div>`;
  else if (days <= 5) ban += `<div class="banner warn">⏳ ${L(`সাবস্ক্রিপশন শেষ হবে ${BX.dg(days)} দিন পর (${BX.date(t.plan_expires)})`, `Subscription ends in ${days} day(s) (${BX.date(t.plan_expires)})`)} — <a href="#/billing">${L('রিনিউ করুন', 'Renew')}</a></div>`;
  if (me.platform.announcement) ban += `<div class="banner info">📢 ${esc(me.platform.announcement)}</div>`;
  $('#banners').innerHTML = ban;
  $('#banners').style.display = ban ? '' : 'none';
}
function toggleMenu(open) { $('#side').classList.toggle('open', open); $('#overlay').classList.toggle('open', open); }
async function logout() { await BX.post('/api/auth/logout').catch(() => {}); location.href = '/'; }
function userMenu() {
  const u = APP.me.user;
  BX.modal({
    title: '👤 ' + esc(u.name),
    body: `<p class="mute">${esc(u.role_name || '')} • ${L('ইউজারনেম', 'Username')}: <b>${esc(u.username)}</b><br>${L('শপ আইডি', 'Shop ID')}: <b>${esc(APP.me.tenant.slug)}</b></p>
      <div class="grid" style="gap:8px">
        <button class="btn block" id="cpw">🔑 ${L('পাসওয়ার্ড পরিবর্তন', 'Change password')}</button>
        <div class="row"><span class="grow">${L('সংখ্যা দেখাবে', 'Show numbers in')}</span><div class="seg" id="dgSeg"><button data-d="bn">১২৩</button><button data-d="en">123</button></div></div>
        ${APP.me.branches.length > 1 && !u.branch_id ? `<div class="f"><label>${L('ব্রাঞ্চ', 'Branch')}</label><select class="in" id="brSel2">${APP.me.branches.map(b => `<option value="${b.id}" ${String(b.id) === String(BX.branch) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>` : ''}
        <button class="btn danger block" onclick="logout()">🚪 ${L('লগআউট', 'Logout')}</button></div>`,
    onOpen: (el, close) => {
      $$('#dgSeg button', el).forEach(b => { b.classList.toggle('on', b.dataset.d === BX.digits); b.onclick = () => { BX.setDigits(b.dataset.d); close(); route(); }; });
      const br = $('#brSel2', el); if (br) br.onchange = () => { $('#branchSel').value = br.value; $('#branchSel').onchange(); close(); };
      $('#cpw', el).onclick = () => { close(); BX.formModal(L('পাসওয়ার্ড পরিবর্তন', 'Change password'), [{ k: 'old_password', label: L('বর্তমান পাসওয়ার্ড', 'Current password'), type: 'password', req: 1, full: 1 }, { k: 'new_password', label: L('নতুন পাসওয়ার্ড', 'New password'), type: 'password', req: 1, full: 1 }], {}, async v => { await BX.post('/api/auth/change-password', v); BX.toast(L('পাসওয়ার্ড পরিবর্তন হয়েছে', 'Password changed'), 'ok'); }); };
    },
  });
}

async function route() {
  toggleMenu(false);
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [name, qs] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const m = MENU().find(x => x.id === name);
  const page = PAGES[name] ? name : 'dashboard';
  $$('#menu a, #bottomNav a').forEach(a => a.classList.toggle('on', a.dataset.id === page));
  $('#pageTitle').textContent = m ? m.t : '';
  document.title = (m ? m.t + ' — ' : '') + APP.me.tenant.name;
  const c = $('#content');
  if (m && m.p && !can(m.p)) { c.innerHTML = `<div class="card empty">🔒 ${L('এই পেজ দেখার অনুমতি নেই', 'You do not have access to this page')}</div>`; return; }
  c.innerHTML = `<div class="empty">⏳ ${L('লোড হচ্ছে…', 'Loading…')}</div>`;
  window.scrollTo(0, 0);
  try { await PAGES[page](c, params); } catch (e) { c.innerHTML = `<div class="card empty bad">${esc(e.message)}</div>`; }
}
const go = h => { if (location.hash === '#/' + h) route(); else location.hash = '#/' + h; };

const dateRangeHtml = (from, to) => `<div class="row"><input type="date" class="in sm" id="dFrom" value="${from}" style="width:auto"><span>—</span><input type="date" class="in sm" id="dTo" value="${to}" style="width:auto">
  <select class="in sm" id="dQuick" style="width:auto"><option value="">${L('দ্রুত বাছাই', 'Quick')}</option><option value="today">${L('আজ', 'Today')}</option><option value="yday">${L('গতকাল', 'Yesterday')}</option><option value="7">${L('গত ৭ দিন', 'Last 7 days')}</option><option value="month">${L('এই মাস', 'This month')}</option><option value="lmonth">${L('গত মাস', 'Last month')}</option><option value="year">${L('এই বছর', 'This year')}</option></select></div>`;
function bindRange(root, cb) {
  const f = $('#dFrom', root), t = $('#dTo', root), qk = $('#dQuick', root);
  f.onchange = t.onchange = () => cb(f.value, t.value);
  qk.onchange = () => {
    const td = BX.today(); let a = td, b = td;
    if (qk.value === 'yday') a = b = BX.addDays(td, -1);
    if (qk.value === '7') a = BX.addDays(td, -6);
    if (qk.value === 'month') a = BX.monthStart();
    if (qk.value === 'lmonth') { const d = new Date(td.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); a = d.toISOString().slice(0, 10); b = BX.addDays(BX.monthStart(), -1); }
    if (qk.value === 'year') a = td.slice(0, 4) + '-01-01';
    f.value = a; t.value = b; cb(a, b);
  };
}

// ================= DASHBOARD =================
PAGES.welcome = async c => {
  c.innerHTML = `<div class="card" style="max-width:720px;margin:20px auto;text-align:center;padding:30px">
    <div style="font-size:48px">🎉</div><h2>${L('স্বাগতম!', 'Welcome!')} ${esc(APP.me.tenant.name)}</h2>
    <p class="mute">${L(`আপনার ফ্রি ট্রায়াল চালু হয়েছে (${BX.date(APP.me.tenant.plan_expires)} পর্যন্ত)। শুরু করতে নিচের ধাপগুলো করুন:`, `Your free trial is active (until ${BX.date(APP.me.tenant.plan_expires)}). Get started:`)}</p>
    <p>${L('শপ আইডি', 'Shop ID')}: <b>${esc(APP.me.tenant.slug)}</b> <span class="small mute">(${L('স্টাফরা লগইনের সময় লাগবে', 'staff need this to log in')})</span></p>
    <div class="grid g2" style="text-align:left;margin-top:16px">
      <a class="card" href="#/settings">⚙️ <b>১.</b> ${L('দোকানের ঠিকানা ও লোগো দিন', 'Add shop address & logo')}</a>
      <a class="card" href="#/products">📦 <b>২.</b> ${L('পণ্য ও স্টক যোগ করুন', 'Add products & stock')}</a>
      <a class="card" href="#/customers">👥 <b>৩.</b> ${L('কাস্টমারের পূর্বের বাকি তুলুন', 'Add customers with previous due')}</a>
      <a class="card" href="#/pos">🧾 <b>৪.</b> ${L('প্রথম বিক্রি করুন', 'Make your first sale')}</a></div>
    <button class="btn pri lg" style="margin-top:20px" onclick="go('dashboard')">${L('ড্যাশবোর্ডে যান', 'Go to dashboard')} →</button></div>`;
};

PAGES.dashboard = async (c, params) => {
  const date = params.date || BX.today();
  const d = await BX.get('/api/dashboard?date=' + date);
  const maxT = Math.max(1, ...d.trend.map(t => t.sales));
  const showProfit = can('profit');
  c.innerHTML = `
  <div class="page-head"><h2>${L('আজকের হিসাব', "Today's summary")} — ${BX.date(date)}</h2>
    <div class="row"><input type="date" class="in sm" id="dd" value="${date}" style="width:auto">${can('pos') ? `<a class="btn pri" href="#/pos">➕ ${L('নতুন বিক্রি', 'New sale')}</a>` : ''}</div></div>
  <div class="grid g4">
    <div class="stat green"><div class="l">${L('আজকের বিক্রি', "Today's sales")}</div><div class="v">${BX.tk(d.sales)}</div><div class="small mute">${BX.dg(d.invoices)} ${L('টি ইনভয়েস', 'invoices')}</div></div>
    <div class="stat blue"><div class="l">${L('আজকের কালেকশন', "Today's collection")}</div><div class="v">${BX.tk(d.collection)}</div><div class="small mute">${L('বাকি আদায়', 'Due collected')}: ${BX.tk(d.due_collection)}</div></div>
    <div class="stat amber"><div class="l">${L('আজ বাকিতে বিক্রি', 'Credit sales today')}</div><div class="v">${BX.tk(d.credit_sales)}</div></div>
    <div class="stat red"><div class="l">${L('আজকের খরচ', "Today's expenses")}</div><div class="v">${BX.tk(d.expenses)}</div></div>
    <div class="stat navy"><div class="l">${L('আজকের ক্রয়', "Today's purchase")}</div><div class="v">${BX.tk(d.purchase)}</div></div>
    ${showProfit ? `<div class="stat green"><div class="l">${L('আজকের মোট লাভ (গ্রস)', 'Gross profit today')}</div><div class="v">${BX.tk(d.gross_profit)}</div></div>
    <div class="stat ${d.net_profit >= 0 ? 'green' : 'red'}"><div class="l">${L('আনুমানিক নিট লাভ', 'Estimated net profit')}</div><div class="v">${BX.tk(d.net_profit)}</div><div class="small mute">${L('এই মাসে', 'This month')}: ${BX.tk(d.month_profit)}</div></div>` : ''}
    <div class="stat"><div class="l">${L('এই মাসের বিক্রি', 'This month sales')}</div><div class="v">${BX.tk(d.month_sales)}</div></div>
  </div>
  <div class="grid g3" style="margin-top:12px">
    <a class="stat red" href="#/due"><div class="l">📒 ${L('মোট কাস্টমার বাকি', 'Total customer due')}</div><div class="v">${BX.tk(d.customer_due)}</div><div class="small mute">${BX.dg(d.due_customers)} ${L('জন কাস্টমার', 'customers')} →</div></a>
    <a class="stat amber" href="#/suppliers"><div class="l">🏭 ${L('মোট সাপ্লায়ার পাওনা', 'Total supplier payable')}</div><div class="v">${BX.tk(d.supplier_due)}</div></a>
    <a class="stat ${d.low_stock ? 'red' : ''}" href="#/stock?tab=low"><div class="l">⚠️ ${L('কম স্টক', 'Low stock items')}</div><div class="v">${BX.dg(d.low_stock)}</div></a>
  </div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>${L('গত ৭ দিনের বিক্রি', 'Last 7 days sales')}</h3>
      <div class="bars">${d.trend.map(t => `<div class="b" title="${BX.tk(t.sales)}"><div class="small">${t.sales ? BX.num(t.sales / 1000, 1) + 'k' : ''}</div><div class="bar" style="height:${(t.sales / maxT) * 110}px"></div><div class="lbl">${BX.dg(t.date.slice(8))}/${BX.dg(t.date.slice(5, 7))}</div></div>`).join('')}</div></div>
    <div class="card"><h3>${L('ক্যাশ ও একাউন্ট ব্যালেন্স', 'Cash & account balances')}</h3>
      ${d.accounts.map(a => `<div class="row between" style="padding:7px 0;border-bottom:1px solid #f1f3f5"><span>${esc(a.name)}</span><b>${BX.tk(a.balance)}</b></div>`).join('')}
      <div class="row between" style="padding-top:8px"><b>${L('মোট', 'Total')}</b><b>${BX.tk(BX.sum(d.accounts, 'balance'))}</b></div></div>
  </div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>${L('আজকের সেরা পণ্য', 'Top products today')}</h3>${BX.table([{ h: L('পণ্য', 'Product'), k: 'name' }, { h: L('পরিমাণ', 'Qty'), n: 1, f: r => BX.qty(r.qty) + ' ' + esc(BX.unitLabel(r.unit)) }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.tk(r.total) }], d.top)}</div>
    <div class="card"><h3>${L('সর্বশেষ বিক্রি', 'Recent sales')}</h3><div id="recent">${BX.table([{ h: L('ইনভয়েস', 'Invoice'), k: 'invoice_no' }, { h: L('কাস্টমার', 'Customer'), k: 'customer_name' }, { h: L('মোট', 'Total'), n: 1, f: r => BX.tk(r.total) }, { h: L('বাকি', 'Due'), n: 1, f: r => r.due > 0 ? `<span class="bad">${BX.tk(r.due)}</span>` : '-' }], d.recent, { click: 1 })}</div></div>
  </div>`;
  $('#dd', c).onchange = e => go('dashboard?date=' + e.target.value);
  BX.bindRows($('#recent', c), d.recent, r => viewSale(r.id));
};

// ================= INVOICE PRINTING =================
function withLang(lang, fn) {
  const sv = [BX.lang, BX.digits];
  BX.lang = lang; BX.digits = lang;
  try { return fn(); } finally { BX.lang = sv[0]; BX.digits = sv[1]; }
}
function shopHeader(title, extraRight) {
  const t = APP.me.tenant, st = S();
  return `<div class="hdr"><div style="display:flex;gap:12px;align-items:center">${st.logo ? `<img src="${st.logo}" style="height:60px;max-width:120px;object-fit:contain">` : ''}
    <div><h2>${esc(t.name)}</h2><div class="muted">${esc(t.address || '')}</div><div class="muted">${L('মোবাইল', 'Mobile')}: ${BX.dg(esc(t.phone || ''))}${st.vat_reg_no ? ` • BIN: ${esc(st.vat_reg_no)}` : ''}</div></div></div>
    <div style="text-align:right"><h2 style="letter-spacing:.5px">${title}</h2>${extraRight || ''}</div></div>`;
}
function itemQtyText(it) {
  let txt = `${BX.qty(it.qty)} ${esc(BX.unitLabel(it.unit))}`;
  if (it.kind === 'tile' && it.sqft_per_pcs) {
    const sq = Number(it.base_qty || it.qty * it.factor);
    txt += it.unit === 'sqft' ? `<div class="muted" style="font-size:11px">${BX.boxPcs(sq, it)}</div>` : `<div class="muted" style="font-size:11px">${BX.qty(sq)} sqft</div>`;
  }
  return txt;
}
async function printSale(id, size, challan) {
  const sale = await BX.get('/api/sales/' + id);
  const st = S(); size = size || st.invoice_size;
  const html = withLang(st.invoice_lang || 'bn', () => {
    const pos = size === 'pos80';
    const rows = sale.items.map((it, i) => `<tr><td>${BX.dg(i + 1)}</td><td>${esc(it.name)}${it.batch || it.shade ? `<div class="muted" style="font-size:11px">${it.batch ? L('ব্যাচ', 'Batch') + ': ' + esc(it.batch) : ''} ${it.shade ? L('শেড', 'Shade') + ': ' + esc(it.shade) : ''}</div>` : ''}</td>
      <td class="n">${itemQtyText(it)}</td>${challan ? '' : `<td class="n">${BX.num(it.rate)}</td><td class="n">${BX.num(it.total)}</td>`}</tr>`).join('');
    const prev = st.show_prev_due && sale.customer_id;
    const totals = challan ? '' : `<table class="tot" style="width:${pos ? '100%' : '320px'};margin-left:auto;margin-top:8px">
      <tr><td>${L('সাবটোটাল', 'Subtotal')}</td><td class="n">${BX.num(sale.subtotal)}</td></tr>
      ${sale.discount > 0 ? `<tr><td>${L('ডিসকাউন্ট', 'Discount')}</td><td class="n">- ${BX.num(sale.discount)}</td></tr>` : ''}
      ${sale.vat > 0 ? `<tr><td>${L('ভ্যাট', 'VAT')}</td><td class="n">${BX.num(sale.vat)}</td></tr>` : ''}
      ${sale.delivery_charge > 0 ? `<tr><td>${L('ডেলিভারি চার্জ', 'Delivery charge')}</td><td class="n">${BX.num(sale.delivery_charge)}</td></tr>` : ''}
      <tr class="g"><td>${L('মোট বিল', 'Net total')}</td><td class="n">৳${BX.num(sale.total)}</td></tr>
      ${prev ? `<tr><td>${L('পূর্বের বাকি', 'Previous due')}</td><td class="n">${BX.num(sale.previous_due)}</td></tr><tr><td class="b">${L('সর্বমোট', 'Grand total')}</td><td class="n b">${BX.num(sale.previous_due + sale.total)}</td></tr>` : ''}
      <tr><td>${L('জমা', 'Paid')}</td><td class="n">${BX.num(prev ? sale.paid + Math.max(0, BX.sum(sale.payments, 'amount') - sale.paid) : sale.paid)}</td></tr>
      ${sale.returned > 0 ? `<tr><td>${L('ফেরত', 'Returned')}</td><td class="n">- ${BX.num(sale.returned)}</td></tr>` : ''}
      <tr class="g"><td>${prev ? L('বর্তমান মোট বাকি', 'Current total due') : L('বাকি', 'Due')}</td><td class="n">৳${BX.num(prev ? (sale.previous_due + sale.total - BX.sum(sale.payments, 'amount') - (sale.returned || 0)) : Math.max(0, sale.due - (sale.returned || 0)))}</td></tr></table>
      <div style="margin-top:6px"><b>${L('কথায়', 'In words')}:</b> ${BX.words(sale.total)}</div>
      ${sale.payments.length ? `<div class="muted" style="margin-top:4px">${L('পেমেন্ট', 'Payment')}: ${sale.payments.map(p => esc(p.account) + ' ' + BX.num(p.amount)).join(', ')}</div>` : ''}`;
    const title = challan ? L('ডেলিভারি চালান', 'DELIVERY CHALLAN') : L('বিক্রয় রশিদ', 'INVOICE');
    const info = `<table style="margin-bottom:8px"><tr><td style="width:60%"><b>${L('কাস্টমার', 'Customer')}:</b> ${esc(sale.customer_name || '')}<br>${sale.customer_phone ? L('মোবাইল', 'Mobile') + ': ' + BX.dg(esc(sale.customer_phone)) + '<br>' : ''}${esc(challan ? (sale.delivery_address || sale.customer_address || '') : (sale.customer_address || ''))}</td>
      <td style="text-align:right"><b>${L('ইনভয়েস নং', 'Invoice No')}:</b> ${esc(sale.invoice_no)}<br><b>${L('তারিখ', 'Date')}:</b> ${BX.date(sale.date)}<br>${L('বিক্রেতা', 'Sold by')}: ${esc(sale.user_name || '')}
      ${challan && sale.delivery_person ? `<br>${L('ডেলিভারি', 'Delivery by')}: ${esc(sale.delivery_person)} ${BX.dg(esc(sale.delivery_phone || ''))}` : ''}</td></tr></table>`;
    const head = pos ? `<div class="c"><h2>${esc(APP.me.tenant.name)}</h2><div>${esc(APP.me.tenant.address || '')}</div><div>${BX.dg(esc(APP.me.tenant.phone || ''))}</div><div class="b" style="margin:6px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:3px">${title}</div></div>` : shopHeader(title);
    const stamp = !challan && sale.due <= 0.009 ? `<span class="stamp" style="color:#059669">${L('পরিশোধিত', 'PAID')}</span>` : '';
    return `${head}${info}<table class="items"><thead><tr><th>#</th><th>${L('পণ্যের বিবরণ', 'Description')}</th><th class="n">${L('পরিমাণ', 'Qty')}</th>${challan ? '' : `<th class="n">${L('দর', 'Rate')}</th><th class="n">${L('টাকা', 'Amount')}</th>`}</tr></thead><tbody>${rows}</tbody></table>
      ${totals}<div style="margin-top:8px">${stamp}</div>${sale.note ? `<div style="margin-top:6px">${L('নোট', 'Note')}: ${esc(sale.note)}</div>` : ''}
      ${pos ? `<div class="c muted" style="margin-top:10px;font-size:11px">${esc(st.invoice_footer || '')}<br>Powered by ${esc(APP.me.platform.brand_name)}</div>`
        : `<div class="sig"><div>${L('ক্রেতার স্বাক্ষর', 'Customer signature')}</div><div>${L('বিক্রেতার স্বাক্ষর', 'Authorised signature')}</div></div>
           <div class="c muted" style="margin-top:16px;font-size:12px">${esc(st.invoice_footer || '')}</div><div class="c muted" style="font-size:10px;margin-top:4px">Software: ${esc(APP.me.platform.brand_name)}</div>`}`;
  });
  BX.print(html, sale.invoice_no, size);
}
function saleShareText(sale) {
  return `${APP.me.tenant.name}\n${L('ইনভয়েস', 'Invoice')}: ${sale.invoice_no} (${BX.date(sale.date)})\n${L('মোট', 'Total')}: ৳${BX.num(sale.total)}\n${L('জমা', 'Paid')}: ৳${BX.num(sale.paid)}\n${L('বাকি', 'Due')}: ৳${BX.num(sale.due)}${sale.current_balance !== undefined ? `\n${L('মোট বাকি', 'Total balance')}: ৳${BX.num(sale.current_balance)}` : ''}\n${L('ধন্যবাদ', 'Thank you')}`;
}

async function viewSale(id) {
  const sale = await BX.get('/api/sales/' + id);
  const st = { none: '', pending: `<span class="badge warn">${L('ডেলিভারি বাকি', 'Delivery pending')}</span>`, dispatched: `<span class="badge info">${L('পাঠানো হয়েছে', 'Dispatched')}</span>`, delivered: `<span class="badge ok">${L('ডেলিভারি সম্পন্ন', 'Delivered')}</span>` };
  const m = BX.modal({
    title: `${L('ইনভয়েস', 'Invoice')} ${esc(sale.invoice_no)}`, wide: 1,
    body: `<div class="row between"><div><b>${esc(sale.customer_name)}</b> ${sale.customer_phone ? '• ' + BX.dg(esc(sale.customer_phone)) : ''}<div class="small mute">${BX.date(sale.date)} • ${esc(sale.user_name || '')} • ${esc(sale.branch_name || '')} • ${sale.sale_type === 'wholesale' ? L('পাইকারি', 'Wholesale') : L('খুচরা', 'Retail')}</div></div><div>${st[sale.delivery_status] || ''}</div></div>
    <div style="margin-top:10px">${BX.table([{ h: L('পণ্য', 'Product'), f: r => esc(r.name) + (r.batch || r.shade ? `<div class="small mute">${esc(r.batch)} ${esc(r.shade)}</div>` : '') }, { h: L('পরিমাণ', 'Qty'), n: 1, f: r => itemQtyText(r) + (r.returned_base_qty > 0 ? `<div class="small bad">${L('ফেরত', 'Ret')}: ${BX.qty(r.returned_base_qty / r.factor)}</div>` : '') }, { h: L('দর', 'Rate'), n: 1, f: r => BX.num(r.rate) }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.num(r.total) }], sale.items)}</div>
    <div class="grid g2" style="margin-top:10px"><div>${sale.payments.map(p => `<div class="small">💳 ${esc(p.account)}: ${BX.tk(p.amount)}</div>`).join('')}${sale.note ? `<div class="small mute">${L('নোট', 'Note')}: ${esc(sale.note)}</div>` : ''}${sale.returns.length ? `<div class="small bad">↩ ${sale.returns.map(r => esc(r.return_no) + ' ' + BX.tk(r.total)).join(', ')}</div>` : ''}</div>
    <table class="totals" style="width:100%"><tr><td>${L('সাবটোটাল', 'Subtotal')}</td><td class="right">${BX.tk(sale.subtotal)}</td></tr>${sale.discount ? `<tr><td>${L('ডিসকাউন্ট', 'Discount')}</td><td class="right">-${BX.tk(sale.discount)}</td></tr>` : ''}${sale.vat ? `<tr><td>${L('ভ্যাট', 'VAT')}</td><td class="right">${BX.tk(sale.vat)}</td></tr>` : ''}${sale.delivery_charge ? `<tr><td>${L('ডেলিভারি', 'Delivery')}</td><td class="right">${BX.tk(sale.delivery_charge)}</td></tr>` : ''}
    <tr class="gt"><td>${L('মোট', 'Total')}</td><td class="right">${BX.tk(sale.total)}</td></tr><tr><td>${L('জমা', 'Paid')}</td><td class="right ok">${BX.tk(sale.paid)}</td></tr><tr><td>${L('বাকি', 'Due')}</td><td class="right bad">${BX.tk(sale.due)}</td></tr>
    ${sale.current_balance !== undefined ? `<tr><td class="small mute">${L('কাস্টমারের বর্তমান মোট বাকি', 'Customer current balance')}</td><td class="right small">${BX.tk(sale.current_balance)}</td></tr>` : ''}</table></div>`,
    buttons: [
      ...(can('sales_delete') ? [{ label: '🗑 ' + L('মুছুন', 'Delete'), cls: 'danger', onClick: async close => { if (!(await BX.confirm(L('এই ইনভয়েস মুছে ফেলবেন? স্টক, ক্যাশ ও বাকির হিসাব আগের অবস্থায় ফিরবে।', 'Delete this invoice? Stock, cash and due will be reversed.')))) return; await BX.del('/api/sales/' + id); BX.toast(L('মুছে ফেলা হয়েছে', 'Deleted'), 'ok'); close(); APP.drop('products'); route(); } }] : []),
      ...(can('sales_return') ? [{ label: '↩ ' + L('ফেরত', 'Return'), onClick: c => { c(); returnModal(sale); } }] : []),
      ...(can('delivery') ? [{ label: '🚚 ' + L('ডেলিভারি', 'Delivery'), onClick: c => { c(); deliveryModal(sale); } }] : []),
      ...(sale.customer_phone ? [{ label: '💬 WhatsApp', onClick: () => window.open(BX.waLink(sale.customer_phone, saleShareText(sale))) }] : []),
      { label: '🖨 POS', onClick: () => printSale(id, 'pos80') },
      { label: '🖨 ' + L('চালান', 'Challan'), onClick: () => printSale(id, 'a4', true) },
      { label: '🖨 ' + L('প্রিন্ট', 'Print'), cls: 'pri', onClick: () => printSale(id) },
    ],
  });
  return m;
}

function returnModal(sale) {
  const items = sale.items.filter(i => i.base_qty - i.returned_base_qty > 0.0001);
  if (!items.length) return BX.toast(L('ফেরতযোগ্য কিছু নেই', 'Nothing left to return'), 'bad');
  APP.load('accounts').then(accs => {
    BX.modal({
      title: `↩ ${L('বিক্রয় ফেরত', 'Sales return')} — ${esc(sale.invoice_no)}`, wide: 1,
      body: `${BX.table([{ h: L('পণ্য', 'Product'), f: r => esc(r.name) }, { h: L('বিক্রি', 'Sold'), n: 1, f: r => BX.qty((r.base_qty - r.returned_base_qty) / r.factor) + ' ' + esc(BX.unitLabel(r.unit)) },
        { h: L('ফেরত পরিমাণ', 'Return qty'), f: r => `<input class="in sm rq" data-id="${r.id}" data-rate="${r.total / r.qty}" style="width:90px" inputmode="decimal" placeholder="0">` },
        { h: L('ভাঙা? (স্টকে যাবে না)', 'Broken? (no restock)'), f: r => `<label class="chk"><input type="checkbox" class="brk" data-id="${r.id}"></label>` }], items)}
        <div class="grid g3" style="margin-top:12px"><div class="f"><label>${L('ফেরত মূল্য (আনুমানিক)', 'Return value (approx.)')}</label><div class="big" id="rv">৳0</div></div>
        <div class="f"><label>${L('টাকা ফেরত দিন', 'Cash refund')}</label><input class="in" id="rf" inputmode="decimal" placeholder="0"><span class="small mute">${sale.customer_id ? L('ফেরত না দিলে কাস্টমারের বাকি থেকে কাটা যাবে', 'If not refunded, it reduces customer due') : L('ওয়াক-ইন কাস্টমারকে পুরো টাকা ফেরত দিতে হবে', 'Walk-in must be fully refunded')}</span></div>
        <div class="f"><label>${L('কোথা থেকে', 'From account')}</label><select class="in" id="ra">${accOptions(accs, cashId(accs))}</select></div></div>
        <div class="f" style="margin-top:8px"><label>${L('কারণ / নোট', 'Reason / note')}</label><input class="in" id="rn"></div>`,
      onOpen: el => {
        const calc = () => { const disc = sale.subtotal > 0 ? (sale.subtotal - sale.discount + sale.vat) / sale.subtotal : 1; let v = 0; $$('.rq', el).forEach(i => (v += nv(i.value) * Number(i.dataset.rate) * disc)); $('#rv', el).textContent = BX.tk(v); if (!sale.customer_id) $('#rf', el).value = Math.round(v * 100) / 100; };
        $$('.rq', el).forEach(i => (i.oninput = calc));
      },
      buttons: [{ label: L('বাতিল', 'Cancel') }, { label: L('ফেরত নিন', 'Process return'), cls: 'pri', onClick: async (close, el) => {
        const its = $$('.rq', el).filter(i => nv(i.value) > 0).map(i => ({ sale_item_id: i.dataset.id, qty: nv(i.value), restock: !$(`.brk[data-id="${i.dataset.id}"]`, el).checked }));
        await BX.post(`/api/sales/${sale.id}/return`, { items: its, refund: nv($('#rf', el).value), account_id: $('#ra', el).value, note: $('#rn', el).value });
        BX.toast(L('ফেরত সম্পন্ন', 'Return completed'), 'ok'); close(); APP.drop('products', 'accounts'); route();
      } }],
    });
  });
}

function deliveryModal(sale) {
  const f = [
    { k: 'delivery_status', label: L('স্ট্যাটাস', 'Status'), type: 'select', options: [['pending', L('ডেলিভারি বাকি', 'Pending')], ['dispatched', L('পাঠানো হয়েছে', 'Dispatched')], ['delivered', L('ডেলিভারি সম্পন্ন', 'Delivered')], ['none', L('ডেলিভারি নেই', 'No delivery')]] },
    { k: 'delivery_date', label: L('তারিখ', 'Date'), type: 'date' },
    { k: 'delivery_person', label: L('ডেলিভারি ম্যান / গাড়ি', 'Delivery person / vehicle') },
    { k: 'delivery_phone', label: L('তার মোবাইল', 'Their mobile'), type: 'tel' },
    { k: 'delivery_address', label: L('ডেলিভারি ঠিকানা', 'Delivery address'), type: 'textarea', full: 1 },
  ];
  BX.formModal('🚚 ' + L('ডেলিভারি', 'Delivery') + ' — ' + esc(sale.invoice_no), f, { ...sale, delivery_status: sale.delivery_status === 'none' ? 'pending' : sale.delivery_status, delivery_date: sale.delivery_date || BX.today(), delivery_address: sale.delivery_address || sale.customer_address }, async v => {
    await BX.put(`/api/sales/${sale.id}/delivery`, v); BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); if (location.hash.includes('deliveries')) route();
  });
}

// ================= POS =================
const POS_KEY = () => 'bx_pos_' + APP.me.tenant.id + '_' + APP.me.user.id;
function posNew(mode) {
  return { mode: mode || 'sale', items: [], customer: null, walkin: { name: '', phone: '', address: '' }, sale_type: 'retail', discount: '', discount_type: 'amt', vat_percent: S().vat_percent || 0, delivery_charge: '', delivery: { enabled: false, address: '', person: '', phone: '', date: '' }, payments: [], note: '', date: BX.today(), quotation_id: null, quote_edit_id: null, project_name: '', valid_until: BX.addDays(BX.today(), 15) };
}
function posSave() { sessionStorage.setItem(POS_KEY(), JSON.stringify(APP.pos)); }
function posLoad() { try { return JSON.parse(sessionStorage.getItem(POS_KEY())); } catch (e) { return null; } }
function unitPrice(p, unitName, saleType) {
  const u = (p.units || []).find(x => x.name === unitName) || { name: p.base_unit, factor: 1 };
  if (saleType === 'wholesale') return Number(u.wholesale_price) || (Number(p.wholesale_price) * u.factor) || Number(u.retail_price) || Number(p.retail_price) * u.factor;
  return Number(u.retail_price) || Number(p.retail_price) * u.factor;
}
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
function posTotals(P) {
  const sub = r2(P.items.reduce((a, l) => a + r2(nv(l.qty) * nv(l.rate) - nv(l.discount)), 0));
  const disc = P.discount_type === 'percent' ? r2(sub * nv(P.discount) / 100) : r2(nv(P.discount));
  const vat = r2((sub - disc) * nv(P.vat_percent) / 100);
  const del = r2(nv(P.delivery_charge));
  const total = r2(sub - disc + vat + del);
  const paid = r2(P.payments.reduce((a, p) => a + nv(p.amount), 0));
  return { sub, disc, vat, del, total, paid };
}

PAGES.pos = async (c, params) => {
  const [products, accs, cats] = await Promise.all([APP.load('products', true), APP.load('accounts'), APP.load('categories')]);
  let P = posLoad();
  if (params.mode === 'quote' && (!P || P.mode !== 'quote')) P = posNew('quote');
  if (params.mode !== 'quote' && P && P.mode === 'quote' && !params.keep) P = null;
  if (!P) P = posNew(params.mode === 'quote' ? 'quote' : 'sale');
  if (!P.payments.length) P.payments = [{ account_id: cashId(accs), amount: '' }];
  APP.pos = P;
  const pmap = {}; products.forEach(p => (pmap[p.id] = p));
  let cat = '', q = '';
  const isQuote = P.mode === 'quote';

  c.innerHTML = `
  ${isQuote ? `<div class="banner info">📝 ${P.quote_edit_id ? L('কোটেশন এডিট করছেন', 'Editing quotation') : L('কোটেশন / প্রজেক্ট এস্টিমেট তৈরি করছেন — স্টক কমবে না', 'Creating a quotation / project estimate — stock will not change')} <a href="#" id="exitQuote">${L('বিক্রিতে ফিরুন', 'Back to sale')}</a></div>` : ''}
  ${P.quotation_id ? `<div class="banner info">📝 ${L('কোটেশন থেকে বিক্রি', 'Converting quotation to sale')}</div>` : ''}
  <div class="pos">
    <div>
      <div class="row" style="margin-bottom:8px"><input class="in grow" id="psearch" placeholder="🔍 ${L('পণ্যের নাম, সাইজ বা বারকোড স্ক্যান করুন…', 'Search product, size or scan barcode…')}" autocomplete="off">
        <div class="seg"><button data-st="retail" class="${P.sale_type === 'retail' ? 'on' : ''}">${L('খুচরা', 'Retail')}</button><button data-st="wholesale" class="${P.sale_type === 'wholesale' ? 'on' : ''}">${L('পাইকারি', 'Wholesale')}</button></div></div>
      <div class="chips" id="cats"><span class="chip on" data-c="">${L('সব', 'All')}</span>${cats.map(x => `<span class="chip" data-c="${x.id}">${esc(x.name)}</span>`).join('')}</div>
      <div class="pgrid" id="pgrid" style="margin-top:8px"></div>
    </div>
    <div id="cart"></div>
  </div>
  <button class="btn pri lg hidden" id="cartFab" style="position:fixed;right:14px;bottom:76px;z-index:25;border-radius:99px;box-shadow:0 6px 20px rgba(0,0,0,.25)"></button>`;

  const drawGrid = () => {
    const ql = q.toLowerCase();
    const list = products.filter(p => (!cat || String(p.category_id) === cat) && (!ql || (p.name + ' ' + (p.name_bn || '') + ' ' + (p.size || '') + ' ' + (p.sku || '') + ' ' + (p.barcode || '')).toLowerCase().includes(ql))).slice(0, 300);
    $('#pgrid', c).innerHTML = list.length ? list.map(p => {
      const price = unitPrice(p, p.sale_unit, P.sale_type);
      return `<div class="pcard ${p.stock <= 0 ? 'out' : ''}" data-id="${p.id}"><div class="nm">${esc(p.name)}</div>${p.size ? `<div class="small mute">${esc(p.size)}</div>` : ''}
        <div class="small ${p.stock <= 0 ? 'bad' : p.stock <= p.reorder_level ? 'warn' : 'mute'}">${L('স্টক', 'Stock')}: ${BX.stockText(p.stock, p)}</div>
        <div class="pr">${BX.tk(price)} <span class="small mute">/ ${esc(BX.unitLabel(p.sale_unit))}</span></div></div>`;
    }).join('') : `<div class="empty" style="grid-column:1/-1">${L('কোনো পণ্য নেই', 'No products')} ${can('products') ? `— <a href="#/products">${L('পণ্য যোগ করুন', 'Add products')}</a>` : ''}</div>`;
    $$('.pcard', c).forEach(el => (el.onclick = () => addItem(pmap[el.dataset.id])));
  };

  const addItem = async (p, qty, unit) => {
    if (!p) return;
    unit = unit || p.sale_unit || p.base_unit;
    let batches = [];
    try { batches = await BX.get('/api/stock/batches/' + p.id); } catch (e) {}
    const named = batches.filter(b => b.batch || b.shade);
    const best = batches.slice().sort((a, b) => b.qty - a.qty)[0];
    const existing = P.items.find(l => l.product_id === p.id && l.unit === unit && (!best || (l.batch === best.batch && l.shade === best.shade)));
    if (existing && !qty) existing.qty = nv(existing.qty) + 1;
    else P.items.push({ product_id: p.id, unit, qty: qty || 1, rate: r2(unitPrice(p, unit, P.sale_type)), discount: 0, batch: best ? best.batch : '', shade: best ? best.shade : '', batches: named.length ? batches : [] });
    posSave(); drawCart();
    BX.toast('✓ ' + p.name, 'ok');
  };
  APP.posAdd = addItem;

  const drawCart = () => {
    const t = posTotals(P);
    const cust = P.customer;
    const lines = P.items.map((l, i) => {
      const p = pmap[l.product_id] || { name: '?', units: [] };
      const u = (p.units || []).find(x => x.name === l.unit) || { factor: 1 };
      let helper = '';
      if (p.kind === 'tile') {
        const sq = nv(l.qty) * u.factor;
        helper = l.unit === 'sqft' ? '= ' + BX.boxPcs(sq, p) : `= ${BX.qty(sq)} sqft`;
      } else if (u.factor !== 1) helper = `= ${BX.qty(nv(l.qty) * u.factor)} ${esc(p.base_unit)}`;
      return `<div class="cart-line" data-i="${i}">
        <div class="row between"><b class="grow" style="font-size:14px">${esc(p.name)} ${p.size ? `<span class="mute small">(${esc(p.size)})</span>` : ''}</b>
          ${p.kind === 'tile' ? `<button class="btn sm ghost" data-calc="${i}" title="${L('ক্যালকুলেটর', 'Calculator')}">📐</button>` : ''}<button class="btn sm ghost bad" data-rm="${i}">✕</button></div>
        <div class="grid" style="margin-top:6px">
          <div><input class="in sm" data-f="qty" value="${l.qty}" inputmode="decimal" placeholder="${L('পরিমাণ', 'Qty')}"><div class="small mute">${helper}</div></div>
          <div><select class="in sm" data-f="unit">${(p.units || []).map(x => `<option value="${esc(x.name)}" ${x.name === l.unit ? 'selected' : ''}>${esc(BX.unitLabel(x.name))}</option>`).join('')}</select></div>
          <div><input class="in sm" data-f="rate" value="${l.rate}" inputmode="decimal" title="${L('দর', 'Rate')}"><div class="small right"><b>${BX.tk(nv(l.qty) * nv(l.rate) - nv(l.discount))}</b></div></div>
        </div>
        ${l.batches && l.batches.length ? `<select class="in sm" data-f="batchshade" style="margin-top:4px">${l.batches.map(b => `<option value="${esc(b.batch)}|${esc(b.shade)}" ${b.batch === l.batch && b.shade === l.shade ? 'selected' : ''}>${L('ব্যাচ', 'Batch')}: ${esc(b.batch || '-')} • ${L('শেড', 'Shade')}: ${esc(b.shade || '-')} • ${L('স্টক', 'Stock')}: ${p.kind === 'tile' ? BX.boxPcs(b.qty, p) : BX.qty(b.qty)}</option>`).join('')}</select>` : ''}
      </div>`;
    }).join('');
    const pays = P.payments.map((p, i) => `<div class="row" style="margin-bottom:6px"><select class="in sm grow" data-pa="${i}">${accOptions(accs, p.account_id)}</select><input class="in sm" style="width:120px" data-pv="${i}" value="${p.amount}" inputmode="decimal" placeholder="0">${i > 0 ? `<button class="btn sm ghost bad" data-prm="${i}">✕</button>` : ''}</div>`).join('');
    const prevDue = cust ? cust.balance : 0;
    const dueNow = r2(t.total - t.paid);
    $('#cart', c).innerHTML = `<div class="card">
      <div class="row between"><h3 style="margin:0">🛒 ${isQuote ? L('কোটেশন', 'Quotation') : L('কার্ট', 'Cart')} (${BX.dg(P.items.length)})</h3>${P.items.length ? `<button class="btn sm ghost" id="clear">${L('খালি করুন', 'Clear')}</button>` : ''}</div>
      <div style="margin-top:10px">${lines || `<div class="empty">${L('পণ্যে ক্লিক করে কার্টে যোগ করুন', 'Tap a product to add it')}</div>`}</div>
      <div class="dd" style="margin-top:10px">
        ${cust ? `<div class="card" style="padding:10px;background:#f0fdfa"><div class="row between"><div><b>👤 ${esc(cust.name)}</b> <span class="small mute">${BX.dg(esc(cust.phone || ''))}</span>
            <div class="small">${L('পূর্বের বাকি', 'Previous due')}: <b class="${prevDue > 0 ? 'bad' : 'ok'}">${BX.tk(prevDue)}</b>${cust.credit_limit > 0 ? ` • ${L('লিমিট', 'Limit')}: ${BX.tk(cust.credit_limit)}` : ''}</div></div><button class="btn sm ghost" id="custX">✕</button></div></div>`
        : `<div class="row"><input class="in grow" id="custQ" placeholder="👤 ${L('কাস্টমার খুঁজুন (নাম/মোবাইল)', 'Find customer (name/mobile)')}" autocomplete="off"><button class="btn" id="custNew">➕</button></div><div class="dd-list hidden" id="custList"></div>
          <div class="grid g2" style="margin-top:6px"><input class="in sm" id="wName" placeholder="${L('ওয়াক-ইন নাম (ঐচ্ছিক)', 'Walk-in name (optional)')}" value="${esc(P.walkin.name)}"><input class="in sm" id="wPhone" placeholder="${L('মোবাইল (ঐচ্ছিক)', 'Mobile (optional)')}" value="${esc(P.walkin.phone)}" inputmode="tel"></div>`}
      </div>
      ${isQuote ? `<div class="grid g2" style="margin-top:8px"><input class="in sm" id="qProj" placeholder="${L('প্রজেক্ট/সাইটের নাম', 'Project / site name')}" value="${esc(P.project_name)}"><div class="row"><span class="small">${L('মেয়াদ', 'Valid till')}</span><input type="date" class="in sm grow" id="qValid" value="${P.valid_until}"></div></div>` : ''}
      <table class="totals" style="width:100%;margin-top:10px">
        <tr><td>${L('সাবটোটাল', 'Subtotal')}</td><td class="right">${BX.tk(t.sub)}</td></tr>
        <tr><td><div class="row">${L('ডিসকাউন্ট', 'Discount')} <select class="in sm" id="discT" style="width:auto"><option value="amt">৳</option><option value="percent" ${P.discount_type === 'percent' ? 'selected' : ''}>%</option></select></div></td><td class="right"><input class="in sm right" id="disc" value="${P.discount}" style="width:110px" inputmode="decimal" placeholder="0"></td></tr>
        <tr><td>${L('ভ্যাট %', 'VAT %')}</td><td class="right"><input class="in sm right" id="vat" value="${P.vat_percent}" style="width:110px" inputmode="decimal"> ${t.vat ? `<div class="small">${BX.tk(t.vat)}</div>` : ''}</td></tr>
        <tr><td><label class="chk"><input type="checkbox" id="delOn" ${P.delivery.enabled ? 'checked' : ''}> 🚚 ${L('ডেলিভারি চার্জ', 'Delivery charge')}</label></td><td class="right"><input class="in sm right" id="delC" value="${P.delivery_charge}" style="width:110px" inputmode="decimal" placeholder="0"></td></tr>
        ${P.delivery.enabled ? `<tr><td colspan="2"><div class="grid g2"><input class="in sm" id="delA" placeholder="${L('ডেলিভারি ঠিকানা', 'Delivery address')}" value="${esc(P.delivery.address || (cust ? cust.address || '' : ''))}"><input class="in sm" id="delP" placeholder="${L('ডেলিভারি ম্যান/গাড়ি', 'Delivery person/vehicle')}" value="${esc(P.delivery.person)}"></div></td></tr>` : ''}
        <tr class="gt"><td>${L('মোট', 'Total')}</td><td class="right">${BX.tk(t.total)}</td></tr>
      </table>
      ${isQuote ? '' : `<div style="margin-top:10px"><div class="row between"><b>💳 ${L('পেমেন্ট', 'Payment')}</b><div class="row">
          <button class="btn sm" id="pFull">${L('পুরো টাকা', 'Full paid')}</button>${cust && prevDue > 0 ? `<button class="btn sm" id="pFullPrev">${L('বাকিসহ', '+ prev due')}</button>` : ''}<button class="btn sm" id="pDue">${L('পুরো বাকি', 'Full due')}</button></div></div>
        <div style="margin-top:8px">${pays}</div><button class="btn sm ghost" id="pAdd">➕ ${L('আরেকটি পেমেন্ট মাধ্যম (বিকাশ/নগদ/ব্যাংক)', 'Split payment (bKash/Nagad/Bank)')}</button>
        <div class="row between" style="margin-top:8px;font-size:16px"><span>${dueNow > 0 ? L('বাকি থাকবে', 'Due') : dueNow < 0 ? (cust ? L('পূর্বের বাকি থেকে কাটবে / অগ্রিম', 'Goes to previous due / advance') : L('ফেরত দিন (চেঞ্জ)', 'Change to return')) : L('সম্পূর্ণ পরিশোধ', 'Fully paid')}</span><b class="${dueNow > 0 ? 'bad' : 'ok'}">${BX.tk(Math.abs(dueNow))}</b></div>
        ${cust ? `<div class="row between small mute"><span>${L('বিক্রির পর কাস্টমারের মোট বাকি', 'Customer balance after sale')}</span><b>${BX.tk(prevDue + dueNow)}</b></div>` : ''}</div>`}
      <div class="row" style="margin-top:8px"><input class="in sm grow" id="pNote" placeholder="${L('নোট (ঐচ্ছিক)', 'Note (optional)')}" value="${esc(P.note)}">${isQuote ? '' : `<input type="date" class="in sm" id="pDate" value="${P.date}" style="width:auto" title="${L('তারিখ', 'Date')}">`}</div>
      <div class="row" style="margin-top:12px">
        ${isQuote ? `<button class="btn pri lg grow" id="saveQuote">💾 ${L('কোটেশন সেভ ও প্রিন্ট', 'Save & print quotation')}</button>`
        : `${can('quotation') && !P.quotation_id ? `<button class="btn lg" id="toQuote" title="${L('কোটেশন হিসেবে সেভ', 'Save as quotation')}">📝</button>` : ''}<button class="btn pri lg grow" id="saveSale" ${P.items.length ? '' : 'disabled'}>✅ ${L('বিক্রি সম্পন্ন করুন', 'Complete sale')} ${BX.tk(t.total)}</button>`}
      </div></div>`;
    const fab = $('#cartFab', c);
    fab.textContent = `🛒 ${BX.dg(P.items.length)} • ${BX.tk(t.total)}`;
    fab.classList.toggle('hidden', !!APP._cartVis || !(window.innerWidth <= 1100 && P.items.length));
    bindCart();
  };

  const bindCart = () => {
    const root = $('#cart', c);
    $$('.cart-line', root).forEach(el => {
      const i = +el.dataset.i, l = P.items[i], p = pmap[l.product_id];
      $$('[data-f]', el).forEach(inp => {
        inp.onchange = () => {
          const f = inp.dataset.f;
          if (f === 'unit') { l.unit = inp.value; l.rate = r2(unitPrice(p, l.unit, P.sale_type)); }
          else if (f === 'batchshade') { const [b, s] = inp.value.split('|'); l.batch = b; l.shade = s; }
          else l[f] = BX.toEnDigits(inp.value);
          posSave(); drawCart();
        };
      });
    });
    $$('[data-rm]', root).forEach(b => (b.onclick = () => { P.items.splice(+b.dataset.rm, 1); posSave(); drawCart(); }));
    $$('[data-calc]', root).forEach(b => (b.onclick = () => { const l = P.items[+b.dataset.calc]; tileCalcModal(pmap[l.product_id], r => { l.unit = 'box'; l.qty = r.boxes; l.rate = r2(unitPrice(pmap[l.product_id], 'box', P.sale_type)); posSave(); drawCart(); }); }));
    const clr = $('#clear', root); if (clr) clr.onclick = async () => { if (await BX.confirm(L('কার্ট খালি করবেন?', 'Clear the cart?'))) { APP.pos = P = Object.assign(posNew(P.mode), { payments: [{ account_id: cashId(accs), amount: '' }] }); posSave(); drawCart(); } };
    const set = (id, fn) => { const e = $(id, root); if (e) e.onchange = () => { fn(e); posSave(); drawCart(); }; };
    set('#disc', e => (P.discount = BX.toEnDigits(e.value)));
    set('#discT', e => (P.discount_type = e.value));
    set('#vat', e => (P.vat_percent = BX.toEnDigits(e.value)));
    set('#delC', e => (P.delivery_charge = BX.toEnDigits(e.value)));
    set('#delOn', e => (P.delivery.enabled = e.checked));
    set('#delA', e => (P.delivery.address = e.value));
    set('#delP', e => (P.delivery.person = e.value));
    set('#pNote', e => (P.note = e.value));
    set('#pDate', e => (P.date = e.value));
    set('#wName', e => (P.walkin.name = e.value));
    set('#wPhone', e => (P.walkin.phone = BX.toEnDigits(e.value)));
    set('#qProj', e => (P.project_name = e.value));
    set('#qValid', e => (P.valid_until = e.value));
    $$('[data-pa]', root).forEach(e => (e.onchange = () => { P.payments[+e.dataset.pa].account_id = e.value; posSave(); }));
    $$('[data-pv]', root).forEach(e => (e.onchange = () => { P.payments[+e.dataset.pv].amount = BX.toEnDigits(e.value); posSave(); drawCart(); }));
    $$('[data-prm]', root).forEach(e => (e.onclick = () => { P.payments.splice(+e.dataset.prm, 1); posSave(); drawCart(); }));
    const t = posTotals(P);
    const on = (id, fn) => { const e = $(id, root); if (e) e.onclick = fn; };
    on('#pAdd', () => { const used = P.payments.map(p => String(p.account_id)); const nx = accs.find(a => !used.includes(String(a.id))) || accs[0]; P.payments.push({ account_id: nx.id, amount: '' }); posSave(); drawCart(); });
    on('#pFull', () => { P.payments.forEach((p, i) => (p.amount = i === 0 ? t.total : '')); posSave(); drawCart(); });
    on('#pFullPrev', () => { P.payments.forEach((p, i) => (p.amount = i === 0 ? r2(t.total + P.customer.balance) : '')); posSave(); drawCart(); });
    on('#pDue', () => { P.payments.forEach(p => (p.amount = '')); posSave(); drawCart(); });
    on('#custX', () => { P.customer = null; posSave(); drawCart(); });
    on('#custNew', () => customerForm(null, cst => { P.customer = { ...cst, balance: cst.balance || 0 }; posSave(); drawCart(); }));
    on('#saveSale', saveSale);
    on('#saveQuote', saveQuote);
    on('#toQuote', () => { P.mode = 'quote'; posSave(); go('pos?mode=quote'); });
    const cq = $('#custQ', root);
    if (cq) {
      const list = $('#custList', root);
      cq.oninput = BX.debounce(async () => {
        const v = cq.value.trim();
        if (!v) { list.classList.add('hidden'); return; }
        const rows = await BX.get('/api/customers?q=' + encodeURIComponent(BX.toEnDigits(v)));
        list.innerHTML = rows.slice(0, 15).map((r, i) => `<div data-i="${i}"><b>${esc(r.name)}</b> <span class="small mute">${BX.dg(esc(r.phone || ''))}</span><span class="small ${r.balance > 0 ? 'bad' : 'mute'}" style="float:right">${L('বাকি', 'Due')} ${BX.tk(r.balance)}</span></div>`).join('') || `<div class="mute">${L('পাওয়া যায়নি — ➕ চাপুন', 'Not found — press ➕')}</div>`;
        list.classList.remove('hidden');
        $$('[data-i]', list).forEach(d => (d.onclick = () => { P.customer = rows[+d.dataset.i]; if (P.customer.type === 'wholesale' && P.sale_type !== 'wholesale') setType('wholesale'); posSave(); drawCart(); }));
      }, 250);
      cq.onblur = () => setTimeout(() => list.classList.add('hidden'), 200);
    }
    const ex = $('#exitQuote'); if (ex) ex.onclick = e => { e.preventDefault(); sessionStorage.removeItem(POS_KEY()); go('pos'); };
  };

  const setType = st => {
    P.sale_type = st;
    P.items.forEach(l => { const p = pmap[l.product_id]; if (p) l.rate = r2(unitPrice(p, l.unit, st)); });
    $$('[data-st]', c).forEach(b => b.classList.toggle('on', b.dataset.st === st));
    posSave(); drawGrid(); drawCart();
  };

  const payload = () => {
    const t = posTotals(P);
    return {
      date: P.date, customer_id: P.customer ? P.customer.id : null, customer_name: P.walkin.name, customer_phone: P.walkin.phone, sale_type: P.sale_type,
      items: P.items.map(l => ({ product_id: l.product_id, unit: l.unit, qty: nv(l.qty), rate: nv(l.rate), discount: nv(l.discount), batch: l.batch, shade: l.shade })),
      discount: nv(P.discount), discount_type: P.discount_type === 'percent' ? 'percent' : 'amount', vat_percent: nv(P.vat_percent), delivery_charge: t.del,
      payments: P.payments.filter(p => nv(p.amount) > 0).map(p => ({ account_id: p.account_id, amount: nv(p.amount) })), note: P.note,
      delivery: { enabled: P.delivery.enabled, address: P.delivery.address || (P.customer ? P.customer.address : ''), person: P.delivery.person },
      quotation_id: P.quotation_id, project_name: P.project_name, valid_until: P.valid_until,
    };
  };

  async function saveSale(e, force) {
    if (!P.items.length) return;
    const btn = $('#saveSale', c); btn.disabled = true;
    try {
      const body = payload(); if (force) body.force = true;
      const r = await BX.post('/api/sales', body);
      sessionStorage.removeItem(POS_KEY());
      APP.drop('products', 'accounts');
      BX.modal({
        title: '✅ ' + L('বিক্রি সম্পন্ন', 'Sale completed'), body: `<div class="center"><div style="font-size:44px">🎉</div><div class="big">${esc(r.invoice_no)}</div><p class="mute">${L('ইনভয়েস প্রিন্ট করুন বা কাস্টমারকে পাঠান', 'Print the invoice or send it to the customer')}</p></div>`,
        onClose: () => route(),
        buttons: [{ label: '🖨 A4', onClick: () => printSale(r.id, 'a4') }, { label: '🖨 POS', onClick: () => printSale(r.id, 'pos80') }, { label: '👁 ' + L('দেখুন', 'View'), onClick: c2 => { c2(); viewSale(r.id); } }, { label: '➕ ' + L('নতুন বিক্রি', 'New sale'), cls: 'pri', onClick: c2 => c2() }],
      });
    } catch (err) {
      if (err.code === 'credit_limit') { if (await BX.confirm(esc(err.message) + '<br><br>' + L('তবুও বিক্রি করবেন?', 'Continue anyway?'))) return saveSale(null, true); }
      else BX.err(err);
    } finally { if (btn.isConnected) btn.disabled = false; }
  }
  async function saveQuote() {
    if (!P.items.length) return BX.toast(L('পণ্য যোগ করুন', 'Add products'), 'bad');
    const body = payload();
    const r = P.quote_edit_id ? await BX.put('/api/quotations/' + P.quote_edit_id, body) : await BX.post('/api/quotations', body);
    sessionStorage.removeItem(POS_KEY());
    BX.toast(L('কোটেশন সেভ হয়েছে', 'Quotation saved') + ' ' + r.quote_no, 'ok');
    printQuote(r.id || P.quote_edit_id);
    go('quotations');
  }

  $('#psearch', c).oninput = BX.debounce(e => { q = $('#psearch', c).value.trim(); drawGrid(); }, 120);
  $('#psearch', c).onkeydown = async e => {
    if (e.key !== 'Enter') return;
    const v = BX.toEnDigits(e.target.value.trim()); if (!v) return;
    const exact = products.find(p => p.barcode === v || p.sku === v);
    if (exact) { addItem(exact); e.target.value = ''; q = ''; drawGrid(); return; }
    const ql = v.toLowerCase();
    const first = products.find(p => (p.name + ' ' + (p.size || '')).toLowerCase().includes(ql));
    if (first) addItem(first);
  };
  $$('#cats .chip', c).forEach(ch => (ch.onclick = () => { cat = ch.dataset.c; $$('#cats .chip', c).forEach(x => x.classList.toggle('on', x === ch)); drawGrid(); }));
  $$('[data-st]', c).forEach(b => (b.onclick = () => setType(b.dataset.st)));
  $('#cartFab', c).onclick = () => $('#cart', c).scrollIntoView({ behavior: 'smooth' });
  APP._cartVis = false;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { APP._cartVis = es[0].isIntersecting; const f = $('#cartFab', c); if (f) f.classList.toggle('hidden', APP._cartVis || !(window.innerWidth <= 1100 && P.items.length)); }).observe($('#cart', c));
  drawGrid(); drawCart();
  // add from calculator / other pages
  if (APP.pendingAdd) { const pa = APP.pendingAdd; APP.pendingAdd = null; for (const x of pa) await addItem(pmap[x.product_id], x.qty, x.unit); }
  if (window.innerWidth > 1100) $('#psearch', c).focus();
};

// ================= SALES LIST =================
PAGES.sales = async (c, params) => {
  let from = params.from || BX.addDays(BX.today(), -6), to = params.to || BX.today(), qtxt = '', dueOnly = false;
  c.innerHTML = `<div class="page-head"><h2>📄 ${L('বিক্রির তালিকা', 'Sales list')}</h2><div class="row">${dateRangeHtml(from, to)}${can('pos') ? `<a class="btn pri" href="#/pos">➕ ${L('নতুন বিক্রি', 'New sale')}</a>` : ''}</div></div>
    <div class="row" style="margin-bottom:10px"><input class="in grow" id="sq" placeholder="🔍 ${L('ইনভয়েস নং, কাস্টমারের নাম বা মোবাইল', 'Invoice no, customer name or mobile')}"><label class="chk"><input type="checkbox" id="sdue"> ${L('শুধু বাকি', 'Due only')}</label></div><div id="sl"></div>`;
  const load = async () => {
    const rows = await BX.get(`/api/sales?from=${from}&to=${to}&q=${encodeURIComponent(BX.toEnDigits(qtxt))}${dueOnly ? '&due=1' : ''}`);
    $('#sl', c).innerHTML = BX.table([
      { h: L('ইনভয়েস', 'Invoice'), k: 'invoice_no', f: r => `<b>${esc(r.invoice_no)}</b><div class="small mute">${BX.date(r.date)}</div>` },
      { h: L('কাস্টমার', 'Customer'), k: 'customer_name', f: r => esc(r.customer_name) + `<div class="small mute">${BX.dg(esc(r.customer_phone || ''))}</div>` },
      { h: L('ধরন', 'Type'), f: r => (r.sale_type === 'wholesale' ? `<span class="badge info">${L('পাইকারি', 'Wholesale')}</span>` : `<span class="badge">${L('খুচরা', 'Retail')}</span>`) + (r.delivery_status !== 'none' ? ' 🚚' : '') },
      { h: L('মোট', 'Total'), n: 1, k: 'total', f: r => BX.tk(r.total) + (r.returned > 0 ? `<div class="small bad">↩ ${BX.tk(r.returned)}</div>` : '') },
      { h: L('জমা', 'Paid'), n: 1, k: 'paid', f: r => BX.tk(r.paid) },
      { h: L('বাকি', 'Due'), n: 1, k: 'due', f: r => (r.due > 0 ? `<b class="bad">${BX.tk(r.due)}</b>` : `<span class="badge ok">${L('পরিশোধিত', 'Paid')}</span>`) },
      { h: L('বিক্রেতা', 'By'), f: r => `<span class="small">${esc(r.user_name || '')}</span>` },
      { h: '', f: r => `<button class="btn sm" data-pr="${r.id}">🖨</button>` },
    ], rows, { click: 1, foot: { invoice_no: '', customer_name: L('মোট', 'Total') + ' ' + BX.dg(rows.length), total: BX.tk(BX.sum(rows, 'total')), paid: BX.tk(BX.sum(rows, 'paid')), due: BX.tk(BX.sum(rows, 'due')) } });
    BX.bindRows($('#sl', c), rows, r => viewSale(r.id));
    $$('[data-pr]', c).forEach(b => (b.onclick = () => printSale(b.dataset.pr)));
  };
  bindRange(c, (a, b) => { from = a; to = b; load(); });
  $('#sq', c).oninput = BX.debounce(() => { qtxt = $('#sq', c).value.trim(); load(); }, 300);
  $('#sdue', c).onchange = e => { dueOnly = e.target.checked; load(); };
  load();
};

PAGES.returns = async c => {
  let from = BX.addDays(BX.today(), -30), to = BX.today();
  c.innerHTML = `<div class="page-head"><h2>↩️ ${L('বিক্রয় ফেরত', 'Sales returns')}</h2><div class="row">${dateRangeHtml(from, to)}${can('sales_return') ? `<button class="btn pri" id="newRet">➕ ${L('নতুন ফেরত', 'New return')}</button>` : ''}</div></div><div id="rl"></div>`;
  const load = async () => {
    const rows = await BX.get(`/api/returns?from=${from}&to=${to}`);
    $('#rl', c).innerHTML = BX.table([{ h: L('ফেরত নং', 'Return no'), k: 'return_no' }, { h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('ইনভয়েস', 'Invoice'), k: 'invoice_no' }, { h: L('কাস্টমার', 'Customer'), k: 'customer_name' },
      { h: L('পণ্য', 'Items'), f: r => (r.items || []).map(i => `${esc(i.name)} × ${BX.qty(i.qty)} ${esc(BX.unitLabel(i.unit))}${i.restock ? '' : ' <span class="badge bad">' + L('ভাঙা', 'broken') + '</span>'}`).join('<br>') },
      { h: L('মূল্য', 'Value'), n: 1, k: 'total', f: r => BX.tk(r.total) }, { h: L('টাকা ফেরত', 'Refund'), n: 1, k: 'refund', f: r => BX.tk(r.refund) }, { h: L('নোট', 'Note'), k: 'note' }], rows, { foot: { total: BX.tk(BX.sum(rows, 'total')), refund: BX.tk(BX.sum(rows, 'refund')) } });
  };
  bindRange(c, (a, b) => { from = a; to = b; load(); });
  const nb = $('#newRet', c);
  if (nb) nb.onclick = () => BX.formModal(L('কোন ইনভয়েস থেকে ফেরত?', 'Return from which invoice?'), [{ k: 'inv', label: L('ইনভয়েস নং', 'Invoice no'), req: 1, full: 1, ph: 'INV-00012' }], {}, async v => {
    const rows = await BX.get('/api/sales?q=' + encodeURIComponent(v.inv.trim()));
    const s = rows.find(r => r.invoice_no.toLowerCase() === v.inv.trim().toLowerCase()) || rows[0];
    if (!s) throw new Error(L('ইনভয়েস পাওয়া যায়নি', 'Invoice not found'));
    returnModal(await BX.get('/api/sales/' + s.id));
  });
  load();
};

// ================= QUOTATIONS =================
async function printQuote(id) {
  const qt = await BX.get('/api/quotations/' + id);
  const st = S();
  const html = withLang(st.invoice_lang || 'bn', () => {
    const rows = qt.items.map((it, i) => `<tr><td>${BX.dg(i + 1)}</td><td>${it.room ? `<b>${esc(it.room)}</b><br>` : ''}${esc(it.name)}${it.area ? `<div class="muted" style="font-size:11px">${L('এরিয়া', 'Area')}: ${esc(it.area)}</div>` : ''}</td><td class="n">${BX.qty(it.qty)} ${esc(BX.unitLabel(it.unit))}${it.kind === 'tile' && it.unit !== 'sqft' ? `<div class="muted" style="font-size:11px">${BX.qty(it.qty * it.factor)} sqft</div>` : ''}</td><td class="n">${BX.num(it.rate)}</td><td class="n">${BX.num(it.total)}</td></tr>`).join('');
    return shopHeader(L('কোটেশন / এস্টিমেট', 'QUOTATION / ESTIMATE')) +
      `<table style="margin-bottom:8px"><tr><td><b>${L('প্রতি', 'To')}:</b> ${esc(qt.customer_name || '')}<br>${BX.dg(esc(qt.customer_phone || ''))}<br>${esc(qt.customer_address || '')}${qt.project_name ? `<br><b>${L('প্রজেক্ট', 'Project')}:</b> ${esc(qt.project_name)}` : ''}</td>
      <td style="text-align:right"><b>${L('কোটেশন নং', 'Quote No')}:</b> ${esc(qt.quote_no)}<br><b>${L('তারিখ', 'Date')}:</b> ${BX.date(qt.date)}<br><b>${L('মেয়াদ', 'Valid till')}:</b> ${BX.date(qt.valid_until)}</td></tr></table>
      <table class="items"><thead><tr><th>#</th><th>${L('বিবরণ', 'Description')}</th><th class="n">${L('পরিমাণ', 'Qty')}</th><th class="n">${L('দর', 'Rate')}</th><th class="n">${L('টাকা', 'Amount')}</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="tot" style="width:320px;margin-left:auto;margin-top:8px"><tr><td>${L('সাবটোটাল', 'Subtotal')}</td><td class="n">${BX.num(qt.subtotal)}</td></tr>${qt.discount > 0 ? `<tr><td>${L('ডিসকাউন্ট', 'Discount')}</td><td class="n">- ${BX.num(qt.discount)}</td></tr>` : ''}${qt.vat > 0 ? `<tr><td>${L('ভ্যাট', 'VAT')}</td><td class="n">${BX.num(qt.vat)}</td></tr>` : ''}${qt.delivery_charge > 0 ? `<tr><td>${L('ডেলিভারি', 'Delivery')}</td><td class="n">${BX.num(qt.delivery_charge)}</td></tr>` : ''}<tr class="g"><td>${L('মোট', 'Total')}</td><td class="n">৳${BX.num(qt.total)}</td></tr></table>
      <div><b>${L('কথায়', 'In words')}:</b> ${BX.words(qt.total)}</div>${qt.note ? `<p>${esc(qt.note)}</p>` : ''}
      <p class="muted" style="font-size:12px">${L('* দাম পরিবর্তনশীল। স্টক থাকা সাপেক্ষে।', '* Prices subject to change and stock availability.')}</p><div class="sig"><div>${L('গ্রহণকারী', 'Received by')}</div><div>${L('কর্তৃপক্ষের স্বাক্ষর', 'Authorised signature')}</div></div>`;
  });
  BX.print(html, qt.quote_no, 'a4');
}
async function quoteToPos(id, asSale) {
  const qt = await BX.get('/api/quotations/' + id);
  const accs = await APP.load('accounts');
  const P = posNew(asSale ? 'sale' : 'quote');
  P.items = qt.items.map(i => ({ product_id: i.product_id, unit: i.unit, qty: i.qty, rate: i.rate, discount: i.discount || 0, batch: i.batch || '', shade: i.shade || '', batches: [], room: i.room, area: i.area }));
  P.sale_type = qt.sale_type; P.discount = qt.discount || ''; P.delivery_charge = qt.delivery_charge || ''; P.note = qt.note || '';
  P.vat_percent = qt.subtotal - qt.discount > 0 ? r2(qt.vat / (qt.subtotal - qt.discount) * 100) : 0;
  P.walkin = { name: qt.customer_name || '', phone: qt.customer_phone || '', address: qt.customer_address || '' };
  P.project_name = qt.project_name || ''; P.valid_until = qt.valid_until;
  if (qt.customer_id) { const cs = await BX.get('/api/customers?q=' + encodeURIComponent(qt.customer_phone || qt.customer_name)); P.customer = cs.find(x => x.id === qt.customer_id) || null; }
  if (asSale) { P.quotation_id = qt.id; P.payments = [{ account_id: cashId(accs), amount: '' }]; } else P.quote_edit_id = qt.id;
  APP.pos = P; posSave();
  go(asSale ? 'pos?keep=1' : 'pos?mode=quote');
}
PAGES.quotations = async c => {
  const rows = await BX.get('/api/quotations');
  const stB = { open: `<span class="badge warn">${L('খোলা', 'Open')}</span>`, converted: `<span class="badge ok">${L('বিক্রি হয়েছে', 'Converted')}</span>`, cancelled: `<span class="badge bad">${L('বাতিল', 'Cancelled')}</span>` };
  c.innerHTML = `<div class="page-head"><h2>📝 ${L('কোটেশন / প্রজেক্ট এস্টিমেট', 'Quotations / project estimates')}</h2><div class="row"><a class="btn" href="#/calculator">📐 ${L('রুম অনুযায়ী এস্টিমেট', 'Room-wise estimate')}</a><button class="btn pri" id="nq">➕ ${L('নতুন কোটেশন', 'New quotation')}</button></div></div>
    ${BX.table([{ h: L('নং', 'No'), f: r => `<b>${esc(r.quote_no)}</b><div class="small mute">${BX.date(r.date)}</div>` }, { h: L('কাস্টমার', 'Customer'), f: r => esc(r.customer_name || '-') + `<div class="small mute">${BX.dg(esc(r.customer_phone || ''))}</div>` }, { h: L('প্রজেক্ট', 'Project'), k: 'project_name' },
      { h: L('মোট', 'Total'), n: 1, f: r => BX.tk(r.total) }, { h: L('মেয়াদ', 'Valid'), f: r => BX.date(r.valid_until) }, { h: L('স্ট্যাটাস', 'Status'), f: r => stB[r.status] || r.status },
      { h: '', f: r => `<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-p="${r.id}">🖨</button>${r.status === 'open' ? `<button class="btn sm" data-e="${r.id}">✏️</button>${can('pos') ? `<button class="btn sm ok" data-s="${r.id}">🧾 ${L('বিক্রি', 'Sell')}</button>` : ''}<button class="btn sm ghost" data-x="${r.id}">✕</button>` : ''}</div>` }], rows)}`;
  $('#nq', c).onclick = () => { sessionStorage.removeItem(POS_KEY()); go('pos?mode=quote'); };
  $$('[data-p]', c).forEach(b => (b.onclick = () => printQuote(b.dataset.p)));
  $$('[data-e]', c).forEach(b => (b.onclick = () => quoteToPos(b.dataset.e, false)));
  $$('[data-s]', c).forEach(b => (b.onclick = () => quoteToPos(b.dataset.s, true)));
  $$('[data-x]', c).forEach(b => (b.onclick = async () => { if (await BX.confirm(L('কোটেশন বাতিল করবেন?', 'Cancel this quotation?'))) { await BX.put(`/api/quotations/${b.dataset.x}/status`, { status: 'cancelled' }); route(); } }));
};

// ================= PRODUCTS =================
const KINDS = () => [['tile', L('টাইলস', 'Tile')], ['sanitary', L('স্যানিটারি', 'Sanitary')], ['hardware', L('হার্ডওয়্যার', 'Hardware')], ['general', L('সাধারণ', 'General')]];
const UNIT_PRESETS = () => [
  ['pcs', L('পিস', 'Piece')], ['set', L('সেট', 'Set')], ['kg', L('কেজি', 'KG')], ['feet', L('ফুট', 'Feet')], ['meter', L('মিটার', 'Meter')], ['bag', L('ব্যাগ', 'Bag')], ['litre', L('লিটার', 'Litre')], ['ton', L('টন', 'Ton')], ['cft', 'CFT'], ['unit', L('ইউনিট', 'Unit')]];
const CONV_PRESETS = { pcs: [['dozen', 12], ['packet', 10], ['carton', 50]], kg: [['bag', 50], ['ton', 1000]], feet: [['meter', 3.28084], ['coil (90ft)', 90]], meter: [['coil (100m)', 100]], litre: [['gallon', 3.785]], bag: [], ton: [] };

async function productForm(id, onDone) {
  const [cats, brands] = await Promise.all([APP.load('categories'), APP.load('brands')]);
  const def = APP.me.tenant.business_type === 'hardware' ? 'hardware' : APP.me.tenant.business_type === 'sanitary' ? 'sanitary' : 'tile';
  const p = id ? await BX.get('/api/products/' + id) : { kind: def, base_unit: 'pcs', units: [], show_in_catalog: true, active: true };
  const extraUnits = (p.units || []).filter(u => u.name !== p.base_unit && p.kind !== 'tile');
  const tileU = n => (p.units || []).find(u => u.name === n) || {};
  const m = BX.modal({
    title: id ? '✏️ ' + L('পণ্য এডিট', 'Edit product') : '➕ ' + L('নতুন পণ্য', 'New product'), wide: 1, sticky: 1,
    body: `<div class="row" style="margin-bottom:12px"><span class="small b">${L('পণ্যের ধরন', 'Product type')}:</span><div class="seg" id="kind">${KINDS().map(k => `<button data-k="${k[0]}" class="${p.kind === k[0] ? 'on' : ''}">${k[1]}</button>`).join('')}</div></div>
    <div class="grid g3">
      <div class="f" style="grid-column:span 2"><label>${L('পণ্যের নাম', 'Product name')} *</label><input class="in" name="name" value="${esc(p.name || '')}" placeholder="${L('যেমন: RAK Floor Tiles Glossy', 'e.g. RAK Floor Tiles Glossy')}"></div>
      <div class="f"><label>${L('বাংলা নাম (ঐচ্ছিক)', 'Bangla name (optional)')}</label><input class="in" name="name_bn" value="${esc(p.name_bn || '')}"></div>
      <div class="f"><label>${L('ক্যাটাগরি', 'Category')}</label><div class="row" style="flex-wrap:nowrap"><select class="in" name="category_id"><option value="">—</option>${cats.map(x => `<option value="${x.id}" ${x.id === p.category_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="btn sm" id="addCat">➕</button></div></div>
      <div class="f"><label>${L('ব্র্যান্ড / কোম্পানি', 'Brand / company')}</label><div class="row" style="flex-wrap:nowrap"><select class="in" name="brand_id"><option value="">—</option>${brands.map(x => `<option value="${x.id}" ${x.id === p.brand_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="btn sm" id="addBrand">➕</button></div></div>
      <div class="f"><label>${L('সাইজ / মডেল', 'Size / model')}</label><input class="in" name="size" value="${esc(p.size || '')}" placeholder="24x24, 12x18, 600x600mm"></div>
    </div>
    <div id="tileBox" class="card" style="margin-top:12px;background:#f0fdfa">
      <b>🧱 ${L('টাইলসের হিসাব', 'Tile measurement')}</b> <span class="small mute">${L('স্টক রাখা হবে স্কয়ার ফিটে, বিক্রি করা যাবে বক্স/পিস/স্কয়ার ফিটে', 'Stock kept in sqft; sell by box / piece / sqft')}</span>
      <div class="grid g4" style="margin-top:8px">
        <div class="f"><label>${L('টাইলস সাইজ (ইঞ্চি)', 'Tile size (inch)')}</label><div class="row" style="flex-wrap:nowrap"><input class="in" id="tw" inputmode="decimal" placeholder="24"> × <input class="in" id="th" inputmode="decimal" placeholder="24"></div><span class="small mute">${L('মিমি হলে ২৫.৪ দিয়ে ভাগ', 'For mm divide by 25.4')}</span></div>
        <div class="f"><label>${L('প্রতি পিসে স্কয়ার ফিট', 'Sqft per piece')} *</label><input class="in" name="sqft_per_pcs" value="${p.sqft_per_pcs || ''}" inputmode="decimal"></div>
        <div class="f"><label>${L('প্রতি বক্সে পিস', 'Pieces per box')} *</label><input class="in" name="pcs_per_box" value="${p.pcs_per_box || ''}" inputmode="decimal"></div>
        <div class="f"><label>${L('প্রতি বক্সে স্কয়ার ফিট', 'Sqft per box')}</label><div class="big" id="spb">-</div></div>
      </div></div>
    <div id="unitBox" class="card" style="margin-top:12px;background:#f9fafb">
      <div class="row"><b>📏 ${L('মূল ইউনিট (স্টক এই ইউনিটে)', 'Base unit (stock kept in)')}</b><select class="in sm" name="base_unit" style="width:auto">${UNIT_PRESETS().map(u => `<option value="${u[0]}" ${u[0] === p.base_unit ? 'selected' : ''}>${u[1]}</option>`).join('')}${UNIT_PRESETS().find(u => u[0] === p.base_unit) ? '' : `<option selected>${esc(p.base_unit)}</option>`}</select></div>
      <div class="small mute" style="margin:6px 0">${L('অন্য ইউনিট (যেমন: ১ ব্যাগ = ৫০ কেজি, ১ ডজন = ১২ পিস)। ক্রয় ও বিক্রিতে অটো কনভার্ট হবে।', 'Other units (e.g. 1 bag = 50 kg, 1 dozen = 12 pcs). Converted automatically in purchase & sale.')}</div>
      <div id="units"></div><button class="btn sm" id="addUnit">➕ ${L('ইউনিট যোগ', 'Add unit')}</button> <span id="presetBtns"></span></div>
    <div class="grid g4" style="margin-top:12px">
      <div class="f"><label id="lblPP">${L('ক্রয় মূল্য', 'Purchase price')}</label><input class="in" name="purchase_price" value="${p.purchase_price || ''}" inputmode="decimal"></div>
      <div class="f"><label id="lblRP">${L('খুচরা বিক্রয় মূল্য', 'Retail price')} *</label><input class="in" name="retail_price" value="${p.retail_price || ''}" inputmode="decimal"></div>
      <div class="f"><label id="lblWP">${L('পাইকারি মূল্য', 'Wholesale price')}</label><input class="in" name="wholesale_price" value="${p.wholesale_price || ''}" inputmode="decimal"></div>
      <div class="f"><label>${L('ভ্যাট %', 'VAT %')}</label><input class="in" name="vat_percent" value="${p.vat_percent || 0}" inputmode="decimal"></div>
    </div>
    <div id="boxPrice" class="small mute" style="margin-top:4px"></div>
    <div class="grid g4" style="margin-top:12px">
      <div class="f"><label>${L('বিক্রির ডিফল্ট ইউনিট', 'Default sale unit')}</label><select class="in" name="sale_unit"></select></div>
      <div class="f"><label>${L('ক্রয়ের ডিফল্ট ইউনিট', 'Default purchase unit')}</label><select class="in" name="purchase_unit"></select></div>
      <div class="f"><label id="lblRL">${L('কম স্টক সতর্কতা (মূল ইউনিটে)', 'Low stock alert (base unit)')}</label><input class="in" name="reorder_level" value="${p.reorder_level || ''}" inputmode="decimal"></div>
      <div class="f"><label>${L('বারকোড / SKU', 'Barcode / SKU')}</label><div class="row" style="flex-wrap:nowrap"><input class="in" name="barcode" value="${esc(p.barcode || '')}"><button class="btn sm" id="genBc" title="${L('তৈরি করুন', 'Generate')}">⚡</button></div></div>
    </div>
    ${id ? '' : `<div class="card" style="margin-top:12px;background:#fffbeb"><b>📦 ${L('শুরুর স্টক (ঐচ্ছিক)', 'Opening stock (optional)')}</b><div class="grid g4" style="margin-top:8px">
      <div class="f"><label>${L('পরিমাণ', 'Quantity')}</label><input class="in" name="opening_stock" inputmode="decimal"></div>
      <div class="f"><label>${L('ইউনিট', 'Unit')}</label><select class="in" name="opening_unit"></select></div>
      <div class="f tileOnly"><label>${L('ব্যাচ নং', 'Batch no')}</label><input class="in" name="opening_batch"></div>
      <div class="f tileOnly"><label>${L('শেড', 'Shade')}</label><input class="in" name="opening_shade"></div></div></div>`}
    <div class="grid g2" style="margin-top:12px">
      <div class="f"><label>${L('বিবরণ', 'Description')}</label><textarea class="in" name="description">${esc(p.description || '')}</textarea></div>
      <div class="f"><label>${L('ছবি (অনলাইন ক্যাটালগের জন্য)', 'Photo (for online catalog)')}</label><input type="file" accept="image/*" id="img" class="in"><img id="imgPrev" style="max-height:80px;margin-top:6px;${p.image ? '' : 'display:none'}" src="${p.image || ''}">
        <label class="chk" style="margin-top:6px"><input type="checkbox" name="show_in_catalog" ${p.show_in_catalog !== false ? 'checked' : ''}> ${L('অনলাইন ক্যাটালগে দেখাবে', 'Show in online catalog')}</label></div>
    </div>`,
    buttons: [{ label: L('বাতিল', 'Cancel') }, { label: L('সেভ করুন', 'Save'), cls: 'pri', onClick: async (close, el) => {
      const v = { kind }; ['name', 'name_bn', 'category_id', 'brand_id', 'size', 'sqft_per_pcs', 'pcs_per_box', 'purchase_price', 'retail_price', 'wholesale_price', 'vat_percent', 'sale_unit', 'purchase_unit', 'reorder_level', 'barcode', 'description', 'base_unit', 'opening_stock', 'opening_batch', 'opening_shade'].forEach(k => { const e = $(`[name=${k}]`, el); if (e) v[k] = BX.toEnDigits(e.value.trim()); });
      v.show_in_catalog = $('[name=show_in_catalog]', el).checked;
      if (!v.name) throw new Error(L('পণ্যের নাম দিন', 'Enter product name'));
      v.units = units.filter(u => u.name && nv(u.factor) > 0).map(u => ({ name: u.name, factor: nv(u.factor), retail_price: nv(u.retail_price) || null, wholesale_price: nv(u.wholesale_price) || null }));
      if (kind === 'tile') { const bp = nv($('#bxRetail', el) && $('#bxRetail', el).value); v.units = bp ? [{ name: 'box', retail_price: bp, wholesale_price: nv($('#bxWhole', el).value) || null }] : []; }
      if (img !== undefined) v.image = img;
      const ou = $('[name=opening_unit]', el);
      if (ou && nv(v.opening_stock)) { const all = allUnits(); const u = all.find(x => x.name === ou.value); v.opening_factor = u ? nv(u.factor) : 1; }
      if (id) await BX.put('/api/products/' + id, v); else await BX.post('/api/products', v);
      APP.drop('products'); BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); close(); onDone && onDone();
    } }],
  });
  const el = m.el;
  let kind = p.kind, img;
  let units = extraUnits.map(u => ({ ...u }));
  const allUnits = () => {
    if (kind === 'tile') { const spp = nv($('[name=sqft_per_pcs]', el).value), ppb = nv($('[name=pcs_per_box]', el).value); return [{ name: 'box', factor: spp * ppb }, { name: 'pcs', factor: spp }, { name: 'sqft', factor: 1 }]; }
    return [{ name: $('[name=base_unit]', el).value, factor: 1 }].concat(units.filter(u => u.name));
  };
  const refreshSelects = () => {
    const all = allUnits();
    [['sale_unit', p.sale_unit], ['purchase_unit', p.purchase_unit], ['opening_unit', p.purchase_unit]].forEach(([k, defv]) => {
      const s = $(`[name=${k}]`, el); if (!s) return;
      const cur = s.value || defv || (kind === 'tile' ? 'box' : all[0].name);
      s.innerHTML = all.map(u => `<option value="${esc(u.name)}" ${u.name === cur ? 'selected' : ''}>${esc(BX.unitLabel(u.name))}</option>`).join('');
    });
  };
  const drawUnits = () => {
    $('#units', el).innerHTML = units.map((u, i) => `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><span>1</span><input class="in sm" data-u="name" data-i="${i}" value="${esc(u.name)}" placeholder="${L('ইউনিট (ব্যাগ)', 'unit (bag)')}" style="width:110px"><span>=</span><input class="in sm" data-u="factor" data-i="${i}" value="${u.factor || ''}" inputmode="decimal" style="width:80px"><span class="small">${esc($('[name=base_unit]', el).value)}</span>
      <input class="in sm" data-u="retail_price" data-i="${i}" value="${u.retail_price || ''}" inputmode="decimal" placeholder="${L('খুচরা দাম', 'retail price')}" style="width:100px"><input class="in sm" data-u="wholesale_price" data-i="${i}" value="${u.wholesale_price || ''}" inputmode="decimal" placeholder="${L('পাইকারি', 'wholesale')}" style="width:90px"><button class="btn sm ghost bad" data-ux="${i}">✕</button></div>`).join('') + (units.length ? `<div class="small mute">${L('দাম খালি রাখলে মূল ইউনিটের দাম × পরিমাণ ধরা হবে', 'Leave price empty to use base price × factor')}</div>` : '');
    $$('[data-u]', el).forEach(i => (i.onchange = () => { units[+i.dataset.i][i.dataset.u] = BX.toEnDigits(i.value.trim()); refreshSelects(); }));
    $$('[data-ux]', el).forEach(b => (b.onclick = () => { units.splice(+b.dataset.ux, 1); drawUnits(); refreshSelects(); }));
    const base = $('[name=base_unit]', el).value;
    $('#presetBtns', el).innerHTML = (CONV_PRESETS[base] || []).filter(pr => !units.find(u => u.name === pr[0])).map(pr => `<button class="btn sm ghost" data-pr="${esc(pr[0])}|${pr[1]}">+ ${esc(pr[0])} (${BX.dg(pr[1])})</button>`).join('');
    $$('[data-pr]', el).forEach(b => (b.onclick = () => { const [nm, f] = b.dataset.pr.split('|'); units.push({ name: nm, factor: f }); drawUnits(); refreshSelects(); }));
  };
  const tileCalc = () => {
    const spp = nv($('[name=sqft_per_pcs]', el).value), ppb = nv($('[name=pcs_per_box]', el).value);
    $('#spb', el).textContent = spp && ppb ? BX.qty(spp * ppb) : '-';
    const rp = nv($('[name=retail_price]', el).value), wp = nv($('[name=wholesale_price]', el).value);
    const bU = tileU('box');
    $('#boxPrice', el).innerHTML = kind === 'tile' && spp && ppb ? `${L('প্রতি বক্স', 'Per box')}: ${L('খুচরা', 'retail')} <b>${BX.tk(rp * spp * ppb)}</b>, ${L('পাইকারি', 'wholesale')} <b>${BX.tk(wp * spp * ppb)}</b>, ${L('প্রতি পিস', 'per piece')} <b>${BX.tk(rp * spp)}</b>
      <div class="row" style="margin-top:4px"><span>${L('বক্সের নির্দিষ্ট দাম (ঐচ্ছিক)', 'Fixed box price (optional)')}:</span><input class="in sm" id="bxRetail" style="width:110px" placeholder="${L('খুচরা', 'retail')}" value="${bU.retail_price || ''}" inputmode="decimal"><input class="in sm" id="bxWhole" style="width:110px" placeholder="${L('পাইকারি', 'wholesale')}" value="${bU.wholesale_price || ''}" inputmode="decimal"></div>` : '';
    refreshSelects();
  };
  const setKind = k => {
    kind = k;
    $$('#kind button', el).forEach(b => b.classList.toggle('on', b.dataset.k === k));
    $('#tileBox', el).classList.toggle('hidden', k !== 'tile');
    $('#unitBox', el).classList.toggle('hidden', k === 'tile');
    $$('.tileOnly', el).forEach(x => x.classList.toggle('hidden', false));
    const per = k === 'tile' ? ' (' + L('প্রতি স্কয়ার ফিট', 'per sqft') + ')' : ' (' + L('প্রতি মূল ইউনিট', 'per base unit') + ')';
    $('#lblPP', el).textContent = L('ক্রয় মূল্য', 'Purchase price') + per;
    $('#lblRP', el).textContent = L('খুচরা মূল্য', 'Retail price') + per + ' *';
    $('#lblWP', el).textContent = L('পাইকারি মূল্য', 'Wholesale price') + per;
    $('#lblRL', el).textContent = L('কম স্টক সতর্কতা', 'Low stock alert') + (k === 'tile' ? ' (sqft)' : ' (' + L('মূল ইউনিট', 'base unit') + ')');
    tileCalc(); drawUnits(); refreshSelects();
  };
  $$('#kind button', el).forEach(b => (b.onclick = () => setKind(b.dataset.k)));
  const sizeCalc = () => { const w = nv($('#tw', el).value), h = nv($('#th', el).value); if (w && h) { $('[name=sqft_per_pcs]', el).value = Math.round(w * h / 144 * 10000) / 10000; if (!$('[name=size]', el).value) $('[name=size]', el).value = `${w}x${h}`; tileCalc(); } };
  $('#tw', el).oninput = $('#th', el).oninput = sizeCalc;
  const sz = String(p.size || '').match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (sz && Number(sz[1]) < 100) { $('#tw', el).value = sz[1]; $('#th', el).value = sz[2]; }
  ['sqft_per_pcs', 'pcs_per_box', 'retail_price', 'wholesale_price'].forEach(k => ($(`[name=${k}]`, el).oninput = tileCalc));
  $('[name=base_unit]', el).onchange = () => { drawUnits(); refreshSelects(); };
  $('#addUnit', el).onclick = () => { units.push({ name: '', factor: '' }); drawUnits(); };
  $('#genBc', el).onclick = () => { $('[name=barcode]', el).value = String(Date.now()).slice(-10); };
  $('#img', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; img = await BX.imageToData(f, 700); $('#imgPrev', el).src = img; $('#imgPrev', el).style.display = ''; };
  const quickAdd = (url, key, sel) => async () => { const name = prompt(L('নাম লিখুন', 'Enter name')); if (!name) return; const r = await BX.post(url, { name }); APP.drop(key); const s = $(sel, el); s.insertAdjacentHTML('beforeend', `<option value="${r.id}" selected>${esc(r.name)}</option>`); };
  $('#addCat', el).onclick = quickAdd('/api/categories', 'categories', '[name=category_id]');
  $('#addBrand', el).onclick = quickAdd('/api/brands', 'brands', '[name=brand_id]');
  setKind(kind);
}

PAGES.products = async c => {
  const [rows, cats] = await Promise.all([APP.load('products', true), APP.load('categories')]);
  let q = '', cat = '', kind = '';
  c.innerHTML = `<div class="page-head"><h2>📦 ${L('পণ্য', 'Products')} (${BX.dg(rows.length)})</h2><div class="row">
      ${can('products') ? `<button class="btn" id="mCat">🗂 ${L('ক্যাটাগরি', 'Categories')}</button><button class="btn" id="mBrand">🏷 ${L('ব্র্যান্ড', 'Brands')}</button><button class="btn" id="imp">⬆ ${L('ইমপোর্ট', 'Import')}</button>` : ''}
      <button class="btn" id="bc">🏷 ${L('বারকোড প্রিন্ট', 'Print barcodes')}</button>${can('products') ? `<button class="btn pri" id="np">➕ ${L('নতুন পণ্য', 'New product')}</button>` : ''}</div></div>
    <div class="row" style="margin-bottom:10px"><input class="in grow" id="q" placeholder="🔍 ${L('নাম, সাইজ, বারকোড…', 'Name, size, barcode…')}">
      <select class="in" id="fk" style="width:auto"><option value="">${L('সব ধরন', 'All types')}</option>${KINDS().map(k => `<option value="${k[0]}">${k[1]}</option>`).join('')}</select>
      <select class="in" id="fc" style="width:auto"><option value="">${L('সব ক্যাটাগরি', 'All categories')}</option>${cats.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><div id="pl"></div>`;
  const draw = () => {
    const ql = q.toLowerCase();
    const list = rows.filter(p => (!cat || String(p.category_id) === cat) && (!kind || p.kind === kind) && (!ql || (p.name + ' ' + (p.name_bn || '') + ' ' + (p.size || '') + ' ' + (p.barcode || '') + ' ' + (p.brand || '')).toLowerCase().includes(ql)));
    $('#pl', c).innerHTML = BX.table([
      { h: L('পণ্য', 'Product'), f: p => `<b>${esc(p.name)}</b> ${p.has_image ? '🖼' : ''}<div class="small mute">${esc([p.size, p.brand, p.category].filter(Boolean).join(' • '))}</div>` },
      { h: L('ধরন', 'Type'), f: p => `<span class="badge">${(KINDS().find(k => k[0] === p.kind) || [])[1] || p.kind}</span>` },
      { h: L('ইউনিট', 'Units'), f: p => `<span class="small">${(p.units || []).map(u => esc(BX.unitLabel(u.name)) + (u.factor !== 1 ? '=' + BX.qty(u.factor) : '')).join(', ')}</span>` },
      { h: L('ক্রয় মূল্য', 'Cost'), n: 1, f: p => can('profit') ? BX.tk(p.purchase_price) + `<span class="small mute">/${esc(BX.unitLabel(p.base_unit))}</span>` : '-' },
      { h: L('বিক্রয় মূল্য', 'Price'), n: 1, f: p => BX.tk(p.retail_price) + `<span class="small mute">/${esc(BX.unitLabel(p.base_unit))}</span>` + (p.kind === 'tile' && p.sqft_per_pcs ? `<div class="small mute">${BX.tk(unitPrice(p, 'box', 'retail'))}/${L('বক্স', 'box')}</div>` : '') },
      { h: L('স্টক', 'Stock'), n: 1, f: p => `<span class="${p.stock <= 0 ? 'bad' : p.stock <= p.reorder_level ? 'warn' : ''}">${BX.stockText(p.stock, p)}</span>` },
    ], list, { click: can('products') });
    if (can('products')) BX.bindRows($('#pl', c), list, p => productForm(p.id, () => route()));
  };
  $('#q', c).oninput = BX.debounce(() => { q = $('#q', c).value.trim(); draw(); }, 150);
  $('#fc', c).onchange = e => { cat = e.target.value; draw(); };
  $('#fk', c).onchange = e => { kind = e.target.value; draw(); };
  const on = (id, fn) => { const e = $(id, c); if (e) e.onclick = fn; };
  on('#np', () => productForm(null, () => route()));
  on('#mCat', () => listManager(L('ক্যাটাগরি', 'Categories'), '/api/categories', 'categories'));
  on('#mBrand', () => listManager(L('ব্র্যান্ড', 'Brands'), '/api/brands', 'brands'));
  on('#imp', importProducts);
  on('#bc', () => barcodeModal(rows));
  draw();
};

async function listManager(title, url, cacheKey) {
  const rows = await BX.get(url);
  const m = BX.modal({ title, body: `<div class="row" style="margin-bottom:10px"><input class="in grow" id="nn" placeholder="${L('নতুন নাম', 'New name')}"><button class="btn pri" id="na">➕</button></div><div id="ll"></div>` });
  const draw = list => {
    $('#ll', m.el).innerHTML = list.map(r => `<div class="row" style="padding:6px 0;border-bottom:1px solid #f1f3f5;flex-wrap:nowrap"><input class="in sm grow" value="${esc(r.name)}" data-id="${r.id}"><button class="btn sm ghost bad" data-d="${r.id}">🗑</button></div>`).join('') || `<div class="empty">—</div>`;
    $$('[data-id]', m.el).forEach(i => (i.onchange = async () => { await BX.put(`${url}/${i.dataset.id}`, { name: i.value }); APP.drop(cacheKey); BX.toast('✓', 'ok'); }));
    $$('[data-d]', m.el).forEach(b => (b.onclick = async () => { if (!(await BX.confirm(L('মুছে ফেলবেন?', 'Delete?')))) return; await BX.del(`${url}/${b.dataset.d}`); APP.drop(cacheKey); draw(await BX.get(url)); }));
  };
  $('#na', m.el).onclick = async () => { const v = $('#nn', m.el).value.trim(); if (!v) return; await BX.post(url, { name: v }); $('#nn', m.el).value = ''; APP.drop(cacheKey); draw(await BX.get(url)); };
  draw(rows);
}

function importProducts() {
  const cols = ['name', 'kind', 'category', 'brand', 'size', 'base_unit', 'sqft_per_pcs', 'pcs_per_box', 'purchase_price', 'retail_price', 'wholesale_price', 'opening_stock', 'barcode', 'reorder_level'];
  BX.modal({
    title: '⬆ ' + L('পণ্য ইমপোর্ট (CSV / Excel)', 'Import products (CSV / Excel)'), wide: 1,
    body: `<ol class="small"><li>${L('টেমপ্লেট ডাউনলোড করুন, Excel-এ খুলে পণ্য লিখুন', 'Download the template, fill it in Excel')}</li><li>${L('Excel থেকে "CSV" হিসেবে সেভ করুন', 'Save as CSV from Excel')}</li><li>${L('নিচে আপলোড করুন', 'Upload below')}</li></ol>
      <p class="small mute">kind = tile / sanitary / hardware / general • ${L('টাইলসের ক্ষেত্রে দাম প্রতি স্কয়ার ফিট, শুরুর স্টক বক্সে', 'For tiles: prices per sqft, opening stock in boxes')} • base_unit = pcs / kg / feet / bag …</p>
      <button class="btn" id="tpl">⬇ ${L('টেমপ্লেট ডাউনলোড', 'Download template')}</button><input type="file" accept=".csv,text/csv" id="cf" class="in" style="margin-top:10px"><div id="prev" style="margin-top:10px"></div>`,
    onOpen: el => {
      $('#tpl', el).onclick = () => BX.download('products-template.csv', '﻿' + BX.csv([cols, ['RAK Floor Glossy', 'tile', 'Floor Tiles', 'RAK', '24x24', 'sqft', '4', '4', '55', '75', '68', '100', '', '160'], ['Water Tap Brass', 'sanitary', 'Faucet', 'RFL', '', 'pcs', '', '', '350', '480', '440', '20', '', '5'], ['Cement Bag', 'hardware', 'Cement', 'Shah', '', 'kg', '', '', '10', '11', '10.6', '5000', '', '500']]), 'text/csv');
      $('#cf', el).onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        const data = BX.parseCsv((await f.text()).replace(/^﻿/, ''));
        const head = data[0].map(h => h.trim().toLowerCase());
        const items = data.slice(1).map(r => { const o = {}; head.forEach((h, i) => (o[h] = (r[i] || '').trim())); if (!['tile', 'sanitary', 'hardware', 'general'].includes(o.kind)) o.kind = 'general'; return o; }).filter(o => o.name);
        $('#prev', el).innerHTML = `<p><b>${BX.dg(items.length)}</b> ${L('টি পণ্য পাওয়া গেছে', 'products found')}</p><button class="btn pri" id="go">${L('ইমপোর্ট করুন', 'Import now')}</button><div id="res"></div>`;
        $('#go', el).onclick = async () => { $('#go', el).disabled = true; const r = await BX.post('/api/products/bulk', { items }); $('#res', el).innerHTML = `<p class="ok b">✓ ${BX.dg(r.added)} ${L('টি যোগ হয়েছে', 'added')}</p>${r.errors.map(x => `<div class="small bad">${esc(x)}</div>`).join('')}`; APP.drop('products', 'categories', 'brands'); };
      };
    },
    onClose: () => route(),
  });
}

function barcodeModal(rows) {
  const list = rows.filter(p => p.barcode);
  if (!list.length) return BX.toast(L('কোনো পণ্যে বারকোড নেই — পণ্য এডিট করে ⚡ চাপুন', 'No products have barcodes — edit a product and press ⚡'), 'bad');
  BX.modal({
    title: '🏷 ' + L('বারকোড লেবেল প্রিন্ট', 'Print barcode labels'), wide: 1,
    body: BX.table([{ h: L('পণ্য', 'Product'), f: p => esc(p.name) + ' ' + esc(p.size || '') }, { h: L('বারকোড', 'Barcode'), k: 'barcode' }, { h: L('কতটি লেবেল', 'Labels'), f: p => `<input class="in sm lc" data-id="${p.id}" style="width:70px" value="0" inputmode="numeric">` }], list),
    buttons: [{ label: L('বাতিল', 'Cancel') }, { label: '🖨 ' + L('প্রিন্ট', 'Print'), cls: 'pri', onClick: (close, el) => {
      const labels = [];
      $$('.lc', el).forEach(i => { const p = list.find(x => String(x.id) === i.dataset.id); for (let k = 0; k < Math.min(500, nv(i.value)); k++) labels.push(p); });
      if (!labels.length) throw new Error(L('লেবেলের সংখ্যা দিন', 'Enter number of labels'));
      const svgs = labels.map(p => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); try { JsBarcode(s, p.barcode, { height: 40, width: 1.6, fontSize: 12, margin: 2 }); } catch (e) {} return `<div style="display:inline-block;width:48mm;height:28mm;border:1px dashed #ccc;margin:1mm;padding:1mm;text-align:center;overflow:hidden;vertical-align:top"><div style="font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden">${esc(p.name)} ${esc(p.size || '')}</div>${s.outerHTML}<div style="font-size:11px;font-weight:700">৳${BX.num(unitPrice(p, p.sale_unit, 'retail'))}/${esc(p.sale_unit)}</div></div>`; });
      BX.print(svgs.join(''), 'Barcodes', 'a4');
    } }],
  });
}

// ================= STOCK =================
PAGES.stock = async (c, params) => {
  let tab = params.tab || 'current';
  const branches = APP.me.branches;
  c.innerHTML = `<div class="page-head"><h2>🏬 ${L('স্টক', 'Stock')}</h2><div class="row">${can('stock_adjust') ? `<button class="btn" id="adj">± ${L('স্টক সমন্বয়', 'Adjust stock')}</button><button class="btn danger" id="dmg">💔 ${L('ভাঙা/নষ্ট এন্ট্রি', 'Broken / damage')}</button>${branches.length > 1 && !APP.me.user.branch_id ? `<button class="btn" id="trf">⇄ ${L('ব্রাঞ্চ ট্রান্সফার', 'Branch transfer')}</button>` : ''}` : ''}</div></div>
    <div class="tabs"><button data-t="current">${L('বর্তমান স্টক', 'Current stock')}</button><button data-t="batch">${L('ব্যাচ ও শেড', 'Batch & shade')}</button><button data-t="low">⚠️ ${L('কম স্টক', 'Low stock')}</button><button data-t="damage">💔 ${L('ভাঙা রেকর্ড', 'Broken records')}</button><button data-t="moves">${L('স্টক হিস্ট্রি', 'Stock history')}</button></div><div id="sv"></div>`;
  const draw = async () => {
    $$('.tabs button', c).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const v = $('#sv', c); v.innerHTML = '…';
    if (tab === 'current' || tab === 'low') {
      const rows = await BX.get('/api/products' + (tab === 'low' ? '?low=1' : ''));
      const list = tab === 'low' ? rows.filter(r => r.reorder_level > 0) : rows;
      v.innerHTML = `<input class="in" id="sq" placeholder="🔍 ${L('খুঁজুন', 'Search')}" style="margin-bottom:8px"><div id="st"></div>`;
      const dr = (ql = '') => {
        const l = list.filter(p => !ql || (p.name + ' ' + (p.size || '')).toLowerCase().includes(ql));
        $('#st', v).innerHTML = BX.table([{ h: L('পণ্য', 'Product'), f: p => `<b>${esc(p.name)}</b><div class="small mute">${esc([p.size, p.category].filter(Boolean).join(' • '))}</div>` },
          { h: L('স্টক', 'Stock'), n: 1, f: p => `<span class="${p.stock <= 0 ? 'bad' : p.stock <= p.reorder_level ? 'warn' : ''}">${BX.stockText(p.stock, p)}</span>` },
          ...(branches.length > 1 ? [{ h: L('সব ব্রাঞ্চে', 'All branches'), n: 1, f: p => BX.stockText(p.stock_all, p) }] : []),
          { h: L('সতর্কতা লেভেল', 'Alert level'), n: 1, f: p => p.reorder_level ? BX.qty(p.reorder_level) : '-' },
          ...(can('profit') ? [{ h: L('স্টক মূল্য (ক্রয়)', 'Stock value (cost)'), n: 1, f: p => BX.tk(p.stock * p.purchase_price) }] : [])], l,
        { click: 1 });
        BX.bindRows($('#st', v), l, p => go('stock?tab=moves&product_id=' + p.id));
      };
      $('#sq', v).oninput = e => dr(e.target.value.toLowerCase());
      dr();
    } else if (tab === 'batch') {
      const rows = await BX.get('/api/stock');
      v.innerHTML = BX.table([{ h: L('পণ্য', 'Product'), f: r => `<b>${esc(r.name)}</b> <span class="small mute">${esc(r.size || '')}</span>` }, { h: L('ব্রাঞ্চ', 'Branch'), k: 'branch' }, { h: L('ব্যাচ', 'Batch'), f: r => esc(r.batch || '-') }, { h: L('শেড', 'Shade'), f: r => esc(r.shade || '-') }, { h: L('স্টক', 'Stock'), n: 1, f: r => BX.stockText(r.qty, r) }], rows);
    } else {
      const pid = params.product_id || '';
      const rows = await BX.get(`/api/stock/moves?${tab === 'damage' ? 'type=damage' : ''}${pid ? '&product_id=' + pid : ''}`);
      const tl = { opening: L('শুরুর স্টক', 'Opening'), purchase: L('ক্রয়', 'Purchase'), sale: L('বিক্রি', 'Sale'), sale_return: L('বিক্রয় ফেরত', 'Sale return'), adjust: L('সমন্বয়', 'Adjust'), damage: L('ভাঙা/নষ্ট', 'Broken/damage'), transfer_in: L('ট্রান্সফার ইন', 'Transfer in'), transfer_out: L('ট্রান্সফার আউট', 'Transfer out') };
      v.innerHTML = (pid ? `<div class="banner info">${L('একটি পণ্যের হিস্ট্রি দেখাচ্ছে', 'Showing history of one product')} — <a href="#/stock?tab=moves">${L('সব দেখুন', 'Show all')}</a></div>` : '') +
        BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.dateTime(r.created_at) }, { h: L('পণ্য', 'Product'), f: r => esc(r.name) + (r.batch || r.shade ? `<div class="small mute">${esc(r.batch)} ${esc(r.shade)}</div>` : '') }, { h: L('ধরন', 'Type'), f: r => `<span class="badge ${r.qty < 0 ? 'bad' : 'ok'}">${tl[r.type] || r.type}</span>` },
          { h: L('পরিমাণ', 'Qty'), n: 1, f: r => (r.qty > 0 ? '+' : '') + BX.stockText(r.qty, r) }, ...(tab === 'damage' && can('profit') ? [{ h: L('ক্ষতি', 'Loss'), n: 1, f: r => BX.tk(-r.qty * r.cost) }] : []), { h: L('নোট', 'Note'), f: r => esc(r.note || '') }, { h: L('ইউজার', 'User'), f: r => esc(r.user_name || '') }, ...(branches.length > 1 ? [{ h: L('ব্রাঞ্চ', 'Branch'), k: 'branch' }] : [])], rows);
    }
  };
  $$('.tabs button', c).forEach(b => (b.onclick = () => { tab = b.dataset.t; params.product_id = ''; draw(); }));
  const on = (id, fn) => { const e = $(id, c); if (e) e.onclick = fn; };
  on('#adj', () => stockModal('adjust', draw));
  on('#dmg', () => stockModal('damage', draw));
  on('#trf', () => stockModal('transfer', draw));
  draw();
};

async function productPicker(el, onPick, opts = {}) {
  const products = await APP.load('products');
  const wrap = document.createElement('div'); wrap.className = 'dd';
  el.parentNode.insertBefore(wrap, el); wrap.appendChild(el);
  const list = document.createElement('div'); list.className = 'dd-list hidden'; wrap.appendChild(list);
  let found = [];
  el.setAttribute('autocomplete', 'off');
  el.oninput = () => {
    const ql = BX.toEnDigits(el.value.trim()).toLowerCase();
    if (!ql) { list.classList.add('hidden'); return; }
    found = products.filter(p => (p.name + ' ' + (p.name_bn || '') + ' ' + (p.size || '') + ' ' + (p.barcode || '') + ' ' + (p.sku || '')).toLowerCase().includes(ql)).slice(0, 20);
    list.innerHTML = found.map((p, i) => `<div data-i="${i}"><b>${esc(p.name)}</b> <span class="small mute">${esc(p.size || '')}</span><span class="small mute" style="float:right">${BX.stockText(p.stock, p)}</span></div>`).join('') || `<div class="mute">${L('পাওয়া যায়নি', 'Not found')}</div>`;
    list.classList.remove('hidden');
    $$('[data-i]', list).forEach(d => (d.onmousedown = e => { e.preventDefault(); const p = found[+d.dataset.i]; list.classList.add('hidden'); el.value = opts.keep ? p.name + (p.size ? ' ' + p.size : '') : ''; onPick(p); }));
  };
  el.onkeydown = e => { if (e.key === 'Enter' && found[0] && !list.classList.contains('hidden')) { e.preventDefault(); const p = found[0]; list.classList.add('hidden'); el.value = opts.keep ? p.name : ''; onPick(p); } };
  el.onblur = () => setTimeout(() => list.classList.add('hidden'), 200);
}

function stockModal(type, done) {
  const titles = { adjust: '± ' + L('স্টক সমন্বয়', 'Stock adjustment'), damage: '💔 ' + L('ভাঙা / নষ্ট পণ্য এন্ট্রি', 'Record broken / damaged goods'), transfer: '⇄ ' + L('ব্রাঞ্চ ট্রান্সফার', 'Branch transfer') };
  const br = APP.me.branches;
  let prod = null, batches = [];
  const m = BX.modal({
    title: titles[type], wide: 1,
    body: `<div class="f"><label>${L('পণ্য', 'Product')} *</label><input class="in" id="pp" placeholder="🔍 ${L('পণ্য খুঁজুন', 'Search product')}"></div><div id="pinfo" class="small" style="margin:6px 0"></div>
      <div class="grid g3">
        ${type === 'transfer' ? `<div class="f"><label>${L('যে ব্রাঞ্চ থেকে', 'From branch')}</label><select class="in" id="fb">${br.map(b => `<option value="${b.id}" ${String(b.id) === String(BX.branch) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div><div class="f"><label>${L('যে ব্রাঞ্চে', 'To branch')}</label><select class="in" id="tb">${br.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>` : ''}
        <div class="f"><label>${type === 'adjust' ? L('পরিমাণ (+ বাড়বে / − কমবে)', 'Quantity (+ add / − remove)') : L('পরিমাণ', 'Quantity')} *</label><input class="in" id="qq" inputmode="decimal" placeholder="${type === 'adjust' ? '+10 / -5' : '0'}"></div>
        <div class="f"><label>${L('ইউনিট', 'Unit')}</label><select class="in" id="uu"></select></div>
        <div class="f"><label>${L('ব্যাচ / শেড', 'Batch / shade')}</label><select class="in" id="bs"><option value="|">—</option></select></div>
        ${type === 'adjust' ? `<div class="f"><label>${L('অথবা নতুন ব্যাচ', 'Or new batch')}</label><input class="in" id="nb"></div><div class="f"><label>${L('নতুন শেড', 'New shade')}</label><input class="in" id="ns"></div>` : ''}
        <div class="f"><label>${L('তারিখ', 'Date')}</label><input type="date" class="in" id="dd" value="${BX.today()}"></div>
      </div><div class="f" style="margin-top:8px"><label>${L('কারণ / নোট', 'Reason / note')}</label><input class="in" id="nn" placeholder="${type === 'damage' ? L('যেমন: আনলোডের সময় ভেঙেছে', 'e.g. broken while unloading') : ''}"></div>`,
    buttons: [{ label: L('বাতিল', 'Cancel') }, { label: L('সেভ করুন', 'Save'), cls: 'pri', onClick: async (close, el) => {
      if (!prod) throw new Error(L('পণ্য বাছাই করুন', 'Select a product'));
      const u = (prod.units || []).find(x => x.name === $('#uu', el).value) || { factor: 1 };
      let [batch, shade] = $('#bs', el).value.split('|');
      if (type === 'adjust' && ($('#nb', el).value.trim() || $('#ns', el).value.trim())) { batch = $('#nb', el).value.trim(); shade = $('#ns', el).value.trim(); }
      const body = { product_id: prod.id, qty: nv($('#qq', el).value), factor: u.factor, batch, shade, note: $('#nn', el).value, date: $('#dd', el).value, type };
      if (type === 'transfer') await BX.post('/api/stock/transfer', { ...body, from_branch: $('#fb', el).value, to_branch: $('#tb', el).value });
      else await BX.post('/api/stock/adjust', body);
      APP.drop('products'); BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); close(); done && done();
    } }],
  });
  const el = m.el;
  productPicker($('#pp', el), async p => {
    prod = p;
    batches = await BX.get('/api/stock/batches/' + p.id);
    $('#pinfo', el).innerHTML = `<b>${esc(p.name)}</b> — ${L('বর্তমান স্টক', 'Current stock')}: ${BX.stockText(p.stock, p)}`;
    $('#uu', el).innerHTML = (p.units || []).map(u => `<option value="${esc(u.name)}" ${u.name === p.sale_unit ? 'selected' : ''}>${esc(BX.unitLabel(u.name))}</option>`).join('');
    $('#bs', el).innerHTML = `<option value="|">— ${L('ব্যাচ ছাড়া', 'No batch')}</option>` + batches.filter(b => b.batch || b.shade).map(b => `<option value="${esc(b.batch)}|${esc(b.shade)}">${esc(b.batch || '-')} / ${esc(b.shade || '-')} (${p.kind === 'tile' ? BX.boxPcs(b.qty, p) : BX.qty(b.qty)})</option>`).join('');
    const best = batches.slice().sort((a, b) => b.qty - a.qty)[0];
    if (best) $('#bs', el).value = best.batch + '|' + best.shade;
  }, { keep: 1 });
}

// ================= PURCHASES =================
PAGES.purchases = async (c, params) => {
  if (params.new) return purchaseForm(c);
  let from = BX.addDays(BX.today(), -30), to = BX.today(), q = '';
  c.innerHTML = `<div class="page-head"><h2>🛒 ${L('ক্রয় (পারচেজ)', 'Purchases')}</h2><div class="row">${dateRangeHtml(from, to)}<a class="btn pri" href="#/purchases?new=1">➕ ${L('নতুন ক্রয়', 'New purchase')}</a></div></div>
    <input class="in" id="q" placeholder="🔍 ${L('ক্রয় নং, সাপ্লায়ার, চালান নং', 'Purchase no, supplier, invoice no')}" style="margin-bottom:10px"><div id="pl"></div>`;
  const load = async () => {
    const rows = await BX.get(`/api/purchases?from=${from}&to=${to}&q=${encodeURIComponent(q)}`);
    $('#pl', c).innerHTML = BX.table([{ h: L('নং', 'No'), f: r => `<b>${esc(r.purchase_no)}</b><div class="small mute">${BX.date(r.date)}</div>` }, { h: L('সাপ্লায়ার', 'Supplier'), f: r => esc(r.supplier_name || '-') + (r.supplier_invoice ? `<div class="small mute">${L('চালান', 'Inv')}: ${esc(r.supplier_invoice)}</div>` : '') },
      { h: L('মোট', 'Total'), n: 1, k: 'total', f: r => BX.tk(r.total) }, { h: L('পরিশোধ', 'Paid'), n: 1, k: 'paid', f: r => BX.tk(r.paid) }, { h: L('বাকি (পাওনা)', 'Due (payable)'), n: 1, k: 'due', f: r => r.due > 0 ? `<b class="bad">${BX.tk(r.due)}</b>` : '-' }, { h: L('ইউজার', 'User'), f: r => `<span class="small">${esc(r.user_name || '')}</span>` }],
    rows, { click: 1, foot: { total: BX.tk(BX.sum(rows, 'total')), paid: BX.tk(BX.sum(rows, 'paid')), due: BX.tk(BX.sum(rows, 'due')) } });
    BX.bindRows($('#pl', c), rows, r => viewPurchase(r.id));
  };
  bindRange(c, (a, b) => { from = a; to = b; load(); });
  $('#q', c).oninput = BX.debounce(e => { q = $('#q', c).value.trim(); load(); }, 300);
  load();
};
async function viewPurchase(id) {
  const p = await BX.get('/api/purchases/' + id);
  const doPrint = () => BX.print(shopHeader(L('ক্রয় রশিদ', 'PURCHASE')) + `<p><b>${L('সাপ্লায়ার', 'Supplier')}:</b> ${esc(p.supplier_name || '-')} ${BX.dg(esc(p.supplier_phone || ''))}<br><b>${L('নং', 'No')}:</b> ${esc(p.purchase_no)} • ${BX.date(p.date)} ${p.supplier_invoice ? '• ' + L('চালান', 'Inv') + ': ' + esc(p.supplier_invoice) : ''}</p>
    <table class="items"><thead><tr><th>#</th><th>${L('পণ্য', 'Product')}</th><th class="n">${L('পরিমাণ', 'Qty')}</th><th class="n">${L('দর', 'Rate')}</th><th class="n">${L('টাকা', 'Amount')}</th></tr></thead><tbody>${p.items.map((i, k) => `<tr><td>${BX.dg(k + 1)}</td><td>${esc(i.name)} ${esc(i.batch)} ${esc(i.shade)}</td><td class="n">${BX.qty(i.qty)} ${esc(BX.unitLabel(i.unit))}</td><td class="n">${BX.num(i.rate)}</td><td class="n">${BX.num(i.total)}</td></tr>`).join('')}</tbody></table>
    <table class="tot" style="width:300px;margin-left:auto"><tr><td>${L('সাবটোটাল', 'Subtotal')}</td><td class="n">${BX.num(p.subtotal)}</td></tr><tr><td>${L('ডিসকাউন্ট', 'Discount')}</td><td class="n">${BX.num(p.discount)}</td></tr><tr><td>${L('পরিবহন/লেবার', 'Transport/labour')}</td><td class="n">${BX.num(p.other_cost)}</td></tr><tr class="g"><td>${L('মোট', 'Total')}</td><td class="n">${BX.num(p.total)}</td></tr><tr><td>${L('পরিশোধ', 'Paid')}</td><td class="n">${BX.num(p.paid)}</td></tr><tr><td>${L('বাকি', 'Due')}</td><td class="n">${BX.num(p.due)}</td></tr></table>`, p.purchase_no, 'a4');
  BX.modal({
    title: `🛒 ${esc(p.purchase_no)}`, wide: 1,
    body: `<p><b>${esc(p.supplier_name || '-')}</b> • ${BX.date(p.date)} ${p.supplier_invoice ? '• ' + L('চালান', 'Inv') + ': ' + esc(p.supplier_invoice) : ''}</p>${BX.table([{ h: L('পণ্য', 'Product'), f: i => esc(i.name) + (i.batch || i.shade ? `<div class="small mute">${esc(i.batch)} ${esc(i.shade)}</div>` : '') }, { h: L('পরিমাণ', 'Qty'), n: 1, f: i => BX.qty(i.qty) + ' ' + esc(BX.unitLabel(i.unit)) }, { h: L('দর', 'Rate'), n: 1, f: i => BX.num(i.rate) }, { h: L('টাকা', 'Amount'), n: 1, f: i => BX.num(i.total) }], p.items)}
      <div class="right" style="margin-top:8px">${L('মোট', 'Total')} <b>${BX.tk(p.total)}</b> • ${L('পরিশোধ', 'Paid')} ${BX.tk(p.paid)} • ${L('বাকি', 'Due')} <b class="bad">${BX.tk(p.due)}</b></div>`,
    buttons: [...(can('sales_delete') ? [{ label: '🗑 ' + L('মুছুন', 'Delete'), cls: 'danger', onClick: async close => { if (!(await BX.confirm(L('এই ক্রয় মুছে ফেলবেন? স্টক ও পাওনা আগের অবস্থায় ফিরবে।', 'Delete this purchase? Stock and payable will be reversed.')))) return; await BX.del('/api/purchases/' + id); APP.drop('products', 'accounts'); close(); route(); } }] : []), { label: '🖨 ' + L('প্রিন্ট', 'Print'), cls: 'pri', onClick: doPrint }],
  });
}
async function purchaseForm(c) {
  const [accs, sups] = await Promise.all([APP.load('accounts'), BX.get('/api/suppliers')]);
  const items = [];
  c.innerHTML = `<div class="page-head"><h2>🛒 ${L('নতুন ক্রয়', 'New purchase')}</h2><a class="btn" href="#/purchases">← ${L('তালিকা', 'List')}</a></div>
  <div class="card"><div class="grid g4">
    <div class="f"><label>${L('সাপ্লায়ার', 'Supplier')}</label><div class="row" style="flex-wrap:nowrap"><select class="in" id="sup"><option value="">— ${L('নগদ ক্রয়', 'Cash purchase')} —</option>${sups.map(s => `<option value="${s.id}">${esc(s.name)}${s.balance > 0 ? ' (' + L('পাওনা', 'payable') + ' ' + BX.num(s.balance) + ')' : ''}</option>`).join('')}</select><button class="btn sm" id="ns">➕</button></div></div>
    <div class="f"><label>${L('সাপ্লায়ারের চালান নং', 'Supplier invoice no')}</label><input class="in" id="sinv"></div>
    <div class="f"><label>${L('তারিখ', 'Date')}</label><input type="date" class="in" id="pd" value="${BX.today()}"></div>
    <div class="f"><label>${L('নোট', 'Note')}</label><input class="in" id="pn"></div></div>
  <div class="f" style="margin-top:12px"><label>➕ ${L('পণ্য যোগ করুন', 'Add product')}</label><input class="in" id="pp" placeholder="🔍 ${L('পণ্যের নাম বা বারকোড', 'Product name or barcode')}"></div>
  <div id="pi" style="margin-top:10px"></div>
  <div class="grid g4" style="margin-top:12px;align-items:end">
    <div class="f"><label>${L('ডিসকাউন্ট', 'Discount')}</label><input class="in" id="pdisc" inputmode="decimal" placeholder="0"></div>
    <div class="f"><label>${L('পরিবহন / লেবার খরচ', 'Transport / labour cost')}</label><input class="in" id="poth" inputmode="decimal" placeholder="0"><span class="small mute">${L('পণ্যের খরচে যোগ হবে', 'Added to product cost')}</span></div>
    <div class="f"><label>${L('এখন পরিশোধ', 'Paid now')}</label><input class="in" id="ppaid" inputmode="decimal" placeholder="0"></div>
    <div class="f"><label>${L('কোথা থেকে', 'From account')}</label><select class="in" id="pacc">${accOptions(accs, cashId(accs))}</select></div></div>
  <div class="row between" style="margin-top:14px"><div id="ptot" class="big"></div><button class="btn pri lg" id="psave">💾 ${L('ক্রয় সেভ করুন', 'Save purchase')}</button></div></div>`;
  const draw = () => {
    $('#pi', c).innerHTML = items.length ? BX.table([{ h: L('পণ্য', 'Product'), f: (l) => `<b>${esc(l.p.name)}</b> <span class="small mute">${esc(l.p.size || '')}</span>` },
      { h: L('পরিমাণ', 'Qty'), f: (l, i) => `<input class="in sm" data-f="qty" data-i="${i}" value="${l.qty}" style="width:80px" inputmode="decimal">` },
      { h: L('ইউনিট', 'Unit'), f: (l, i) => `<select class="in sm" data-f="unit" data-i="${i}">${(l.p.units || []).map(u => `<option value="${esc(u.name)}" ${u.name === l.unit ? 'selected' : ''}>${esc(BX.unitLabel(u.name))}</option>`).join('')}</select>` },
      { h: L('দর (প্রতি ইউনিট)', 'Rate (per unit)'), f: (l, i) => `<input class="in sm" data-f="rate" data-i="${i}" value="${l.rate}" style="width:100px" inputmode="decimal">` },
      { h: L('ব্যাচ', 'Batch'), f: (l, i) => `<input class="in sm" data-f="batch" data-i="${i}" value="${esc(l.batch)}" style="width:90px">` },
      { h: L('শেড', 'Shade'), f: (l, i) => `<input class="in sm" data-f="shade" data-i="${i}" value="${esc(l.shade)}" style="width:80px">` },
      { h: L('টাকা', 'Amount'), n: 1, f: l => BX.tk(nv(l.qty) * nv(l.rate)) + (l.p.kind === 'tile' ? `<div class="small mute">${BX.qty(nv(l.qty) * ((l.p.units.find(u => u.name === l.unit) || {}).factor || 1))} sqft</div>` : '') },
      { h: '', f: (l, i) => `<button class="btn sm ghost bad" data-x="${i}">✕</button>` }], items) : `<div class="empty">${L('উপরে পণ্য খুঁজে যোগ করুন', 'Search and add products above')}</div>`;
    $$('[data-f]', c).forEach(e => (e.onchange = () => { const l = items[+e.dataset.i]; l[e.dataset.f] = e.dataset.f === 'qty' || e.dataset.f === 'rate' ? BX.toEnDigits(e.value) : e.value; if (e.dataset.f === 'unit') { const u = l.p.units.find(x => x.name === e.value) || { factor: 1 }; l.rate = r2(l.p.purchase_price * u.factor); } draw(); }));
    $$('[data-x]', c).forEach(b => (b.onclick = () => { items.splice(+b.dataset.x, 1); draw(); }));
    tot();
  };
  const tot = () => { const sub = items.reduce((a, l) => a + nv(l.qty) * nv(l.rate), 0); const t = sub - nv($('#pdisc', c).value) + nv($('#poth', c).value); $('#ptot', c).innerHTML = `${L('মোট', 'Total')}: ${BX.tk(t)} <span class="small mute">${L('বাকি থাকবে', 'Due')}: ${BX.tk(t - nv($('#ppaid', c).value))}</span>`; return t; };
  ['#pdisc', '#poth', '#ppaid'].forEach(id => ($(id, c).oninput = tot));
  productPicker($('#pp', c), p => { const u = (p.units || []).find(x => x.name === p.purchase_unit) || { name: p.base_unit, factor: 1 }; items.push({ p, unit: u.name, qty: 1, rate: r2(p.purchase_price * u.factor), batch: '', shade: '' }); draw(); });
  $('#ns', c).onclick = () => supplierForm(null, s => { $('#sup', c).insertAdjacentHTML('beforeend', `<option value="${s.id}" selected>${esc(s.name)}</option>`); });
  $('#psave', c).onclick = async () => {
    const btn = $('#psave', c);
    try {
      if (!items.length) throw new Error(L('পণ্য যোগ করুন', 'Add products'));
      btn.disabled = true;
      const r = await BX.post('/api/purchases', { supplier_id: $('#sup', c).value || null, supplier_invoice: $('#sinv', c).value, date: $('#pd', c).value, note: $('#pn', c).value, discount: nv($('#pdisc', c).value), other_cost: nv($('#poth', c).value), paid: nv($('#ppaid', c).value), account_id: $('#pacc', c).value,
        items: items.map(l => ({ product_id: l.p.id, unit: l.unit, qty: nv(l.qty), rate: nv(l.rate), batch: l.batch.trim(), shade: l.shade.trim() })) });
      APP.drop('products', 'accounts'); BX.toast(L('ক্রয় সেভ হয়েছে', 'Purchase saved') + ' ' + r.purchase_no, 'ok'); go('purchases'); viewPurchase(r.id);
    } catch (e) { BX.err(e); btn.disabled = false; }
  };
  draw();
}

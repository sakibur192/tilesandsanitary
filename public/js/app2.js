// Baybex Tile ERP — shop app (part 2: customers/due, suppliers, money, calculator, reports, settings)

// ================= CUSTOMERS =================
function customerForm(cst, onDone) {
  const f = [
    { k: 'name', label: L('নাম', 'Name'), req: 1 },
    { k: 'phone', label: L('মোবাইল', 'Mobile'), type: 'tel', ph: '01XXXXXXXXX' },
    { k: 'type', label: L('ধরন', 'Type'), type: 'select', options: [['retail', L('খুচরা', 'Retail')], ['wholesale', L('পাইকারি', 'Wholesale')], ['contractor', L('কন্ট্রাক্টর / মিস্ত্রি', 'Contractor / mason')]] },
    { k: 'credit_limit', label: L('বাকির সীমা (০ = সীমা নেই)', 'Credit limit (0 = no limit)'), type: 'number' },
    { k: 'due_days', label: L('কত দিনের মধ্যে বাকি পরিশোধ', 'Pay due within (days)'), type: 'number', val: 30 },
    ...(cst ? [] : [{ k: 'opening_due', label: L('পূর্বের বাকি (খাতা থেকে)', 'Previous due (from old book)'), type: 'number', help: L('অগ্রিম থাকলে মাইনাস দিন', 'Use minus for advance') }]),
    { k: 'address', label: L('ঠিকানা', 'Address'), type: 'textarea', full: 1 },
    { k: 'notes', label: L('নোট', 'Notes'), full: 1 },
  ];
  BX.formModal(cst ? '✏️ ' + L('কাস্টমার এডিট', 'Edit customer') : '➕ ' + L('নতুন কাস্টমার', 'New customer'), f, cst || {}, async v => {
    v.phone = BX.toEnDigits(v.phone || '');
    if (v.phone && !BX.validBD(v.phone)) throw new Error(L('সঠিক মোবাইল নাম্বার দিন (01XXXXXXXXX)', 'Enter a valid mobile number (01XXXXXXXXX)'));
    let r;
    if (cst) { await BX.put('/api/customers/' + cst.id, v); r = { ...cst, ...v }; } else { r = await BX.post('/api/customers', v); r.balance = nv(v.opening_due); }
    BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); onDone && onDone(r);
  });
}
function supplierForm(sp, onDone) {
  const f = [
    { k: 'name', label: L('নাম', 'Name'), req: 1 }, { k: 'company', label: L('কোম্পানি', 'Company') },
    { k: 'phone', label: L('মোবাইল', 'Mobile'), type: 'tel' },
    ...(sp ? [] : [{ k: 'opening_due', label: L('পূর্বের পাওনা (সাপ্লায়ার পাবে)', 'Previous payable (we owe)'), type: 'number' }]),
    { k: 'address', label: L('ঠিকানা', 'Address'), type: 'textarea', full: 1 }, { k: 'notes', label: L('নোট', 'Notes'), full: 1 },
  ];
  BX.formModal(sp ? '✏️ ' + L('সাপ্লায়ার এডিট', 'Edit supplier') : '➕ ' + L('নতুন সাপ্লায়ার', 'New supplier'), f, sp || {}, async v => {
    v.phone = BX.toEnDigits(v.phone || '');
    const r = sp ? (await BX.put('/api/suppliers/' + sp.id, v), { ...sp, ...v }) : await BX.post('/api/suppliers', v);
    BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); onDone && onDone(r);
  });
}

function printReceipt(r, type, party) {
  const isC = type === 'customer';
  const html = withLang(S().invoice_lang || 'bn', () => shopHeader(isC ? L('মানি রিসিট', 'MONEY RECEIPT') : L('পেমেন্ট ভাউচার', 'PAYMENT VOUCHER'), `<div>${L('নং', 'No')}: <b>${esc(r.receipt_no)}</b><br>${L('তারিখ', 'Date')}: ${BX.date(r.date)}</div>`) +
    `<div class="box" style="font-size:15px;line-height:2">${isC ? L('গ্রহণ করা হলো', 'Received with thanks from') : L('পরিশোধ করা হলো', 'Paid to')}: <b>${esc(r.name)}</b> ${party && party.phone ? '(' + BX.dg(esc(party.phone)) + ')' : ''}<br>
      ${L('টাকার পরিমাণ', 'Amount')}: <b style="font-size:20px">৳${BX.num(r.amount)}</b> (${BX.words(r.amount)})${r.discount ? `<br>${L('মওকুফ/ডিসকাউন্ট', 'Discount')}: ৳${BX.num(r.discount)}` : ''}<br>
      ${isC ? L('বর্তমান বাকি', 'Remaining due') : L('বর্তমান পাওনা', 'Remaining payable')}: <b>৳${BX.num(r.balance)}</b></div>
      <div class="sig"><div>${isC ? L('প্রদানকারী', 'Paid by') : L('গ্রহণকারী', 'Received by')}</div><div>${L('কর্তৃপক্ষ', 'Authorised')}</div></div>`);
  BX.print(html, r.receipt_no, S().invoice_size);
}

async function paymentModal(type, party, onDone) {
  const accs = await APP.load('accounts');
  const isC = type === 'customer';
  const bal = party.balance || 0;
  BX.modal({
    title: (isC ? '💰 ' + L('বাকি আদায়', 'Collect due') : '💸 ' + L('সাপ্লায়ারকে পেমেন্ট', 'Pay supplier')) + ' — ' + esc(party.name),
    body: `<div class="stat ${bal > 0 ? 'red' : 'green'}" style="margin-bottom:12px"><div class="l">${isC ? L('বর্তমান বাকি', 'Current due') : L('বর্তমান পাওনা', 'Current payable')}</div><div class="v">${BX.tk(bal)}</div></div>
      <div class="grid g2"><div class="f"><label>${L('টাকার পরিমাণ', 'Amount')} *</label><input class="in" id="amt" inputmode="decimal" style="font-size:20px;font-weight:700"></div>
      <div class="f"><label>${isC ? L('কোথায় জমা', 'Received in') : L('কোথা থেকে', 'Paid from')}</label><select class="in" id="acc">${accOptions(accs, cashId(accs))}</select></div>
      <div class="f"><label>${isC ? L('মওকুফ / ডিসকাউন্ট (ঐচ্ছিক)', 'Waive / discount (optional)') : L('ডিসকাউন্ট পেয়েছি (ঐচ্ছিক)', 'Discount received (optional)')}</label><input class="in" id="disc" inputmode="decimal" placeholder="0"></div>
      <div class="f"><label>${L('তারিখ', 'Date')}</label><input type="date" class="in" id="dt" value="${BX.today()}"></div>
      <div class="f" style="grid-column:1/-1"><label>${L('নোট (যেমন: বিকাশ TrxID)', 'Note (e.g. bKash TrxID)')}</label><input class="in" id="nt"></div></div>
      <div class="row" style="margin-top:8px">${bal > 0 ? `<button class="btn sm" id="all">${L('সম্পূর্ণ', 'Full')} ${BX.tk(bal)}</button>` : ''}<span class="grow"></span><b id="after"></b></div>`,
    onOpen: el => {
      const upd = () => { $('#after', el).textContent = L('পরে থাকবে', 'Remaining') + ': ' + BX.tk(bal - nv($('#amt', el).value) - nv($('#disc', el).value)); };
      $('#amt', el).oninput = $('#disc', el).oninput = upd; upd();
      const a = $('#all', el); if (a) a.onclick = () => { $('#amt', el).value = bal; upd(); };
    },
    buttons: [{ label: L('বাতিল', 'Cancel') }, { label: '✅ ' + L('সেভ ও রিসিট', 'Save & receipt'), cls: 'pri', onClick: async (close, el) => {
      const r = await BX.post(`/api/${isC ? 'customers' : 'suppliers'}/${party.id}/payment`, { amount: nv($('#amt', el).value), account_id: $('#acc', el).value, discount: nv($('#disc', el).value), date: $('#dt', el).value, note: $('#nt', el).value });
      APP.drop('accounts'); close(); BX.toast(L('সেভ হয়েছে', 'Saved') + ' ' + r.receipt_no, 'ok');
      BX.modal({ title: '✅ ' + esc(r.receipt_no), body: `<p class="center big">${BX.tk(r.amount)}</p><p class="center">${isC ? L('বাকি রইল', 'Remaining due') : L('পাওনা রইল', 'Remaining payable')}: <b>${BX.tk(r.balance)}</b></p>`, onClose: () => onDone && onDone(),
        buttons: [...(party.phone ? [{ label: '💬 WhatsApp', onClick: () => window.open(BX.waLink(party.phone, `${APP.me.tenant.name}\n${isC ? L('জমা পেয়েছি', 'Received') : L('পরিশোধ করেছি', 'Paid')}: ৳${BX.num(r.amount)} (${BX.date(r.date)})\n${isC ? L('বর্তমান বাকি', 'Current due') : L('বর্তমান পাওনা', 'Current payable')}: ৳${BX.num(r.balance)}\n${L('ধন্যবাদ', 'Thank you')}`)) }] : []), { label: '🖨 ' + L('রিসিট প্রিন্ট', 'Print receipt'), cls: 'pri', onClick: () => printReceipt(r, type, party) }] });
    } }],
  });
}

const dueMsg = c => (S().sms_due_template || '').replace(/\{name\}/g, c.name).replace(/\{shop\}/g, APP.me.tenant.name).replace(/\{due\}/g, BX.num(c.balance)).replace(/\{phone\}/g, APP.me.tenant.phone || '');

PAGES.customers = async c => {
  let rows = await BX.get('/api/customers');
  let q = '', filter = 'all';
  c.innerHTML = `<div class="page-head"><h2>👥 ${L('কাস্টমার', 'Customers')} (${BX.dg(rows.length)})</h2><div class="row"><button class="btn" id="exp">⬇ CSV</button><button class="btn pri" id="nc">➕ ${L('নতুন কাস্টমার', 'New customer')}</button></div></div>
    <div class="row" style="margin-bottom:10px"><input class="in grow" id="q" placeholder="🔍 ${L('নাম, মোবাইল বা ঠিকানা', 'Name, mobile or address')}"><div class="seg" id="flt"><button data-f="all" class="on">${L('সব', 'All')}</button><button data-f="due">${L('বাকি আছে', 'Has due')}</button><button data-f="wholesale">${L('পাইকারি', 'Wholesale')}</button><button data-f="contractor">${L('কন্ট্রাক্টর', 'Contractor')}</button></div></div><div id="cl"></div>`;
  const tl = { retail: L('খুচরা', 'Retail'), wholesale: L('পাইকারি', 'Wholesale'), contractor: L('কন্ট্রাক্টর', 'Contractor') };
  const draw = () => {
    const ql = q.toLowerCase();
    const list = rows.filter(r => (!ql || (r.name + ' ' + (r.phone || '') + ' ' + (r.address || '')).toLowerCase().includes(ql)) && (filter === 'all' || (filter === 'due' ? r.balance > 0 : r.type === filter)));
    $('#cl', c).innerHTML = BX.table([{ h: L('নাম', 'Name'), f: r => `<b>${esc(r.name)}</b> ${r.overdue ? `<span class="badge bad">${L('মেয়াদোত্তীর্ণ', 'Overdue')}</span>` : ''}<div class="small mute">${esc(r.address || '')}</div>` }, { h: L('মোবাইল', 'Mobile'), f: r => BX.dg(esc(r.phone || '')) },
      { h: L('ধরন', 'Type'), f: r => `<span class="badge">${tl[r.type] || r.type}</span>` }, { h: L('শেষ কেনা', 'Last purchase'), f: r => BX.date(r.last_purchase) },
      { h: L('বাকি', 'Due'), n: 1, f: r => r.balance > 0 ? `<b class="bad">${BX.tk(r.balance)}</b>` : r.balance < 0 ? `<span class="ok">${L('অগ্রিম', 'Adv')} ${BX.tk(-r.balance)}</span>` : '-' },
      { h: '', f: r => `<div class="row" style="flex-wrap:nowrap">${r.balance > 0 && can('due_collect') ? `<button class="btn sm ok" data-pay="${r.id}">💰</button>` : ''}<button class="btn sm" data-ed="${r.id}">✏️</button></div>` }],
    list, { click: 1 });
    BX.bindRows($('#cl', c), list, r => go('customer?id=' + r.id));
    $$('[data-pay]', c).forEach(b => (b.onclick = () => paymentModal('customer', rows.find(x => String(x.id) === b.dataset.pay), () => route())));
    $$('[data-ed]', c).forEach(b => (b.onclick = () => customerForm(rows.find(x => String(x.id) === b.dataset.ed), () => route())));
  };
  $('#q', c).oninput = BX.debounce(() => { q = BX.toEnDigits($('#q', c).value.trim()); draw(); }, 150);
  $$('#flt button', c).forEach(b => (b.onclick = () => { filter = b.dataset.f; $$('#flt button', c).forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  $('#nc', c).onclick = () => customerForm(null, () => route());
  $('#exp', c).onclick = () => BX.download('customers.csv', '﻿' + BX.csv([['Name', 'Mobile', 'Type', 'Address', 'Due']].concat(rows.map(r => [r.name, r.phone, r.type, r.address, r.balance]))), 'text/csv');
  draw();
};

PAGES.customer = async (c, params) => {
  if (!can('customers')) throw new Error(L('অনুমতি নেই', 'No permission'));
  let from = params.from || '', to = params.to || '';
  const load = async () => {
    const d = await BX.get(`/api/customers/${params.id}/ledger?from=${from}&to=${to}`);
    const cu = d.customer;
    $('#pageTitle').textContent = cu.name;
    const refLink = r => r.ref_type === 'sale' || r.ref_type === 'sale_payment' ? `<a href="#" data-sale="${r.ref_id}">${esc(r.ref_no)}</a>` : esc(r.ref_no || '');
    c.innerHTML = `<div class="page-head"><h2>📒 ${esc(cu.name)}</h2><div class="row"><a class="btn" href="#/customers">← ${L('কাস্টমার', 'Customers')}</a>
      ${cu.phone ? `<a class="btn" href="tel:${esc(cu.phone)}">📞</a><a class="btn" target="_blank" href="${BX.waLink(cu.phone, dueMsg(cu))}">💬 WhatsApp</a>` : ''}${can('sms') && cu.phone && cu.balance > 0 ? `<button class="btn" id="sms">✉️ SMS</button>` : ''}
      <button class="btn" id="ed">✏️</button><button class="btn" id="adj">± ${L('সমন্বয়', 'Adjust')}</button><button class="btn" id="pr">🖨 ${L('স্টেটমেন্ট', 'Statement')}</button>${can('due_collect') ? `<button class="btn pri" id="pay">💰 ${L('টাকা জমা', 'Receive payment')}</button>` : ''}${can('pos') ? `<button class="btn ok" id="sell">🧾 ${L('বিক্রি', 'Sell')}</button>` : ''}</div></div>
      <div class="grid g4"><div class="stat ${cu.balance > 0 ? 'red' : 'green'}"><div class="l">${L('বর্তমান বাকি', 'Current due')}</div><div class="v">${BX.tk(cu.balance)}</div></div>
        <div class="stat"><div class="l">${L('মোবাইল', 'Mobile')}</div><div class="v" style="font-size:17px">${BX.dg(esc(cu.phone || '-'))}</div><div class="small mute">${esc(cu.address || '')}</div></div>
        <div class="stat amber"><div class="l">${L('বাকির সীমা', 'Credit limit')}</div><div class="v">${cu.credit_limit > 0 ? BX.tk(cu.credit_limit) : L('সীমা নেই', 'No limit')}</div></div>
        <div class="stat blue"><div class="l">${L('মোট কেনাকাটা', 'Total purchases')}</div><div class="v">${BX.tk(BX.sum(d.rows.filter(r => r.ref_type === 'sale'), 'debit'))}</div></div></div>
      <div class="card" style="margin-top:12px"><div class="row between" style="margin-bottom:8px"><h3 style="margin:0">${L('কাস্টমার লেজার', 'Customer ledger')}</h3>${dateRangeHtml(from || BX.addDays(BX.today(), -365), to || BX.today())}</div>
      ${BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('বিবরণ', 'Description'), f: r => esc(r.note || '') }, { h: L('রেফ', 'Ref'), f: refLink },
        { h: L('বিক্রি / বাকি (+)', 'Sale / debit (+)'), n: 1, f: r => r.debit ? BX.num(r.debit) : '' }, { h: L('জমা (−)', 'Paid / credit (−)'), n: 1, f: r => r.credit ? `<span class="ok">${BX.num(r.credit)}</span>` : '' }, { h: L('ব্যালেন্স', 'Balance'), n: 1, f: r => `<b>${BX.num(r.balance)}</b>` }],
      [{ date: from || '', note: L('শুরুর ব্যালেন্স', 'Opening balance'), debit: 0, credit: 0, balance: d.opening }].concat(d.rows))}</div>`;
    const on = (id, fn) => { const e = $(id, c); if (e) e.onclick = fn; };
    on('#pay', () => paymentModal('customer', cu, load));
    on('#ed', () => customerForm(cu, load));
    on('#sell', () => { const P = posNew('sale'); P.customer = cu; P.sale_type = cu.type === 'wholesale' ? 'wholesale' : 'retail'; APP.pos = P; posSave(); go('pos?keep=1'); });
    on('#sms', async () => { const msg = prompt(L('SMS লিখুন', 'SMS text'), dueMsg(cu)); if (!msg) return; try { await BX.post('/api/sms/send', { to: cu.phone, message: msg }); BX.toast(L('SMS পাঠানো হয়েছে', 'SMS sent'), 'ok'); } catch (e) { BX.err(e); } });
    on('#adj', () => BX.formModal(L('ব্যালেন্স সমন্বয়', 'Balance adjustment'), [{ k: 'amount', label: L('পরিমাণ (+ বাকি বাড়বে, − কমবে)', 'Amount (+ increase due, − decrease)'), type: 'number', req: 1 }, { k: 'date', label: L('তারিখ', 'Date'), type: 'date', val: BX.today() }, { k: 'note', label: L('কারণ', 'Reason'), full: 1, req: 1 }], {}, async v => { await BX.post(`/api/customers/${cu.id}/adjust`, v); load(); }));
    on('#pr', () => {
      const html = withLang(S().invoice_lang || 'bn', () => shopHeader(L('কাস্টমার স্টেটমেন্ট', 'CUSTOMER STATEMENT'), `<div>${BX.date(BX.today())}</div>`) +
        `<p><b>${esc(cu.name)}</b> ${BX.dg(esc(cu.phone || ''))}<br>${esc(cu.address || '')}</p><table class="items"><thead><tr><th>${L('তারিখ', 'Date')}</th><th>${L('বিবরণ', 'Description')}</th><th>${L('রেফ', 'Ref')}</th><th class="n">${L('ডেবিট', 'Debit')}</th><th class="n">${L('ক্রেডিট', 'Credit')}</th><th class="n">${L('ব্যালেন্স', 'Balance')}</th></tr></thead><tbody>
        <tr><td></td><td>${L('শুরুর ব্যালেন্স', 'Opening balance')}</td><td></td><td></td><td></td><td class="n">${BX.num(d.opening)}</td></tr>
        ${d.rows.map(r => `<tr><td>${BX.date(r.date)}</td><td>${esc(r.note || '')}</td><td>${esc(r.ref_no || '')}</td><td class="n">${r.debit ? BX.num(r.debit) : ''}</td><td class="n">${r.credit ? BX.num(r.credit) : ''}</td><td class="n">${BX.num(r.balance)}</td></tr>`).join('')}</tbody></table>
        <h3 style="text-align:right;margin-top:10px">${L('মোট বাকি', 'Total due')}: ৳${BX.num(cu.balance)}</h3>`);
      BX.print(html, 'Statement ' + cu.name, 'a4');
    });
    $$('[data-sale]', c).forEach(a => (a.onclick = e => { e.preventDefault(); viewSale(a.dataset.sale); }));
    bindRange(c, (a, b) => { from = a; to = b; load(); });
  };
  await load();
};

// ================= DUE CENTER =================
PAGES.due = async c => {
  const [rows, dash] = await Promise.all([BX.get('/api/customers?due=1'), can('dashboard') ? BX.get('/api/dashboard') : Promise.resolve(null)]);
  let tab = 'all', q = '';
  const overdue = rows.filter(r => r.overdue);
  c.innerHTML = `<div class="page-head"><h2>📒 ${L('বাকির হিসাব', 'Customer due')}</h2><div class="row">${can('sms') ? `<button class="btn" id="bulk">✉️ ${L('SMS রিমাইন্ডার', 'SMS reminder')}</button>` : ''}<button class="btn" id="pr">🖨 ${L('বাকির তালিকা প্রিন্ট', 'Print due list')}</button><a class="btn" href="#/reports?tab=collections">📊 ${L('দৈনিক কালেকশন', 'Daily collection')}</a></div></div>
    <div class="grid g4"><div class="stat red"><div class="l">${L('মোট বাকি', 'Total due')}</div><div class="v">${BX.tk(BX.sum(rows, 'balance'))}</div><div class="small mute">${BX.dg(rows.length)} ${L('জন', 'customers')}</div></div>
      <div class="stat amber"><div class="l">⏰ ${L('মেয়াদোত্তীর্ণ বাকি', 'Overdue')}</div><div class="v">${BX.tk(BX.sum(overdue, 'balance'))}</div><div class="small mute">${BX.dg(overdue.length)} ${L('জন', 'customers')}</div></div>
      ${dash ? `<div class="stat green"><div class="l">${L('আজ বাকি আদায়', 'Due collected today')}</div><div class="v">${BX.tk(dash.due_collection)}</div></div><div class="stat blue"><div class="l">${L('আজ বাকিতে বিক্রি', 'Credit sales today')}</div><div class="v">${BX.tk(dash.credit_sales)}</div></div>` : ''}</div>
    <div class="tabs" style="margin-top:12px"><button data-t="all" class="on">${L('সব বাকিদার', 'All with due')}</button><button data-t="over">⏰ ${L('মেয়াদোত্তীর্ণ', 'Overdue')}</button><button data-t="limit">🚫 ${L('সীমা ছাড়িয়েছে', 'Over credit limit')}</button></div>
    <input class="in" id="q" placeholder="🔍 ${L('খুঁজুন', 'Search')}" style="margin-bottom:8px"><div id="dl"></div>`;
  const list = () => { const ql = q.toLowerCase(); return (tab === 'over' ? overdue : tab === 'limit' ? rows.filter(r => r.credit_limit > 0 && r.balance > r.credit_limit) : rows).filter(r => !ql || (r.name + ' ' + (r.phone || '')).toLowerCase().includes(ql)); };
  const draw = () => {
    const l = list().sort((a, b) => b.balance - a.balance);
    $('#dl', c).innerHTML = BX.table([{ h: `<input type="checkbox" id="all">`, f: r => `<input type="checkbox" class="sel" value="${r.id}">` }, { h: L('কাস্টমার', 'Customer'), f: r => `<b>${esc(r.name)}</b><div class="small mute">${BX.dg(esc(r.phone || ''))} ${esc(r.address || '')}</div>` },
      { h: L('শেষ জমা', 'Last payment'), f: r => r.last_payment ? BX.date(r.last_payment) : '-' }, { h: L('কত দিন', 'Days'), n: 1, f: r => `<span class="${r.overdue ? 'bad b' : ''}">${BX.dg(r.days_since)}</span>` },
      { h: L('বাকি', 'Due'), n: 1, f: r => `<b class="bad">${BX.tk(r.balance)}</b>${r.credit_limit > 0 ? `<div class="small mute">${L('সীমা', 'Limit')} ${BX.tk(r.credit_limit)}</div>` : ''}` },
      { h: '', f: r => `<div class="row" style="flex-wrap:nowrap">${can('due_collect') ? `<button class="btn sm ok" data-pay="${r.id}">💰 ${L('আদায়', 'Collect')}</button>` : ''}${r.phone ? `<a class="btn sm" target="_blank" href="${BX.waLink(r.phone, dueMsg(r))}">💬</a><a class="btn sm" href="tel:${esc(r.phone)}">📞</a>` : ''}</div>` }],
    l, { click: 1 });
    BX.bindRows($('#dl', c), l, r => go('customer?id=' + r.id));
    $$('[data-pay]', c).forEach(b => (b.onclick = () => paymentModal('customer', rows.find(x => String(x.id) === b.dataset.pay), () => route())));
    const all = $('#all', c); if (all) all.onchange = () => $$('.sel', c).forEach(x => (x.checked = all.checked));
  };
  $$('.tabs button', c).forEach(b => (b.onclick = () => { tab = b.dataset.t; $$('.tabs button', c).forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  $('#q', c).oninput = e => { q = BX.toEnDigits(e.target.value.trim()); draw(); };
  $('#pr', c).onclick = () => { const l = list(); BX.print(shopHeader(L('বাকির তালিকা', 'DUE LIST'), `<div>${BX.date(BX.today())}</div>`) + `<table class="items"><thead><tr><th>#</th><th>${L('কাস্টমার', 'Customer')}</th><th>${L('মোবাইল', 'Mobile')}</th><th>${L('শেষ জমা', 'Last paid')}</th><th class="n">${L('বাকি', 'Due')}</th></tr></thead><tbody>${l.map((r, i) => `<tr><td>${BX.dg(i + 1)}</td><td>${esc(r.name)}<br><span class="muted">${esc(r.address || '')}</span></td><td>${BX.dg(esc(r.phone || ''))}</td><td>${BX.date(r.last_payment)}</td><td class="n">${BX.num(r.balance)}</td></tr>`).join('')}</tbody></table><h3 style="text-align:right">${L('মোট', 'Total')}: ৳${BX.num(BX.sum(l, 'balance'))}</h3>`, 'Due list', 'a4'); };
  const bulk = $('#bulk', c);
  if (bulk) bulk.onclick = () => {
    const ids = $$('.sel:checked', c).map(x => x.value);
    if (!ids.length) return BX.toast(L('তালিকা থেকে কাস্টমার টিক দিন', 'Tick customers in the list first'), 'bad');
    BX.modal({ title: '✉️ ' + L('বাকির SMS রিমাইন্ডার', 'Due SMS reminder'),
      body: `<p>${BX.dg(ids.length)} ${L('জন কাস্টমার', 'customers')} • ${L('SMS ব্যালেন্স', 'SMS balance')}: <b>${BX.dg(APP.me.tenant.sms_balance)}</b></p><div class="f"><label>${L('মেসেজ', 'Message')} <span class="small mute">{name} {due} {shop}</span></label><textarea class="in" id="tpl" rows="4">${esc(S().sms_due_template)}</textarea></div><p class="small mute">${L('বাংলা SMS: প্রতি ৭০ অক্ষরে ১টি SMS কাটবে', 'Bangla SMS: 1 credit per 70 characters')}</p>`,
      buttons: [{ label: L('বাতিল', 'Cancel') }, { label: L('পাঠান', 'Send'), cls: 'pri', onClick: async (close, el) => { const r = await BX.post('/api/sms/due-reminders', { customer_ids: ids, template: $('#tpl', el).value }); close(); BX.modal({ title: L('ফলাফল', 'Result'), body: `<p class="ok b">✓ ${BX.dg(r.sent)} ${L('টি পাঠানো হয়েছে', 'sent')}</p>${r.errors.map(e => `<div class="small bad">${esc(e)}</div>`).join('')}` }); } }] });
  };
  draw();
};

// ================= SUPPLIERS =================
PAGES.suppliers = async c => {
  const rows = await BX.get('/api/suppliers');
  c.innerHTML = `<div class="page-head"><h2>🏭 ${L('সাপ্লায়ার ও পাওনা', 'Suppliers & payable')}</h2><button class="btn pri" id="ns">➕ ${L('নতুন সাপ্লায়ার', 'New supplier')}</button></div>
    <div class="grid g3" style="margin-bottom:12px"><div class="stat amber"><div class="l">${L('মোট পাওনা (আমরা দেব)', 'Total payable (we owe)')}</div><div class="v">${BX.tk(BX.sum(rows.filter(r => r.balance > 0), 'balance'))}</div></div></div>
    ${BX.table([{ h: L('নাম', 'Name'), f: r => `<b>${esc(r.name)}</b><div class="small mute">${esc(r.company || '')}</div>` }, { h: L('মোবাইল', 'Mobile'), f: r => BX.dg(esc(r.phone || '')) }, { h: L('শেষ পেমেন্ট', 'Last payment'), f: r => BX.date(r.last_payment) },
      { h: L('পাওনা', 'Payable'), n: 1, f: r => r.balance > 0 ? `<b class="bad">${BX.tk(r.balance)}</b>` : r.balance < 0 ? `<span class="ok">${L('অগ্রিম', 'Adv')} ${BX.tk(-r.balance)}</span>` : '-' },
      { h: '', f: r => `<div class="row" style="flex-wrap:nowrap">${can('supplier_pay') ? `<button class="btn sm ok" data-pay="${r.id}">💸</button>` : ''}<button class="btn sm" data-ed="${r.id}">✏️</button></div>` }], rows, { click: 1 })}`;
  BX.bindRows(c, rows, r => go('supplier?id=' + r.id));
  $('#ns', c).onclick = () => supplierForm(null, () => route());
  $$('[data-pay]', c).forEach(b => (b.onclick = () => paymentModal('supplier', rows.find(x => String(x.id) === b.dataset.pay), () => route())));
  $$('[data-ed]', c).forEach(b => (b.onclick = () => supplierForm(rows.find(x => String(x.id) === b.dataset.ed), () => route())));
};
PAGES.supplier = async (c, params) => {
  if (!can('suppliers')) throw new Error(L('অনুমতি নেই', 'No permission'));
  const load = async () => {
    const d = await BX.get(`/api/suppliers/${params.id}/ledger`);
    const s = d.supplier;
    c.innerHTML = `<div class="page-head"><h2>🏭 ${esc(s.name)}</h2><div class="row"><a class="btn" href="#/suppliers">←</a>${can('purchase') ? `<a class="btn" href="#/purchases?new=1">🛒 ${L('ক্রয়', 'Purchase')}</a>` : ''}<button class="btn" id="pr">🖨</button>${can('supplier_pay') ? `<button class="btn pri" id="pay">💸 ${L('পেমেন্ট দিন', 'Make payment')}</button>` : ''}</div></div>
      <div class="grid g3"><div class="stat ${s.balance > 0 ? 'red' : 'green'}"><div class="l">${L('বর্তমান পাওনা', 'Current payable')}</div><div class="v">${BX.tk(s.balance)}</div></div><div class="stat"><div class="l">${L('মোবাইল', 'Mobile')}</div><div class="v" style="font-size:17px">${BX.dg(esc(s.phone || '-'))}</div></div><div class="stat blue"><div class="l">${L('মোট ক্রয়', 'Total purchase')}</div><div class="v">${BX.tk(BX.sum(d.rows.filter(r => r.ref_type === 'purchase'), 'credit'))}</div></div></div>
      <div class="card" style="margin-top:12px"><h3>${L('সাপ্লায়ার লেজার', 'Supplier ledger')}</h3>${BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('বিবরণ', 'Description'), f: r => esc(r.note || '') }, { h: L('রেফ', 'Ref'), f: r => esc(r.ref_no || '') }, { h: L('ক্রয় (+)', 'Purchase (+)'), n: 1, f: r => r.credit ? BX.num(r.credit) : '' }, { h: L('পরিশোধ (−)', 'Paid (−)'), n: 1, f: r => r.debit ? `<span class="ok">${BX.num(r.debit)}</span>` : '' }, { h: L('ব্যালেন্স', 'Balance'), n: 1, f: r => `<b>${BX.num(r.balance)}</b>` }], d.rows)}</div>`;
    const p = $('#pay', c); if (p) p.onclick = () => paymentModal('supplier', s, load);
    $('#pr', c).onclick = () => BX.print(shopHeader(L('সাপ্লায়ার লেজার', 'SUPPLIER LEDGER')) + `<p><b>${esc(s.name)}</b> ${BX.dg(esc(s.phone || ''))}</p><table class="items"><thead><tr><th>${L('তারিখ', 'Date')}</th><th>${L('বিবরণ', 'Description')}</th><th class="n">${L('ক্রয়', 'Purchase')}</th><th class="n">${L('পরিশোধ', 'Paid')}</th><th class="n">${L('ব্যালেন্স', 'Balance')}</th></tr></thead><tbody>${d.rows.map(r => `<tr><td>${BX.date(r.date)}</td><td>${esc(r.note || '')} ${esc(r.ref_no || '')}</td><td class="n">${r.credit ? BX.num(r.credit) : ''}</td><td class="n">${r.debit ? BX.num(r.debit) : ''}</td><td class="n">${BX.num(r.balance)}</td></tr>`).join('')}</tbody></table><h3 style="text-align:right">${L('পাওনা', 'Payable')}: ৳${BX.num(s.balance)}</h3>`, s.name, 'a4');
  };
  await load();
};

// ================= EXPENSES =================
PAGES.expenses = async c => {
  let from = BX.monthStart(), to = BX.today();
  const [accs, cats] = await Promise.all([APP.load('accounts'), APP.load('expcats', true)]);
  c.innerHTML = `<div class="page-head"><h2>💸 ${L('খরচ', 'Expenses')}</h2><div class="row">${dateRangeHtml(from, to)}<button class="btn" id="mc">🗂 ${L('খাত', 'Heads')}</button><button class="btn pri" id="ne">➕ ${L('খরচ লিখুন', 'Add expense')}</button></div></div><div id="el"></div>`;
  const load = async () => {
    const rows = await BX.get(`/api/expenses?from=${from}&to=${to}`);
    const byCat = {}; rows.forEach(r => (byCat[r.category || '-'] = (byCat[r.category || '-'] || 0) + r.amount));
    $('#el', c).innerHTML = `<div class="row" style="margin-bottom:10px;gap:8px">${Object.entries(byCat).map(([k, v]) => `<span class="badge">${esc(k)}: ${BX.tk(v)}</span>`).join('')}</div>` +
      BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('খাত', 'Head'), f: r => esc(r.category || '-') }, { h: L('বিবরণ', 'Details'), f: r => esc(r.note || '') }, { h: L('একাউন্ট', 'Account'), k: 'account' }, { h: L('ইউজার', 'By'), f: r => `<span class="small">${esc(r.user_name || '')}</span>` }, { h: L('টাকা', 'Amount'), n: 1, f: r => `<b>${BX.tk(r.amount)}</b>` }, { h: '', f: r => `<button class="btn sm ghost bad" data-d="${r.id}">🗑</button>` }],
        rows) + `<div class="right big" style="margin-top:8px">${L('মোট', 'Total')}: ${BX.tk(BX.sum(rows, 'amount'))}</div>`;
    $$('[data-d]', c).forEach(b => (b.onclick = async () => { if (!(await BX.confirm(L('খরচটি মুছবেন?', 'Delete this expense?')))) return; await BX.del('/api/expenses/' + b.dataset.d); APP.drop('accounts'); load(); }));
  };
  $('#ne', c).onclick = () => BX.formModal('💸 ' + L('খরচ লিখুন', 'Add expense'), [
    { k: 'category_id', label: L('খাত', 'Expense head'), type: 'select', options: cats.map(x => [x.id, x.name]) }, { k: 'amount', label: L('টাকা', 'Amount'), type: 'number', req: 1 },
    { k: 'account_id', label: L('কোথা থেকে', 'Paid from'), type: 'select', options: accs.map(a => [a.id, a.name]), val: cashId(accs) }, { k: 'date', label: L('তারিখ', 'Date'), type: 'date', val: BX.today() },
    { k: 'note', label: L('বিবরণ', 'Details'), full: 1 }], {}, async v => { await BX.post('/api/expenses', v); APP.drop('accounts'); BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); load(); });
  $('#mc', c).onclick = () => listManager(L('খরচের খাত', 'Expense heads'), '/api/expense-categories', 'expcats');
  bindRange(c, (a, b) => { from = a; to = b; load(); });
  load();
};

// ================= CASHBOOK =================
const TXT = () => ({ sale: L('নগদ বিক্রি', 'Sales receipt'), collection: L('বাকি আদায়', 'Due collection'), purchase: L('ক্রয় পরিশোধ', 'Purchase payment'), supplier_payment: L('সাপ্লায়ার পেমেন্ট', 'Supplier payment'), expense: L('খরচ', 'Expense'), salary: L('বেতন', 'Salary'), refund: L('ফেরত টাকা', 'Refund'), transfer: L('ট্রান্সফার', 'Transfer'), deposit: L('মালিকের জমা / অন্যান্য আয়', 'Owner deposit / other income'), withdraw: L('মালিকের উত্তোলন', 'Owner withdrawal'), adjust: L('ক্যাশ সমন্বয়', 'Cash adjustment') });
PAGES.cashbook = async (c, params) => {
  const date = params.date || BX.today();
  const d = await BX.get('/api/cashbook?date=' + date);
  const tt = TXT();
  const ins = Object.entries(d.byType).filter(([k]) => k.endsWith(':in')), outs = Object.entries(d.byType).filter(([k]) => k.endsWith(':out'));
  const tot = { opening: BX.sum(d.accounts, 'opening'), in: BX.sum(d.accounts, 'in'), out: BX.sum(d.accounts, 'out'), closing: BX.sum(d.accounts, 'closing') };
  c.innerHTML = `<div class="page-head"><h2>💵 ${L('দৈনিক ক্যাশবুক', 'Daily cashbook')} — ${BX.date(date)}</h2><div class="row">
      <button class="btn" id="prev">◀</button><input type="date" class="in sm" id="dd" value="${date}" style="width:auto"><button class="btn" id="next">▶</button>
      <button class="btn" onclick="window.print()">🖨</button><button class="btn pri" id="close">🔒 ${L('দিন শেষ (ক্যাশ গণনা)', 'Day close (count cash)')}</button></div></div>
    <div class="grid g4"><div class="stat navy"><div class="l">${L('শুরুর ব্যালেন্স', 'Opening balance')}</div><div class="v">${BX.tk(tot.opening)}</div></div><div class="stat green"><div class="l">${L('আজ মোট আয়', 'Total in today')}</div><div class="v">${BX.tk(tot.in)}</div></div>
      <div class="stat red"><div class="l">${L('আজ মোট ব্যয়', 'Total out today')}</div><div class="v">${BX.tk(tot.out)}</div></div><div class="stat blue"><div class="l">${L('দিন শেষের ব্যালেন্স', 'Closing balance')}</div><div class="v">${BX.tk(tot.closing)}</div></div></div>
    <div class="card" style="margin-top:12px"><h3>${L('একাউন্ট অনুযায়ী', 'By account')}</h3>${BX.table([{ h: L('একাউন্ট', 'Account'), k: 'name' }, { h: L('শুরু', 'Opening'), n: 1, k: 'opening', f: r => BX.tk(r.opening) }, { h: L('আয় (+)', 'In (+)'), n: 1, k: 'in', f: r => `<span class="ok">${BX.tk(r.in)}</span>` }, { h: L('ব্যয় (−)', 'Out (−)'), n: 1, k: 'out', f: r => `<span class="bad">${BX.tk(r.out)}</span>` }, { h: L('শেষ', 'Closing'), n: 1, k: 'closing', f: r => `<b>${BX.tk(r.closing)}</b>` }], d.accounts, { foot: { name: L('মোট', 'Total'), opening: BX.tk(tot.opening), in: BX.tk(tot.in), out: BX.tk(tot.out), closing: BX.tk(tot.closing) } })}</div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3 class="ok">⬇ ${L('আয়', 'Money in')}</h3>${ins.map(([k, v]) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid #f1f3f5"><span>${tt[k.split(':')[0]] || k}</span><b>${BX.tk(v)}</b></div>`).join('') || `<div class="mute">—</div>`}</div>
      <div class="card"><h3 class="bad">⬆ ${L('ব্যয়', 'Money out')}</h3>${outs.map(([k, v]) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid #f1f3f5"><span>${tt[k.split(':')[0]] || k}</span><b>${BX.tk(v)}</b></div>`).join('') || `<div class="mute">—</div>`}</div></div>
    ${d.closings.length ? `<div class="card" style="margin-top:12px"><h3>🔒 ${L('দিন শেষের গণনা', 'Day close counts')}</h3>${BX.table([{ h: L('একাউন্ট', 'Account'), k: 'account' }, { h: L('হিসাবে', 'System'), n: 1, f: r => BX.tk(r.system_balance) }, { h: L('গণনায়', 'Counted'), n: 1, f: r => BX.tk(r.counted) }, { h: L('কম/বেশি', 'Short/excess'), n: 1, f: r => `<b class="${r.difference < 0 ? 'bad' : r.difference > 0 ? 'ok' : ''}">${r.difference < 0 ? L('কম', 'Short') + ' ' : r.difference > 0 ? L('বেশি', 'Excess') + ' ' : ''}${BX.tk(Math.abs(r.difference))}</b>` }, { h: L('ইউজার', 'By'), k: 'user_name' }, { h: L('নোট', 'Note'), k: 'note' }], d.closings)}</div>` : ''}
    <div class="card" style="margin-top:12px"><h3>${L('আজকের সব লেনদেন', 'All transactions today')}</h3>${BX.table([{ h: L('সময়', 'Time'), f: r => BX.dateTime(r.created_at).split(' ').slice(1).join(' ') }, { h: L('ধরন', 'Type'), f: r => tt[r.type] || r.type }, { h: L('বিবরণ', 'Details'), f: r => esc([r.party, r.note].filter(Boolean).join(' — ')) }, { h: L('একাউন্ট', 'Account'), k: 'account' }, { h: L('আয়', 'In'), n: 1, f: r => r.direction === 'in' ? `<span class="ok">${BX.tk(r.amount)}</span>` : '' }, { h: L('ব্যয়', 'Out'), n: 1, f: r => r.direction === 'out' ? `<span class="bad">${BX.tk(r.amount)}</span>` : '' }, { h: L('ইউজার', 'By'), f: r => `<span class="small">${esc(r.user_name || '')}</span>` }], d.rows)}</div>`;
  $('#dd', c).onchange = e => go('cashbook?date=' + e.target.value);
  $('#prev', c).onclick = () => go('cashbook?date=' + BX.addDays(date, -1));
  $('#next', c).onclick = () => go('cashbook?date=' + BX.addDays(date, 1));
  $('#close', c).onclick = () => {
    const cashAcc = d.accounts.find(a => a.type === 'cash') || d.accounts[0];
    BX.modal({ title: '🔒 ' + L('দিন শেষ — ক্যাশ গণনা', 'Day close — count cash'),
      body: `<div class="grid g2"><div class="f"><label>${L('একাউন্ট', 'Account')}</label><select class="in" id="ac">${d.accounts.map(a => `<option value="${a.id}" data-cl="${a.closing}" ${a.id === cashAcc.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
        <div class="f"><label>${L('হিসাব অনুযায়ী থাকার কথা', 'Should be (system)')}</label><div class="big" id="sys"></div></div>
        <div class="f"><label>${L('ড্রয়ারে গুনে পেয়েছেন', 'Actually counted')} *</label><input class="in" id="cn" inputmode="decimal" style="font-size:20px"></div><div class="f"><label>${L('পার্থক্য', 'Difference')}</label><div class="big" id="df">-</div></div>
        <div class="f" style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="adjc" checked> ${L('পার্থক্যটি ক্যাশ সমন্বয় হিসেবে এন্ট্রি দিন', 'Record the difference as a cash adjustment')}</label></div><div class="f" style="grid-column:1/-1"><label>${L('নোট', 'Note')}</label><input class="in" id="nt"></div></div>`,
      onOpen: el => { const upd = () => { const sys = Number($('#ac', el).selectedOptions[0].dataset.cl); $('#sys', el).textContent = BX.tk(sys); if ($('#cn', el).value === '') { $('#df', el).textContent = '-'; return; } const df = nv($('#cn', el).value) - sys; $('#df', el).innerHTML = `<span class="${df < 0 ? 'bad' : df > 0 ? 'ok' : ''}">${df < 0 ? L('কম', 'Short') : df > 0 ? L('বেশি', 'Excess') : L('মিলেছে ✓', 'Matched ✓')} ${df ? BX.tk(Math.abs(df)) : ''}</span>`; }; $('#ac', el).onchange = $('#cn', el).oninput = upd; upd(); },
      buttons: [{ label: L('বাতিল', 'Cancel') }, { label: L('সেভ করুন', 'Save'), cls: 'pri', onClick: async (close, el) => { if ($('#cn', el).value === '') throw new Error(L('গণনার টাকা দিন', 'Enter counted amount')); await BX.post('/api/cashbook/close', { date, account_id: $('#ac', el).value, counted: nv($('#cn', el).value), adjust: $('#adjc', el).checked, note: $('#nt', el).value }); APP.drop('accounts'); close(); route(); } }] });
  };
};

// ================= ACCOUNTS =================
PAGES.accounts = async c => {
  const accs = await APP.load('accounts', true);
  const all = await BX.get('/api/accounts?all=1');
  const tl = { cash: L('ক্যাশ', 'Cash'), bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: L('ব্যাংক', 'Bank'), other: L('অন্যান্য', 'Other') };
  c.innerHTML = `<div class="page-head"><h2>🏦 ${L('ক্যাশ, বিকাশ, নগদ ও ব্যাংক', 'Cash, bKash, Nagad & Bank')}</h2><div class="row"><button class="btn" id="tr">⇄ ${L('ট্রান্সফার', 'Transfer')}</button><button class="btn" id="dp">⬇ ${L('জমা / উত্তোলন', 'Deposit / withdraw')}</button><button class="btn pri" id="na">➕ ${L('নতুন একাউন্ট', 'New account')}</button></div></div>
    <div class="grid g4">${accs.map(a => `<div class="stat ${a.balance < 0 ? 'red' : 'green'}" style="cursor:pointer" data-st="${a.id}"><div class="l">${esc(a.name)} <span class="badge">${tl[a.type] || a.type}</span></div><div class="v">${BX.tk(a.balance)}</div><div class="small mute">${esc(a.number || '')} • ${L('স্টেটমেন্ট দেখুন', 'View statement')} →</div></div>`).join('')}</div>
    <div class="right big" style="margin:12px 0">${L('মোট', 'Total')}: ${BX.tk(BX.sum(accs, 'balance'))}</div>
    <h3>${L('সব একাউন্ট', 'All accounts')}</h3>${BX.table([{ h: L('নাম', 'Name'), k: 'name' }, { h: L('ধরন', 'Type'), f: a => tl[a.type] || a.type }, { h: L('নাম্বার', 'Number'), k: 'number' }, { h: L('শুরুর ব্যালেন্স', 'Opening balance'), n: 1, f: a => BX.tk(a.opening_balance) }, { h: L('স্ট্যাটাস', 'Status'), f: a => a.active ? `<span class="badge ok">${L('চালু', 'Active')}</span>` : `<span class="badge">${L('বন্ধ', 'Inactive')}</span>` }], all, { click: 1 })}`;
  const form = a => BX.formModal(a ? '✏️ ' + esc(a.name) : '➕ ' + L('নতুন একাউন্ট', 'New account'), [{ k: 'name', label: L('নাম', 'Name'), req: 1, ph: L('যেমন: ডাচ-বাংলা ব্যাংক', 'e.g. Dutch-Bangla Bank') }, { k: 'type', label: L('ধরন', 'Type'), type: 'select', options: Object.entries(tl) }, { k: 'number', label: L('একাউন্ট/মোবাইল নাম্বার', 'Account / mobile no') }, { k: 'opening_balance', label: L('শুরুর ব্যালেন্স', 'Opening balance'), type: 'number' }, ...(a ? [{ k: 'active', label: L('চালু', 'Active'), type: 'check' }] : [])], a || { type: 'bank' }, async v => { if (a) await BX.put('/api/accounts/' + a.id, v); else await BX.post('/api/accounts', v); APP.drop('accounts'); route(); });
  BX.bindRows(c, all, form);
  $('#na', c).onclick = () => form(null);
  $$('[data-st]', c).forEach(el => (el.onclick = () => accountStatement(el.dataset.st)));
  $('#tr', c).onclick = () => BX.formModal('⇄ ' + L('একাউন্ট ট্রান্সফার', 'Account transfer'), [{ k: 'from', label: L('যেখান থেকে', 'From'), type: 'select', options: accs.map(a => [a.id, a.name + ' (' + BX.num(a.balance) + ')']) }, { k: 'to', label: L('যেখানে', 'To'), type: 'select', options: accs.map(a => [a.id, a.name]), val: (accs[1] || {}).id }, { k: 'amount', label: L('টাকা', 'Amount'), type: 'number', req: 1 }, { k: 'date', label: L('তারিখ', 'Date'), type: 'date', val: BX.today() }, { k: 'note', label: L('নোট', 'Note'), full: 1, ph: L('যেমন: ক্যাশ ব্যাংকে জমা', 'e.g. cash deposited to bank') }], {}, async v => { await BX.post('/api/accounts/transfer', v); APP.drop('accounts'); route(); });
  $('#dp', c).onclick = () => BX.formModal(L('জমা / উত্তোলন', 'Deposit / withdraw'), [{ k: 'account', label: L('একাউন্ট', 'Account'), type: 'select', options: accs.map(a => [a.id, a.name]) }, { k: 'direction', label: L('ধরন', 'Type'), type: 'select', options: [['in', L('জমা (মালিকের পুঁজি / অন্য আয়)', 'Deposit (owner capital / other income)')], ['out', L('উত্তোলন (মালিক নিয়েছেন)', 'Withdraw (owner drawing)')]] }, { k: 'amount', label: L('টাকা', 'Amount'), type: 'number', req: 1 }, { k: 'date', label: L('তারিখ', 'Date'), type: 'date', val: BX.today() }, { k: 'note', label: L('নোট', 'Note'), full: 1 }], {}, async v => { await BX.post(`/api/accounts/${v.account}/adjust`, v); APP.drop('accounts'); route(); });
};
async function accountStatement(id) {
  const d = await BX.get(`/api/accounts/${id}/statement`);
  let run = d.opening; const tt = TXT();
  d.rows.forEach(r => { run += r.direction === 'in' ? r.amount : -r.amount; r.bal = run; });
  BX.modal({ title: '🏦 ' + esc(d.account.name) + ' — ' + L('গত ৩০ দিন', 'last 30 days'), wide: 'x',
    body: BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('ধরন', 'Type'), f: r => tt[r.type] || r.type }, { h: L('বিবরণ', 'Details'), f: r => esc([r.party, r.note].filter(Boolean).join(' — ')) }, { h: L('আয়', 'In'), n: 1, f: r => r.direction === 'in' ? BX.num(r.amount) : '' }, { h: L('ব্যয়', 'Out'), n: 1, f: r => r.direction === 'out' ? BX.num(r.amount) : '' }, { h: L('ব্যালেন্স', 'Balance'), n: 1, f: r => r.bal !== undefined ? `<b>${BX.num(r.bal)}</b>` : '' }], [{ date: '', type: '', note: L('শুরুর ব্যালেন্স', 'Opening'), bal: d.opening }].concat(d.rows)) });
}

// ================= TILE CALCULATOR =================
function tileMath(p, sqft, wastage) {
  const spp = Number(p.sqft_per_pcs) || 0, ppb = Number(p.pcs_per_box) || 0;
  const need = sqft * (1 + (Number(wastage) || 0) / 100);
  if (!spp || !ppb) return { need, boxes: 0, pcs: 0, sqftGiven: 0 };
  const pcsNeed = Math.ceil(need / spp - 1e-9);
  const boxes = Math.ceil(pcsNeed / ppb - 1e-9);
  return { need, pcsNeed, boxes, pcs: boxes * ppb, sqftGiven: boxes * ppb * spp, sqftPerBox: spp * ppb };
}
function tileCalcModal(p, onUse) {
  BX.modal({ title: '📐 ' + esc(p.name),
    body: `<p class="small mute">${L('প্রতি পিস', 'Per piece')} ${BX.qty(p.sqft_per_pcs)} sqft • ${L('প্রতি বক্সে', 'Per box')} ${BX.dg(p.pcs_per_box)} ${L('পিস', 'pcs')} = ${BX.qty(p.sqft_per_pcs * p.pcs_per_box)} sqft</p>
      <div class="grid g3"><div class="f"><label>${L('দৈর্ঘ্য (ফুট)', 'Length (ft)')}</label><input class="in" id="ln" inputmode="decimal"></div><div class="f"><label>${L('প্রস্থ (ফুট)', 'Width (ft)')}</label><input class="in" id="wd" inputmode="decimal"></div><div class="f"><label>${L('অথবা সরাসরি স্কয়ার ফিট', 'Or total sqft')}</label><input class="in" id="sq" inputmode="decimal"></div></div>
      <div class="row" style="margin-top:8px"><span>${L('ওয়েস্টেজ', 'Wastage')}</span><div class="seg" id="ws">${[0, 5, 10, 15].map(w => `<button data-w="${w}" class="${w === Number(S().default_wastage) ? 'on' : ''}">${BX.dg(w)}%</button>`).join('')}</div></div>
      <div class="card" style="margin-top:12px;background:#f0fdfa" id="res"></div>`,
    onOpen: el => {
      let w = Number(S().default_wastage) || 0;
      const calc = () => { const sq = nv($('#sq', el).value) || nv($('#ln', el).value) * nv($('#wd', el).value); const r = tileMath(p, sq, w); el._r = r;
        $('#res', el).innerHTML = sq ? `${L('মোট এরিয়া', 'Area')}: <b>${BX.qty(sq)} sqft</b> + ${BX.dg(w)}% = ${BX.qty(r.need)} sqft<div class="big" style="margin-top:6px">${BX.dg(r.boxes)} ${L('বক্স', 'boxes')} <span class="small mute">(${BX.dg(r.pcs)} ${L('পিস', 'pcs')}, ${BX.qty(r.sqftGiven)} sqft)</span></div><div>${L('আনুমানিক দাম', 'Approx. price')}: <b>${BX.tk(r.sqftGiven * p.retail_price)}</b></div>` : L('মাপ দিন', 'Enter measurement'); };
      ['#ln', '#wd', '#sq'].forEach(i => ($(i, el).oninput = calc));
      $$('#ws button', el).forEach(b => (b.onclick = () => { w = Number(b.dataset.w); $$('#ws button', el).forEach(x => x.classList.toggle('on', x === b)); calc(); }));
      calc();
    },
    buttons: [{ label: L('বাতিল', 'Cancel') }, { label: L('এই পরিমাণ নিন', 'Use this quantity'), cls: 'pri', onClick: (close, bg) => { const rr = bg.querySelector('.modal')._r; if (!rr || !rr.boxes) throw new Error(L('মাপ দিন', 'Enter measurement')); onUse(rr); close(); } }],
  });
}

PAGES.calculator = async c => {
  const products = (await APP.load('products')).filter(p => p.kind === 'tile' && p.sqft_per_pcs && p.pcs_per_box);
  const rooms = [{ name: L('বেডরুম ১ - ফ্লোর', 'Bedroom 1 - floor'), type: 'floor', l: '', w: '', h: '', minus: '', sqft: '', pid: products[0] ? products[0].id : '', wastage: Number(S().default_wastage) || 5, spp: '', ppb: '' }];
  c.innerHTML = `<div class="page-head"><h2>📐 ${L('টাইলস ক্যালকুলেটর ও প্রজেক্ট এস্টিমেট', 'Tile calculator & project estimate')}</h2><div class="row"><button class="btn" id="addR">➕ ${L('রুম/এরিয়া যোগ', 'Add room/area')}</button>${can('quotation') ? `<button class="btn" id="toQ">📝 ${L('কোটেশন তৈরি', 'Create quotation')}</button>` : ''}${can('pos') ? `<button class="btn pri" id="toPos">🧾 ${L('বিক্রিতে যোগ', 'Add to sale')}</button>` : ''}</div></div>
    <div class="grid g3" style="margin-bottom:12px">
      <div class="card"><h3>🔄 ${L('দ্রুত হিসাব', 'Quick convert')}</h3>
        <div class="f"><label>${L('টাইলস', 'Tile')}</label><select class="in" id="qp"><option value="">— ${L('নিজে সাইজ দিন', 'Manual size')} —</option>${products.map(p => `<option value="${p.id}">${esc(p.name)} ${esc(p.size || '')}</option>`).join('')}</select></div>
        <div class="grid g2" style="margin-top:6px"><div class="f"><label>${L('পিসে স্কয়ার ফিট', 'Sqft/pcs')}</label><input class="in" id="qspp" inputmode="decimal" value="4"></div><div class="f"><label>${L('বক্সে পিস', 'Pcs/box')}</label><input class="in" id="qppb" inputmode="decimal" value="4"></div></div>
        <div class="grid g2" style="margin-top:6px"><div class="f"><label>${L('বক্স → স্কয়ার ফিট', 'Boxes → sqft')}</label><input class="in" id="qb" inputmode="decimal" placeholder="${L('কত বক্স', 'boxes')}"></div><div class="f"><label>${L('স্কয়ার ফিট → বক্স', 'Sqft → boxes')}</label><input class="in" id="qs" inputmode="decimal" placeholder="sqft"></div></div>
        <div id="qres" class="big" style="margin-top:8px;font-size:17px"></div></div>
      <div class="card" style="grid-column:span 2"><h3>ℹ️ ${L('কিভাবে ব্যবহার করবেন', 'How to use')}</h3><ul class="small" style="margin:0;padding-left:18px">
        <li>${L('ফ্লোর: দৈর্ঘ্য × প্রস্থ', 'Floor: length × width')}</li><li>${L('ওয়াল: ২ × (দৈর্ঘ্য + প্রস্থ) × উচ্চতা − দরজা/জানালা', 'Wall: 2 × (length + width) × height − doors/windows')}</li>
        <li>${L('ওয়েস্টেজ সাধারণত ৫%, ডায়াগোনাল/কাটিং বেশি হলে ১০%', 'Wastage usually 5%, 10% for diagonal/heavy cutting')}</li><li>${L('বক্স সবসময় উপরের দিকে রাউন্ড হয় (আংশিক বক্স বিক্রি হয় না)', 'Boxes are always rounded up')}</li></ul></div></div>
    <div id="rooms"></div><div class="card" id="sum" style="margin-top:12px"></div>`;
  const pOf = r => products.find(p => String(p.id) === String(r.pid)) || { sqft_per_pcs: nv(r.spp), pcs_per_box: nv(r.ppb), retail_price: 0, name: L('ম্যানুয়াল', 'Manual') };
  const area = r => nv(r.sqft) || (r.type === 'wall' ? 2 * (nv(r.l) + nv(r.w)) * nv(r.h) : nv(r.l) * nv(r.w)) - nv(r.minus);
  const draw = () => {
    $('#rooms', c).innerHTML = rooms.map((r, i) => { const p = pOf(r); const a = Math.max(0, area(r)); const m = tileMath(p, a, r.wastage);
      return `<div class="card" style="margin-bottom:10px" data-i="${i}"><div class="row" style="margin-bottom:8px"><input class="in sm grow" data-k="name" value="${esc(r.name)}"><div class="seg"><button data-type="floor" class="${r.type === 'floor' ? 'on' : ''}">${L('ফ্লোর', 'Floor')}</button><button data-type="wall" class="${r.type === 'wall' ? 'on' : ''}">${L('ওয়াল', 'Wall')}</button></div><button class="btn sm ghost bad" data-rm="${i}">✕</button></div>
        <div class="grid g4"><div class="f"><label>${L('দৈর্ঘ্য (ফুট)', 'Length (ft)')}</label><input class="in sm" data-k="l" value="${r.l}" inputmode="decimal"></div><div class="f"><label>${L('প্রস্থ (ফুট)', 'Width (ft)')}</label><input class="in sm" data-k="w" value="${r.w}" inputmode="decimal"></div>
          ${r.type === 'wall' ? `<div class="f"><label>${L('উচ্চতা (ফুট)', 'Height (ft)')}</label><input class="in sm" data-k="h" value="${r.h}" inputmode="decimal"></div><div class="f"><label>${L('দরজা/জানালা বাদ (sqft)', 'Minus doors/windows (sqft)')}</label><input class="in sm" data-k="minus" value="${r.minus}" inputmode="decimal"></div>` : `<div class="f"><label>${L('অথবা মোট sqft', 'Or total sqft')}</label><input class="in sm" data-k="sqft" value="${r.sqft}" inputmode="decimal"></div><div class="f"><label>${L('বাদ (sqft)', 'Minus (sqft)')}</label><input class="in sm" data-k="minus" value="${r.minus}" inputmode="decimal"></div>`}
          <div class="f" style="grid-column:span 2"><label>${L('টাইলস', 'Tile')}</label><select class="in sm" data-k="pid"><option value="">— ${L('ম্যানুয়াল সাইজ', 'Manual size')} —</option>${products.map(p => `<option value="${p.id}" ${String(p.id) === String(r.pid) ? 'selected' : ''}>${esc(p.name)} ${esc(p.size || '')} (${BX.tk(unitPrice(p, 'box', 'retail'))}/${L('বক্স', 'box')})</option>`).join('')}</select></div>
          ${r.pid ? '' : `<div class="f"><label>${L('পিসে sqft', 'Sqft/pcs')}</label><input class="in sm" data-k="spp" value="${r.spp}" inputmode="decimal"></div><div class="f"><label>${L('বক্সে পিস', 'Pcs/box')}</label><input class="in sm" data-k="ppb" value="${r.ppb}" inputmode="decimal"></div>`}
          <div class="f"><label>${L('ওয়েস্টেজ %', 'Wastage %')}</label><select class="in sm" data-k="wastage">${[0, 3, 5, 7, 10, 15].map(w => `<option ${w === Number(r.wastage) ? 'selected' : ''}>${w}</option>`).join('')}</select></div></div>
        <div class="row between" style="margin-top:8px;background:#f0fdfa;padding:8px 10px;border-radius:8px"><span>${L('এরিয়া', 'Area')} <b>${BX.qty(a)}</b> sqft → ${L('লাগবে', 'need')} <b>${BX.qty(m.need)}</b> sqft</span><span class="big" style="font-size:17px">${BX.dg(m.boxes)} ${L('বক্স', 'box')} <span class="small mute">(${BX.dg(m.pcs || 0)} ${L('পিস', 'pcs')})</span>${r.pid ? ' • ' + BX.tk(m.sqftGiven * p.retail_price) : ''}</span></div></div>`; }).join('');
    const totals = {}; let money = 0;
    rooms.forEach(r => { const p = pOf(r); const m = tileMath(p, Math.max(0, area(r)), r.wastage); if (r.pid) { totals[r.pid] = totals[r.pid] || { p, sqft: 0 }; totals[r.pid].sqft += m.need; } });
    const lines = Object.values(totals).map(t => { const m = tileMath(t.p, t.sqft, 0); money += m.sqftGiven * t.p.retail_price; return { ...t, ...m }; });
    APP.calcLines = lines;
    $('#sum', c).innerHTML = `<h3>🧾 ${L('মোট এস্টিমেট (একই টাইলস একসাথে)', 'Total estimate (same tiles combined)')}</h3>` + BX.table([{ h: L('টাইলস', 'Tile'), f: t => esc(t.p.name) + ' ' + esc(t.p.size || '') }, { h: L('প্রয়োজন', 'Needed'), n: 1, f: t => BX.qty(t.need) + ' sqft' }, { h: L('বক্স', 'Boxes'), n: 1, f: t => `<b>${BX.dg(t.boxes)}</b>` }, { h: L('স্টক', 'Stock'), n: 1, f: t => `<span class="${t.p.stock < t.sqftGiven ? 'bad' : 'ok'}">${BX.boxPcs(t.p.stock, t.p)}</span>` }, { h: L('দাম', 'Price'), n: 1, f: t => BX.tk(t.sqftGiven * t.p.retail_price) }], lines) + `<div class="right big" style="margin-top:8px">${L('মোট', 'Total')}: ${BX.tk(money)}</div>`;
    $$('[data-i]', c).forEach(card => { const i = +card.dataset.i, r = rooms[i];
      $$('[data-k]', card).forEach(inp => (inp.onchange = () => { r[inp.dataset.k] = BX.toEnDigits(inp.value); draw(); }));
      $$('[data-type]', card).forEach(b => (b.onclick = () => { r.type = b.dataset.type; draw(); }));
    });
    $$('[data-rm]', c).forEach(b => (b.onclick = () => { rooms.splice(+b.dataset.rm, 1); draw(); }));
  };
  $('#addR', c).onclick = () => { const last = rooms[rooms.length - 1] || {}; rooms.push({ name: L('রুম', 'Room') + ' ' + BX.dg(rooms.length + 1), type: 'floor', l: '', w: '', h: '', minus: '', sqft: '', pid: last.pid || '', wastage: last.wastage || 5, spp: '', ppb: '' }); draw(); };
  const toCart = mode => { const ls = (APP.calcLines || []).filter(l => l.boxes > 0); if (!ls.length) return BX.toast(L('টাইলস বাছাই করে মাপ দিন', 'Choose tiles and enter measurements'), 'bad'); const P = posNew(mode); const accs = APP.cache.accounts || []; P.payments = [{ account_id: cashId(accs), amount: '' }]; APP.pos = P; posSave(); APP.pendingAdd = ls.map(l => ({ product_id: l.p.id, qty: l.boxes, unit: 'box' })); go(mode === 'quote' ? 'pos?mode=quote' : 'pos?keep=1'); };
  const tp = $('#toPos', c); if (tp) tp.onclick = () => toCart('sale');
  const tq = $('#toQ', c); if (tq) tq.onclick = () => toCart('quote');
  const quick = () => { const p = products.find(x => String(x.id) === $('#qp', c).value); if (p) { $('#qspp', c).value = p.sqft_per_pcs; $('#qppb', c).value = p.pcs_per_box; } const spp = nv($('#qspp', c).value), ppb = nv($('#qppb', c).value), spb = spp * ppb; let out = ''; if (nv($('#qb', c).value) && spb) out += `${BX.qty(nv($('#qb', c).value))} ${L('বক্স', 'box')} = <b>${BX.qty(nv($('#qb', c).value) * spb)} sqft</b><br>`; if (nv($('#qs', c).value) && spb) { const m = tileMath({ sqft_per_pcs: spp, pcs_per_box: ppb }, nv($('#qs', c).value), 0); out += `${BX.qty(nv($('#qs', c).value))} sqft = <b>${BX.dg(m.boxes)} ${L('বক্স', 'box')}</b> <span class="small mute">(${BX.boxPcs(nv($('#qs', c).value), { sqft_per_pcs: spp, pcs_per_box: ppb })})</span>`; } $('#qres', c).innerHTML = out; };
  ['#qp', '#qspp', '#qppb', '#qb', '#qs'].forEach(i => ($(i, c).oninput = $(i, c).onchange = quick));
  if (!products.length) $('#rooms', c).insertAdjacentHTML('beforebegin', `<div class="banner warn">${L('কোনো টাইলস পণ্য নেই — ম্যানুয়াল সাইজ দিয়ে হিসাব করুন বা', 'No tile products yet — calculate with manual size or')} <a href="#/products">${L('টাইলস যোগ করুন', 'add tiles')}</a></div>`);
  draw();
};

// ================= EMPLOYEES =================
PAGES.employees = async c => {
  const [rows, accs] = await Promise.all([BX.get('/api/employees'), APP.load('accounts')]);
  c.innerHTML = `<div class="page-head"><h2>🧑‍🔧 ${L('কর্মচারী', 'Employees')}</h2><button class="btn pri" id="ne">➕ ${L('নতুন কর্মচারী', 'New employee')}</button></div>
    ${BX.table([{ h: L('নাম', 'Name'), f: r => `<b>${esc(r.name)}</b><div class="small mute">${esc(r.designation || '')}</div>` }, { h: L('মোবাইল', 'Mobile'), f: r => BX.dg(esc(r.phone || '')) }, { h: L('যোগদান', 'Joined'), f: r => BX.date(r.join_date) }, { h: L('মাসিক বেতন', 'Monthly salary'), n: 1, f: r => BX.tk(r.salary) },
      { h: '', f: r => `<div class="row" style="flex-wrap:nowrap"><button class="btn sm ok" data-pay="${r.id}">💵 ${L('বেতন/অগ্রিম', 'Pay')}</button><button class="btn sm" data-h="${r.id}">📜</button><button class="btn sm" data-ed="${r.id}">✏️</button></div>` }], rows)}
    <div class="right big" style="margin-top:8px">${L('মোট মাসিক বেতন', 'Total monthly salary')}: ${BX.tk(BX.sum(rows, 'salary'))}</div>`;
  const f = [{ k: 'name', label: L('নাম', 'Name'), req: 1 }, { k: 'phone', label: L('মোবাইল', 'Mobile'), type: 'tel' }, { k: 'designation', label: L('পদ', 'Designation'), ph: L('সেলসম্যান, লেবার, ড্রাইভার', 'Salesman, labour, driver') }, { k: 'salary', label: L('মাসিক বেতন', 'Monthly salary'), type: 'number' }, { k: 'join_date', label: L('যোগদানের তারিখ', 'Join date'), type: 'date' }, { k: 'nid', label: L('NID নং', 'NID no') }, { k: 'address', label: L('ঠিকানা', 'Address'), full: 1 }];
  const form = e => BX.formModal(e ? '✏️ ' + esc(e.name) : '➕ ' + L('নতুন কর্মচারী', 'New employee'), e ? f.concat([{ k: 'active', label: L('কর্মরত', 'Active'), type: 'check' }]) : f, e || {}, async v => { if (!v.join_date) delete v.join_date; if (e) await BX.put('/api/employees/' + e.id, v); else await BX.post('/api/employees', v); route(); });
  $('#ne', c).onclick = () => form(null);
  $$('[data-ed]', c).forEach(b => (b.onclick = () => form(rows.find(x => String(x.id) === b.dataset.ed))));
  $$('[data-pay]', c).forEach(b => (b.onclick = () => { const e = rows.find(x => String(x.id) === b.dataset.pay); BX.formModal('💵 ' + esc(e.name), [{ k: 'amount', label: L('টাকা', 'Amount'), type: 'number', req: 1, val: e.salary }, { k: 'account_id', label: L('কোথা থেকে', 'Paid from'), type: 'select', options: accs.map(a => [a.id, a.name]), val: cashId(accs) }, { k: 'date', label: L('তারিখ', 'Date'), type: 'date', val: BX.today() }, { k: 'note', label: L('বিবরণ', 'Details'), ph: L('যেমন: অক্টোবর মাসের বেতন / অগ্রিম', 'e.g. October salary / advance') }], {}, async v => { await BX.post(`/api/employees/${e.id}/salary`, v); APP.drop('accounts'); BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); }); }));
  $$('[data-h]', c).forEach(b => (b.onclick = async () => { const ps = await BX.get(`/api/employees/${b.dataset.h}/payments`); BX.modal({ title: '📜 ' + L('পেমেন্ট হিস্ট্রি', 'Payment history'), wide: 1, body: BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('বিবরণ', 'Details'), k: 'note' }, { h: L('একাউন্ট', 'Account'), k: 'account' }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.tk(r.amount) }], ps) }); }));
};

// ================= DELIVERIES =================
PAGES.deliveries = async c => {
  let st = 'pending';
  c.innerHTML = `<div class="page-head"><h2>🚚 ${L('ডেলিভারি', 'Deliveries')}</h2></div><div class="tabs"><button data-s="pending">${L('বাকি', 'Pending')}</button><button data-s="dispatched">${L('পাঠানো হয়েছে', 'Dispatched')}</button><button data-s="delivered">${L('সম্পন্ন', 'Delivered')}</button><button data-s="">${L('সব', 'All')}</button></div><div id="dl"></div>`;
  const sb = { pending: `<span class="badge warn">${L('বাকি', 'Pending')}</span>`, dispatched: `<span class="badge info">${L('পাঠানো', 'Dispatched')}</span>`, delivered: `<span class="badge ok">${L('সম্পন্ন', 'Delivered')}</span>` };
  const load = async () => {
    $$('.tabs button', c).forEach(b => b.classList.toggle('on', b.dataset.s === st));
    const rows = await BX.get('/api/deliveries?status=' + st);
    $('#dl', c).innerHTML = BX.table([{ h: L('ইনভয়েস', 'Invoice'), f: r => `<b>${esc(r.invoice_no)}</b><div class="small mute">${BX.date(r.date)}</div>` }, { h: L('কাস্টমার', 'Customer'), f: r => esc(r.customer_name) + `<div class="small mute">${BX.dg(esc(r.customer_phone || ''))}</div>` }, { h: L('ঠিকানা', 'Address'), f: r => esc(r.delivery_address || '') },
      { h: L('ডেলিভারি', 'Delivery'), f: r => esc(r.delivery_person || '') + `<div class="small mute">${BX.date(r.delivery_date)}</div>` }, { h: L('বাকি', 'Due'), n: 1, f: r => r.due > 0 ? `<span class="bad">${BX.tk(r.due)}</span>` : '-' }, { h: L('স্ট্যাটাস', 'Status'), f: r => sb[r.delivery_status] || '' },
      { h: '', f: r => `<div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-ch="${r.id}">🖨 ${L('চালান', 'Challan')}</button><button class="btn sm pri" data-up="${r.id}">✏️</button></div>` }], rows);
    $$('[data-ch]', c).forEach(b => (b.onclick = () => printSale(b.dataset.ch, 'a4', true)));
    $$('[data-up]', c).forEach(b => (b.onclick = async () => deliveryModal(await BX.get('/api/sales/' + b.dataset.up))));
  };
  $$('.tabs button', c).forEach(b => (b.onclick = () => { st = b.dataset.s; load(); }));
  load();
};

// ================= REPORTS =================
PAGES.reports = async (c, params) => {
  let tab = params.tab || (can('profit') ? 'pl' : 'sales');
  let from = BX.monthStart(), to = BX.today(), by = 'day';
  const tabs = [...(can('profit') ? [['pl', L('লাভ-ক্ষতি', 'Profit & Loss')]] : []), ['sales', L('বিক্রি', 'Sales')], ['purchases', L('ক্রয়', 'Purchases')], ['collections', L('দৈনিক কালেকশন', 'Daily collection')], ['expenses', L('খরচ', 'Expenses')], ['vat', L('ভ্যাট', 'VAT')], ['stock', L('স্টক মূল্য', 'Stock value')], ['cdue', L('কাস্টমার বাকি', 'Customer due')], ['sdue', L('সাপ্লায়ার পাওনা', 'Supplier payable')]];
  c.innerHTML = `<div class="page-head"><h2>📊 ${L('রিপোর্ট', 'Reports')}</h2><div class="row"><span id="rng">${dateRangeHtml(from, to)}</span><button class="btn" id="csv">⬇ CSV</button><button class="btn" onclick="window.print()">🖨</button></div></div>
    <div class="tabs">${tabs.map(t => `<button data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="rv"></div>`;
  const draw = async () => {
    $$('.tabs button', c).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    $('#rng', c).style.visibility = ['stock', 'cdue', 'sdue'].includes(tab) ? 'hidden' : '';
    const v = $('#rv', c); v.innerHTML = '…';
    const q = `from=${from}&to=${to}`;
    const head = `<div class="mute small" style="margin-bottom:8px">${esc(APP.me.tenant.name)} • ${BX.date(from)} — ${BX.date(to)}</div>`;
    if (tab === 'pl') {
      const d = await BX.get('/api/reports/profit?' + q);
      const line = (l, val, cls, b) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid #f1f3f5;${b ? 'font-weight:700;font-size:17px' : ''}"><span>${l}</span><span class="${cls || ''}">${BX.tk(val)}</span></div>`;
      v.innerHTML = head + `<div class="grid g2"><div class="card"><h3>📈 ${L('লাভ-ক্ষতির হিসাব', 'Profit & loss statement')}</h3>
        ${line(L('মোট বিক্রি', 'Gross sales'), d.gross_sales)}${line('− ' + L('ডিসকাউন্ট', 'Discount'), d.discount, 'bad')}${line('− ' + L('বিক্রয় ফেরত', 'Sales returns'), d.returns, 'bad')}${line('= ' + L('নিট বিক্রি', 'Net sales'), d.net_sales, '', 1)}
        ${line('− ' + L('বিক্রিত মালের ক্রয় মূল্য', 'Cost of goods sold'), d.cogs, 'bad')}${line('= ' + L('মোট লাভ (গ্রস প্রফিট)', 'Gross profit'), d.gross_profit, 'ok', 1)}
        ${line('+ ' + L('ডেলিভারি চার্জ আয়', 'Delivery income'), d.delivery_income, 'ok')}${line('− ' + L('মোট খরচ', 'Total expenses'), d.expense_total, 'bad')}${line('− ' + L('ভাঙা/নষ্ট মালের ক্ষতি', 'Broken / damage loss'), d.damage_loss, 'bad')}
        <div class="row between" style="padding:12px 0;font-size:22px;font-weight:800"><span>${d.net_profit >= 0 ? L('নিট লাভ', 'Net profit') : L('নিট ক্ষতি', 'Net loss')}</span><span class="${d.net_profit >= 0 ? 'ok' : 'bad'}">${BX.tk(d.net_profit)}</span></div>
        <div class="small mute">${L('ভ্যাট আদায় (সরকারের পাওনা, লাভে ধরা হয়নি)', 'VAT collected (payable to govt., excluded)')}: ${BX.tk(d.vat_collected)} • ${BX.dg(d.invoices)} ${L('টি ইনভয়েস', 'invoices')}</div></div>
        <div class="card"><h3>💸 ${L('খরচের খাত', 'Expenses by head')}</h3>${BX.table([{ h: L('খাত', 'Head'), k: 'category' }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.tk(r.amount) }], d.expenses)}
        <div class="small mute" style="margin-top:10px">${L('গ্রস মার্জিন', 'Gross margin')}: <b>${d.net_sales ? BX.num(d.gross_profit / d.net_sales * 100, 1) : 0}%</b></div></div></div>`;
    } else if (tab === 'sales') {
      const d = await BX.get(`/api/reports/sales?${q}&by=${by}`);
      const bys = [['day', L('দিন অনুযায়ী', 'By day')], ['product', L('পণ্য অনুযায়ী', 'By product')], ['category', L('ক্যাটাগরি', 'By category')], ['customer', L('কাস্টমার', 'By customer')], ['user', L('বিক্রেতা', 'By salesman')]];
      const cols = by === 'product' ? [{ h: L('পণ্য', 'Product'), k: 'label' }, { h: L('পরিমাণ', 'Qty'), n: 1, f: r => BX.qty(r.qty) + ' ' + esc(BX.unitLabel(r.unit)) }, { h: L('বিক্রি', 'Sales'), n: 1, f: r => BX.tk(r.total) }, ...(can('profit') ? [{ h: L('লাভ', 'Profit'), n: 1, f: r => BX.tk(r.profit) }] : [])]
        : by === 'category' ? [{ h: L('ক্যাটাগরি', 'Category'), k: 'label' }, { h: L('বিক্রি', 'Sales'), n: 1, f: r => BX.tk(r.total) }, ...(can('profit') ? [{ h: L('লাভ', 'Profit'), n: 1, f: r => BX.tk(r.profit) }] : [])]
        : by === 'customer' ? [{ h: L('কাস্টমার', 'Customer'), f: r => esc(r.label) + ` <span class="small mute">${BX.dg(esc(r.phone || ''))}</span>` }, { h: L('ইনভয়েস', 'Invoices'), n: 1, f: r => BX.dg(r.cnt) }, { h: L('বিক্রি', 'Sales'), n: 1, f: r => BX.tk(r.total) }, { h: L('বাকি', 'Due'), n: 1, f: r => BX.tk(r.due) }]
        : [{ h: by === 'user' ? L('বিক্রেতা', 'Salesman') : L('তারিখ', 'Date'), f: r => by === 'day' ? BX.date(r.label) : esc(r.label) }, { h: L('ইনভয়েস', 'Invoices'), n: 1, f: r => BX.dg(r.cnt) }, { h: L('বিক্রি', 'Sales'), n: 1, f: r => BX.tk(r.total) }, { h: L('জমা', 'Paid'), n: 1, f: r => BX.tk(r.paid) }, { h: L('বাকি', 'Due'), n: 1, f: r => BX.tk(r.due) }, ...(by === 'day' && can('profit') ? [{ h: L('লাভ', 'Profit'), n: 1, f: r => BX.tk(r.profit) }] : [])];
      v.innerHTML = head + `<div class="seg" style="margin-bottom:10px">${bys.map(b => `<button data-by="${b[0]}" class="${b[0] === by ? 'on' : ''}">${b[1]}</button>`).join('')}</div>` + BX.table(cols, d.rows) + `<div class="right big" style="margin-top:8px">${L('মোট', 'Total')}: ${BX.tk(BX.sum(d.rows, 'total'))}</div>`;
      $$('[data-by]', v).forEach(b => (b.onclick = () => { by = b.dataset.by; draw(); }));
    } else if (tab === 'purchases') {
      const d = await BX.get(`/api/reports/purchases?${q}&by=${by === 'product' ? 'product' : 'supplier'}`);
      v.innerHTML = head + `<div class="seg" style="margin-bottom:10px"><button data-by="supplier" class="${by !== 'product' ? 'on' : ''}">${L('সাপ্লায়ার', 'By supplier')}</button><button data-by="product" class="${by === 'product' ? 'on' : ''}">${L('পণ্য', 'By product')}</button></div>` +
        BX.table(by === 'product' ? [{ h: L('পণ্য', 'Product'), k: 'label' }, { h: L('পরিমাণ', 'Qty'), n: 1, f: r => BX.qty(r.qty) + ' ' + esc(BX.unitLabel(r.unit)) }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.tk(r.total) }] : [{ h: L('সাপ্লায়ার', 'Supplier'), k: 'label' }, { h: L('ক্রয় সংখ্যা', 'Count'), n: 1, f: r => BX.dg(r.cnt) }, { h: L('মোট', 'Total'), n: 1, f: r => BX.tk(r.total) }, { h: L('পরিশোধ', 'Paid'), n: 1, f: r => BX.tk(r.paid) }, { h: L('বাকি', 'Due'), n: 1, f: r => BX.tk(r.due) }], d.rows) + `<div class="right big" style="margin-top:8px">${L('মোট', 'Total')}: ${BX.tk(BX.sum(d.rows, 'total'))}</div>`;
      $$('[data-by]', v).forEach(b => (b.onclick = () => { by = b.dataset.by; draw(); }));
    } else if (tab === 'collections') {
      const d = await BX.get('/api/reports/collections?' + q);
      const tt = TXT();
      v.innerHTML = head + `<div class="row" style="margin-bottom:10px;gap:8px">${d.byAcc.map(a => `<span class="stat" style="padding:8px 12px"><span class="l">${esc(a.account)}</span> <b>${BX.tk(a.total)}</b></span>`).join('')}</div>` + BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('ধরন', 'Type'), f: r => tt[r.type] || r.type }, { h: L('কাস্টমার', 'Customer'), k: 'party' }, { h: L('বিবরণ', 'Details'), k: 'note' }, { h: L('একাউন্ট', 'Account'), k: 'account' }, { h: L('ইউজার', 'By'), k: 'user_name' }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.tk(r.amount) }], d.rows) + `<div class="right big" style="margin-top:8px">${L('মোট কালেকশন', 'Total collection')}: ${BX.tk(BX.sum(d.rows, 'amount'))}</div>`;
    } else if (tab === 'expenses') {
      const d = await BX.get('/api/reports/expenses?' + q);
      v.innerHTML = head + BX.table([{ h: L('খাত', 'Head'), k: 'label' }, { h: L('সংখ্যা', 'Count'), n: 1, f: r => BX.dg(r.cnt) }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.tk(r.total) }], d.rows) + `<div class="right big" style="margin-top:8px">${L('মোট', 'Total')}: ${BX.tk(BX.sum(d.rows, 'total'))}</div>`;
    } else if (tab === 'vat') {
      const d = await BX.get('/api/reports/vat?' + q);
      v.innerHTML = head + `<div class="grid g3" style="margin-bottom:12px"><div class="stat"><div class="l">${L('করযোগ্য বিক্রি', 'Taxable sales')}</div><div class="v">${BX.tk(BX.sum(d.rows, 'taxable'))}</div></div><div class="stat amber"><div class="l">${L('মোট ভ্যাট', 'Total VAT')}</div><div class="v">${BX.tk(BX.sum(d.rows, 'vat'))}</div></div></div>` +
        BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('ইনভয়েস', 'Invoices'), n: 1, f: r => BX.dg(r.cnt) }, { h: L('করযোগ্য', 'Taxable'), n: 1, f: r => BX.tk(r.taxable) }, { h: L('ভ্যাট', 'VAT'), n: 1, f: r => BX.tk(r.vat) }, { h: L('মোট', 'Total'), n: 1, f: r => BX.tk(r.total) }], d.rows) +
        `<h3 style="margin-top:14px">${L('ভ্যাটসহ ইনভয়েস', 'Invoices with VAT')}</h3>` + BX.table([{ h: L('ইনভয়েস', 'Invoice'), k: 'invoice_no' }, { h: L('তারিখ', 'Date'), f: r => BX.date(r.date) }, { h: L('কাস্টমার', 'Customer'), k: 'customer_name' }, { h: L('করযোগ্য', 'Taxable'), n: 1, f: r => BX.tk(r.taxable) }, { h: L('ভ্যাট', 'VAT'), n: 1, f: r => BX.tk(r.vat) }], d.invoices);
    } else if (tab === 'stock') {
      const rows = await BX.get('/api/reports/stock-value');
      v.innerHTML = `<div class="grid g3" style="margin-bottom:12px">${can('profit') ? `<div class="stat"><div class="l">${L('স্টক মূল্য (ক্রয়)', 'Stock value (cost)')}</div><div class="v">${BX.tk(BX.sum(rows, 'cost_value'))}</div></div>` : ''}<div class="stat green"><div class="l">${L('স্টক মূল্য (বিক্রয়)', 'Stock value (sale)')}</div><div class="v">${BX.tk(BX.sum(rows, 'sale_value'))}</div></div></div>` +
        BX.table([{ h: L('পণ্য', 'Product'), f: r => esc(r.name) + ' ' + esc(r.size || '') }, { h: L('ক্যাটাগরি', 'Category'), k: 'category' }, { h: L('স্টক', 'Stock'), n: 1, f: r => BX.stockText(r.qty, r) }, ...(can('profit') ? [{ h: L('ক্রয় মূল্যে', 'At cost'), n: 1, f: r => BX.tk(r.cost_value) }] : []), { h: L('বিক্রয় মূল্যে', 'At sale price'), n: 1, f: r => BX.tk(r.sale_value) }], rows);
    } else if (tab === 'cdue') {
      const rows = (await BX.get('/api/customers?due=1')).sort((a, b) => b.balance - a.balance);
      v.innerHTML = BX.table([{ h: L('কাস্টমার', 'Customer'), k: 'name' }, { h: L('মোবাইল', 'Mobile'), f: r => BX.dg(esc(r.phone || '')) }, { h: L('শেষ জমা', 'Last paid'), f: r => BX.date(r.last_payment) }, { h: L('দিন', 'Days'), n: 1, f: r => BX.dg(r.days_since) }, { h: L('বাকি', 'Due'), n: 1, f: r => BX.tk(r.balance) }], rows) + `<div class="right big" style="margin-top:8px">${L('মোট', 'Total')}: ${BX.tk(BX.sum(rows, 'balance'))}</div>`;
    } else if (tab === 'sdue') {
      const rows = await BX.get('/api/suppliers?due=1');
      v.innerHTML = BX.table([{ h: L('সাপ্লায়ার', 'Supplier'), k: 'name' }, { h: L('মোবাইল', 'Mobile'), f: r => BX.dg(esc(r.phone || '')) }, { h: L('শেষ পেমেন্ট', 'Last paid'), f: r => BX.date(r.last_payment) }, { h: L('পাওনা', 'Payable'), n: 1, f: r => BX.tk(r.balance) }], rows) + `<div class="right big" style="margin-top:8px">${L('মোট', 'Total')}: ${BX.tk(BX.sum(rows, 'balance'))}</div>`;
    }
  };
  $$('.tabs button', c).forEach(b => (b.onclick = () => { tab = b.dataset.t; by = tab === 'purchases' ? 'supplier' : 'day'; draw(); }));
  bindRange(c, (a, b) => { from = a; to = b; draw(); });
  $('#csv', c).onclick = () => { const t = $('#rv table', c); if (!t) return; const rows = $$('tr', t).map(tr => $$('th,td', tr).map(td => td.innerText.replace(/\n/g, ' ').trim())); BX.download(`report-${tab}-${from}-${to}.csv`, '﻿' + BX.csv(rows), 'text/csv'); };
  draw();
};

// ================= SETTINGS =================
PAGES.settings = async c => {
  const d = await BX.get('/api/settings');
  const st = d.settings;
  let tab = 'shop';
  c.innerHTML = `<div class="page-head"><h2>⚙️ ${L('দোকান সেটিংস', 'Shop settings')}</h2></div>
    <div class="tabs"><button data-t="shop">${L('দোকানের তথ্য', 'Shop info')}</button><button data-t="invoice">${L('ইনভয়েস ও ভ্যাট', 'Invoice & VAT')}</button><button data-t="general">${L('সাধারণ', 'General')}</button><button data-t="catalog">${L('অনলাইন ক্যাটালগ', 'Online catalog')}</button><button data-t="sms">SMS</button><button data-t="branches">${L('ব্রাঞ্চ', 'Branches')}</button><button data-t="backup">${L('ব্যাকআপ', 'Backup')}</button></div><div id="sv"></div>`;
  const save = async (body, msg) => { await BX.put('/api/settings', body); BX.toast(msg || L('সেভ হয়েছে', 'Saved'), 'ok'); APP.me = await BX.get('/api/me'); shell(); };
  const draw = async () => {
    $$('.tabs button', c).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const v = $('#sv', c);
    if (tab === 'shop') {
      v.innerHTML = `<div class="card" style="max-width:760px">${BX.formHtml([{ k: 'name', label: L('দোকানের নাম', 'Shop name'), req: 1 }, { k: 'owner_name', label: L('মালিকের নাম', 'Owner name') }, { k: 'email', label: L('ইমেইল', 'Email') }, { k: 'business_type', label: L('ব্যবসার ধরন', 'Business type'), type: 'select', options: [['tile', L('টাইলস ও স্যানিটারি', 'Tile & sanitary')], ['sanitary', L('স্যানিটারি', 'Sanitary')], ['hardware', L('হার্ডওয়্যার', 'Hardware')], ['wholesale', L('হোলসেল', 'Wholesale')]] }, { k: 'address', label: L('ঠিকানা (ইনভয়েসে যাবে)', 'Address (shown on invoice)'), type: 'textarea', full: 1 }], d)}
        <p class="small mute">${L('মোবাইল', 'Mobile')}: <b>${BX.dg(esc(d.phone))}</b> • ${L('শপ আইডি', 'Shop ID')}: <b>${esc(d.slug)}</b> ${L('(পরিবর্তনের জন্য সাপোর্টে কল করুন)', '(call support to change)')}</p>
        <div class="f"><label>${L('লোগো', 'Logo')}</label><div class="row"><img id="lg" src="${st.logo || ''}" style="height:60px;${st.logo ? '' : 'display:none'}"><input type="file" accept="image/*" id="lf" class="in" style="width:auto">${st.logo ? `<button class="btn sm" id="lx">${L('মুছুন', 'Remove')}</button>` : ''}</div></div>
        <button class="btn pri" id="sv1" style="margin-top:12px">💾 ${L('সেভ', 'Save')}</button></div>`;
      let logo = st.logo;
      $('#lf', v).onchange = async e => { logo = await BX.imageToData(e.target.files[0], 300); $('#lg', v).src = logo; $('#lg', v).style.display = ''; };
      const lx = $('#lx', v); if (lx) lx.onclick = () => { logo = ''; $('#lg', v).style.display = 'none'; };
      $('#sv1', v).onclick = async () => { try { const f = ['name', 'owner_name', 'email', 'business_type', 'address']; const o = {}; f.forEach(k => (o[k] = $(`[name=${k}]`, v).value)); await save({ ...o, settings: { logo } }); } catch (e) { BX.err(e); } };
    } else if (tab === 'invoice') {
      const fields = [{ k: 'invoice_prefix', label: L('ইনভয়েস নং শুরু', 'Invoice prefix') }, { k: 'quote_prefix', label: L('কোটেশন নং শুরু', 'Quotation prefix') }, { k: 'purchase_prefix', label: L('ক্রয় নং শুরু', 'Purchase prefix') }, { k: 'return_prefix', label: L('ফেরত নং শুরু', 'Return prefix') },
        { k: 'invoice_size', label: L('ইনভয়েস সাইজ', 'Invoice size'), type: 'select', options: [['a4', 'A4'], ['pos80', 'POS 80mm']] }, { k: 'invoice_lang', label: L('ইনভয়েসের ভাষা', 'Invoice language'), type: 'select', options: [['bn', 'বাংলা'], ['en', 'English']] },
        { k: 'vat_percent', label: L('ডিফল্ট ভ্যাট %', 'Default VAT %'), type: 'number' }, { k: 'vat_reg_no', label: L('ভ্যাট রেজি. (BIN)', 'VAT reg. (BIN)') },
        { k: 'show_prev_due', label: L('ইনভয়েসে পূর্বের বাকি দেখাবে', 'Show previous due on invoice'), type: 'check', full: 1 }, { k: 'invoice_footer', label: L('ইনভয়েসের নিচে লেখা', 'Invoice footer text'), type: 'textarea', full: 1 }];
      v.innerHTML = `<div class="card" style="max-width:760px">${BX.formHtml(fields, st)}<button class="btn pri" id="svx" style="margin-top:12px">💾 ${L('সেভ', 'Save')}</button></div>`;
      $('#svx', v).onclick = async () => { try { await save({ settings: BX.formVals(v, fields) }); } catch (e) { BX.err(e); } };
    } else if (tab === 'general') {
      const fields = [{ k: 'language', label: L('ডিফল্ট ভাষা', 'Default language'), type: 'select', options: [['bn', 'বাংলা'], ['en', 'English']] }, { k: 'digits', label: L('সংখ্যা', 'Numbers'), type: 'select', options: [['bn', '১,০০০ (বাংলা)'], ['en', '1,000 (English)']] },
        { k: 'default_wastage', label: L('টাইলস ওয়েস্টেজ ডিফল্ট %', 'Default tile wastage %'), type: 'number' }, { k: 'allow_negative_stock', label: L('স্টক না থাকলেও বিক্রি করা যাবে', 'Allow selling without stock'), type: 'check' }];
      v.innerHTML = `<div class="card" style="max-width:760px">${BX.formHtml(fields, st)}<button class="btn pri" id="svx" style="margin-top:12px">💾 ${L('সেভ', 'Save')}</button></div>`;
      $('#svx', v).onclick = async () => { try { const o = BX.formVals(v, fields); await save({ settings: o }); BX.setLang(o.language); BX.setDigits(o.digits); shell(); route(); } catch (e) { BX.err(e); } };
    } else if (tab === 'catalog') {
      const url = location.origin + '/c/' + d.slug;
      const fields = [{ k: 'catalog_enabled', label: L('অনলাইন ক্যাটালগ চালু', 'Online catalog enabled'), type: 'check' }, { k: 'catalog_show_price', label: L('দাম দেখাবে', 'Show prices'), type: 'check' }, { k: 'whatsapp', label: L('অর্ডারের WhatsApp নাম্বার', 'WhatsApp number for orders'), type: 'tel' }];
      v.innerHTML = `<div class="card" style="max-width:760px"><p>${L('আপনার পণ্যের অনলাইন ক্যাটালগ — ফেসবুক পেজে শেয়ার করুন। কাস্টমার WhatsApp-এ অর্ডার দিতে পারবে।', 'Your online product catalog — share it on your Facebook page. Customers can order via WhatsApp.')}</p>
        <div class="row" style="margin-bottom:12px"><input class="in grow" value="${esc(url)}" readonly id="cu"><button class="btn" id="cp">📋 ${L('কপি', 'Copy')}</button><a class="btn" target="_blank" href="${esc(url)}">↗ ${L('দেখুন', 'Open')}</a></div>${BX.formHtml(fields, st)}<button class="btn pri" id="svx" style="margin-top:12px">💾 ${L('সেভ', 'Save')}</button></div>`;
      $('#cp', v).onclick = () => { navigator.clipboard && navigator.clipboard.writeText(url); BX.toast(L('কপি হয়েছে', 'Copied'), 'ok'); };
      $('#svx', v).onclick = async () => { try { await save({ settings: BX.formVals(v, fields) }); } catch (e) { BX.err(e); } };
    } else if (tab === 'sms') {
      const fields = [{ k: 'sms_due_template', label: L('বাকির রিমাইন্ডার SMS', 'Due reminder SMS') + ' — {name} {due} {shop} {phone}', type: 'textarea', full: 1 }, { k: 'sms_on_sale', label: L('বিক্রির পর কাস্টমারকে অটো SMS', 'Auto SMS to customer after sale'), type: 'check', full: 1 }, { k: 'sms_sale_template', label: L('বিক্রির SMS', 'Sale SMS') + ' — {name} {total} {paid} {due} {invoice} {shop}', type: 'textarea', full: 1 }];
      const logs = can('sms') ? await BX.get('/api/sms/logs') : [];
      v.innerHTML = `<div class="card" style="max-width:760px"><div class="stat" style="margin-bottom:12px"><div class="l">${L('SMS ব্যালেন্স', 'SMS balance')}</div><div class="v">${BX.dg(d.sms_balance)}</div><div class="small mute">${L('SMS কিনতে সাপোর্টে যোগাযোগ করুন', 'Contact support to buy SMS')}: ${BX.dg(esc(APP.me.platform.support_phone || ''))}</div></div>${BX.formHtml(fields, st)}<button class="btn pri" id="svx" style="margin-top:12px">💾 ${L('সেভ', 'Save')}</button></div>
        <h3 style="margin-top:16px">${L('পাঠানো SMS', 'Sent SMS')}</h3>${BX.table([{ h: L('সময়', 'Time'), f: r => BX.dateTime(r.created_at) }, { h: L('নাম্বার', 'Number'), k: 'to_number' }, { h: L('মেসেজ', 'Message'), k: 'message' }, { h: L('স্ট্যাটাস', 'Status'), f: r => `<span class="badge ${r.status === 'sent' ? 'ok' : 'bad'}">${esc(r.status)}</span>` }], logs)}`;
      $('#svx', v).onclick = async () => { try { await save({ settings: BX.formVals(v, fields) }); } catch (e) { BX.err(e); } };
    } else if (tab === 'branches') {
      const rows = await BX.get('/api/branches?all=1');
      v.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="grow mute">${L('একাধিক শোরুম/গোডাউন থাকলে ব্রাঞ্চ যোগ করুন। প্রতিটি ব্রাঞ্চের স্টক আলাদা থাকবে।', 'Add a branch for each showroom/godown. Each branch keeps its own stock.')}</span><button class="btn pri" id="nb">➕ ${L('নতুন ব্রাঞ্চ', 'New branch')}</button></div>` + BX.table([{ h: L('নাম', 'Name'), k: 'name' }, { h: L('ঠিকানা', 'Address'), k: 'address' }, { h: L('মোবাইল', 'Mobile'), k: 'phone' }, { h: L('স্ট্যাটাস', 'Status'), f: r => r.active ? `<span class="badge ok">${L('চালু', 'Active')}</span>` : `<span class="badge">${L('বন্ধ', 'Inactive')}</span>` }], rows, { click: 1 });
      const f = [{ k: 'name', label: L('নাম', 'Name'), req: 1 }, { k: 'phone', label: L('মোবাইল', 'Mobile') }, { k: 'address', label: L('ঠিকানা', 'Address'), full: 1 }];
      const form = b => BX.formModal(b ? esc(b.name) : L('নতুন ব্রাঞ্চ', 'New branch'), b ? f.concat([{ k: 'active', label: L('চালু', 'Active'), type: 'check' }]) : f, b || {}, async val => { if (b) await BX.put('/api/branches/' + b.id, val); else await BX.post('/api/branches', val); APP.me = await BX.get('/api/me'); shell(); draw(); });
      $('#nb', v).onclick = () => form(null);
      BX.bindRows(v, rows, form);
    } else if (tab === 'backup') {
      v.innerHTML = `<div class="card" style="max-width:760px"><h3>💾 ${L('ডাটা ব্যাকআপ', 'Data backup')}</h3><p>${L('আপনার সব তথ্য প্রতিদিন রাত ৩টায় সার্ভারে অটো ব্যাকআপ হয়। চাইলে নিজের কাছেও একটি কপি ডাউনলোড করে রাখতে পারেন।', 'All your data is backed up automatically on the server every night at 3 AM. You can also download a copy for yourself.')}</p>
        <a class="btn pri" href="/api/backup/export" download>⬇ ${L('সম্পূর্ণ ব্যাকআপ ডাউনলোড (JSON)', 'Download full backup (JSON)')}</a>
        <h3 style="margin-top:18px">📤 ${L('এক্সেলে ডাটা', 'Data for Excel')}</h3><div class="row"><button class="btn" id="e1">⬇ ${L('পণ্য ও স্টক', 'Products & stock')}</button><button class="btn" id="e2">⬇ ${L('কাস্টমার ও বাকি', 'Customers & due')}</button></div></div>`;
      $('#e1', v).onclick = async () => { const r = await BX.get('/api/products'); BX.download('products.csv', '﻿' + BX.csv([['Name', 'Type', 'Size', 'Category', 'Brand', 'Base unit', 'Stock', 'Cost', 'Retail', 'Wholesale', 'Barcode']].concat(r.map(p => [p.name, p.kind, p.size, p.category, p.brand, p.base_unit, p.stock, p.purchase_price, p.retail_price, p.wholesale_price, p.barcode]))), 'text/csv'); };
      $('#e2', v).onclick = async () => { const r = await BX.get('/api/customers'); BX.download('customers.csv', '﻿' + BX.csv([['Name', 'Mobile', 'Type', 'Address', 'Due']].concat(r.map(x => [x.name, x.phone, x.type, x.address, x.balance]))), 'text/csv'); };
    }
  };
  $$('.tabs button', c).forEach(b => (b.onclick = () => { tab = b.dataset.t; draw(); }));
  draw();
};

// ================= USERS & ROLES =================
const PERM_LABELS = () => ({ dashboard: L('ড্যাশবোর্ড', 'Dashboard'), pos: L('বিক্রি করা (POS)', 'Make sales (POS)'), sales: L('বিক্রির তালিকা দেখা', 'View sales'), sales_return: L('বিক্রয় ফেরত', 'Sales return'), sales_delete: L('ইনভয়েস/ক্রয় মুছা', 'Delete invoice/purchase'), quotation: L('কোটেশন', 'Quotation'),
  products: L('পণ্য যোগ/এডিট', 'Add/edit products'), stock: L('স্টক দেখা', 'View stock'), stock_adjust: L('স্টক সমন্বয়/ভাঙা/ট্রান্সফার', 'Adjust/damage/transfer stock'), purchase: L('ক্রয়', 'Purchase'), customers: L('কাস্টমার', 'Customers'), suppliers: L('সাপ্লায়ার', 'Suppliers'),
  due_collect: L('বাকি আদায়', 'Collect due'), supplier_pay: L('সাপ্লায়ার পেমেন্ট', 'Pay supplier'), expenses: L('খরচ', 'Expenses'), cashbook: L('ক্যাশবুক', 'Cashbook'), accounts: L('একাউন্ট ও ট্রান্সফার', 'Accounts & transfer'), reports: L('রিপোর্ট', 'Reports'), profit: L('লাভ-ক্ষতি ও ক্রয়মূল্য দেখা', 'See profit & cost price'),
  employees: L('কর্মচারী ও বেতন', 'Employees & salary'), delivery: L('ডেলিভারি', 'Delivery'), sms: L('SMS পাঠানো', 'Send SMS'), settings: L('দোকান সেটিংস', 'Shop settings'), users: L('ইউজার ও পারমিশন', 'Users & permissions') });
PAGES.users = async c => {
  let tab = 'users';
  c.innerHTML = `<div class="page-head"><h2>🔐 ${L('ইউজার ও পারমিশন', 'Users & permissions')}</h2></div><div class="tabs"><button data-t="users">${L('ইউজার', 'Users')}</button><button data-t="roles">${L('রোল ও পারমিশন', 'Roles & permissions')}</button><button data-t="log">${L('কার্যকলাপ লগ', 'Activity log')}</button></div><div id="uv"></div>`;
  const draw = async () => {
    $$('.tabs button', c).forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const v = $('#uv', c);
    const roles = await APP.load('roles', true);
    if (tab === 'users') {
      const users = await BX.get('/api/users');
      v.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="grow mute">${L('প্রত্যেক কর্মচারীকে আলাদা লগইন দিন। শপ আইডি', 'Give each staff their own login. Shop ID')}: <b>${esc(APP.me.tenant.slug)}</b></span><button class="btn pri" id="nu">➕ ${L('নতুন ইউজার', 'New user')}</button></div>` +
        BX.table([{ h: L('নাম', 'Name'), f: u => `<b>${esc(u.name)}</b><div class="small mute">${esc(u.phone || '')}</div>` }, { h: L('ইউজারনেম', 'Username'), k: 'username' }, { h: L('রোল', 'Role'), f: u => `<span class="badge ${u.is_owner ? 'info' : ''}">${esc(u.role_name || '-')}</span>` }, { h: L('ব্রাঞ্চ', 'Branch'), f: u => esc(u.branch || L('সব', 'All')) }, { h: L('শেষ লগইন', 'Last login'), f: u => BX.dateTime(u.last_login) }, { h: L('স্ট্যাটাস', 'Status'), f: u => u.active ? `<span class="badge ok">${L('চালু', 'Active')}</span>` : `<span class="badge bad">${L('বন্ধ', 'Disabled')}</span>` }], users, { click: 1 });
      const form = u => {
        const f = [{ k: 'name', label: L('নাম', 'Name'), req: 1 }, { k: 'username', label: L('ইউজারনেম (লগইনের জন্য)', 'Username (for login)'), req: 1 }, { k: 'phone', label: L('মোবাইল', 'Mobile'), type: 'tel' }, { k: 'role_id', label: L('রোল', 'Role'), type: 'select', options: roles.map(r => [r.id, r.name]) },
          { k: 'branch_id', label: L('ব্রাঞ্চ', 'Branch'), type: 'select', options: [['', L('সব ব্রাঞ্চ', 'All branches')]].concat(APP.me.branches.map(b => [b.id, b.name])) }, { k: 'password', label: u ? L('নতুন পাসওয়ার্ড (খালি রাখলে আগেরটা)', 'New password (blank = keep)') : L('পাসওয়ার্ড', 'Password'), type: 'password', req: !u }, ...(u ? [{ k: 'active', label: L('চালু', 'Active'), type: 'check' }] : [])];
        BX.formModal(u ? '✏️ ' + esc(u.name) : '➕ ' + L('নতুন ইউজার', 'New user'), f, u ? { ...u, password: '' } : { role_id: (roles[2] || roles[0]).id }, async val => { if (u) await BX.put('/api/users/' + u.id, val); else await BX.post('/api/users', val); draw(); });
      };
      $('#nu', v).onclick = () => form(null);
      BX.bindRows(v, users, form);
    } else if (tab === 'roles') {
      const PL = PERM_LABELS();
      v.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="grow mute">${L('প্রতিটি রোলে কী কী করা যাবে টিক দিন', 'Tick what each role can do')}</span><button class="btn pri" id="nr">➕ ${L('নতুন রোল', 'New role')}</button></div>` + roles.map(r => `<div class="card" style="margin-bottom:10px" data-r="${r.id}"><div class="row between"><input class="in sm" style="max-width:300px;font-weight:700" data-name value="${esc(r.name)}" ${r.is_owner ? 'readonly' : ''}>${r.is_owner ? `<span class="badge info">${L('সব অনুমতি', 'Full access')}</span>` : `<div class="row"><button class="btn sm pri" data-save>💾</button><button class="btn sm danger" data-del>🗑</button></div>`}</div>
        ${r.is_owner ? '' : `<div class="grid g4" style="margin-top:10px">${APP.me.perms_all.map(p => `<label class="chk small"><input type="checkbox" value="${p}" ${r.perms.includes(p) ? 'checked' : ''}> ${PL[p] || p}</label>`).join('')}</div>`}</div>`).join('');
      $('#nr', v).onclick = async () => { const n = prompt(L('রোলের নাম', 'Role name')); if (!n) return; await BX.post('/api/roles', { name: n, perms: ['dashboard'] }); draw(); };
      $$('[data-r]', v).forEach(card => {
        const id = card.dataset.r;
        const sb = $('[data-save]', card); if (sb) sb.onclick = async () => { try { await BX.put('/api/roles/' + id, { name: $('[data-name]', card).value, perms: $$('input[type=checkbox]:checked', card).map(x => x.value) }); BX.toast(L('সেভ হয়েছে', 'Saved'), 'ok'); } catch (e) { BX.err(e); } };
        const db = $('[data-del]', card); if (db) db.onclick = async () => { if (!(await BX.confirm(L('রোল মুছবেন?', 'Delete role?')))) return; try { await BX.del('/api/roles/' + id); draw(); } catch (e) { BX.err(e); } };
      });
    } else {
      const rows = await BX.get('/api/activity');
      v.innerHTML = BX.table([{ h: L('সময়', 'Time'), f: r => BX.dateTime(r.created_at) }, { h: L('ইউজার', 'User'), k: 'user_name' }, { h: L('কাজ', 'Action'), k: 'action' }, { h: L('বিবরণ', 'Details'), k: 'detail' }], rows);
    }
  };
  $$('.tabs button', c).forEach(b => (b.onclick = () => { tab = b.dataset.t; draw(); }));
  draw();
};

// ================= BILLING =================
PAGES.billing = async c => {
  const b = await BX.get('/api/billing');
  const days = Math.round((new Date(b.plan_expires) - new Date(b.today)) / 864e5);
  const stB = { pending: `<span class="badge warn">${L('যাচাই হচ্ছে', 'Pending')}</span>`, approved: `<span class="badge ok">${L('অনুমোদিত', 'Approved')}</span>`, rejected: `<span class="badge bad">${L('বাতিল', 'Rejected')}</span>` };
  c.innerHTML = `<div class="page-head"><h2>💳 ${L('সাবস্ক্রিপশন', 'Subscription')}</h2></div>
    <div class="grid g3"><div class="stat ${b.expired ? 'red' : days <= 5 ? 'amber' : 'green'}"><div class="l">${L('মেয়াদ', 'Valid until')}</div><div class="v">${BX.date(b.plan_expires)}</div><div class="small mute">${b.expired ? L('মেয়াদ শেষ', 'Expired') : BX.dg(days) + ' ' + L('দিন বাকি', 'days left')}</div></div>
      <div class="stat"><div class="l">${L('প্যাকেজ', 'Package')}</div><div class="v" style="font-size:17px">${L('সব ফিচার', 'All features')}</div><div class="small mute">${L('আনলিমিটেড ইউজার, ব্রাঞ্চ, পণ্য', 'Unlimited users, branches, products')}</div></div>
      <div class="stat blue"><div class="l">${L('সাহায্য দরকার?', 'Need help?')}</div><div class="v" style="font-size:17px"><a href="tel:${esc(b.support_phone)}">📞 ${BX.dg(esc(b.support_phone))}</a></div></div></div>
    ${APP.me.user.is_owner ? `<div class="card" style="margin-top:14px"><h3>🔄 ${L('রিনিউ করুন', 'Renew')}</h3>
      <div class="grid g3" id="plans">${b.plans.map((p, i) => `<label class="card" style="cursor:pointer;text-align:center"><input type="radio" name="pl" value="${p.months}" ${i === 0 ? 'checked' : ''}> <b>${esc(L(p.label_bn, p.label_en))}</b><div class="big">${BX.tk(p.price)}</div></label>`).join('')}</div>
      <div class="grid g2" style="margin-top:12px"><div>${b.payment_methods.map(m => `<div class="card" style="margin-bottom:8px;background:#fdf2f8"><b>${esc(m.name)}</b>: <span class="big">${BX.dg(esc(m.number))}</span> <span class="small mute">${esc(m.type || '')}</span></div>`).join('')}<p class="small">${esc(L(b.instructions_bn, b.instructions_en))}</p></div>
        <div><div class="f"><label>${L('কোন মাধ্যমে পাঠিয়েছেন', 'Paid via')}</label><select class="in" id="pm">${b.payment_methods.map(m => `<option>${esc(m.name)}</option>`).join('')}</select></div>
          <div class="f" style="margin-top:8px"><label>${L('যে নাম্বার থেকে পাঠিয়েছেন', 'Sender number')}</label><input class="in" id="ps" inputmode="tel"></div>
          <div class="f" style="margin-top:8px"><label>Transaction ID *</label><input class="in" id="pt" style="text-transform:uppercase"></div>
          <button class="btn pri block" style="margin-top:12px" id="sub">✅ ${L('জমা দিন', 'Submit')}</button></div></div></div>` : `<div class="banner info" style="margin-top:12px">${L('রিনিউ করতে দোকানের মালিককে বলুন', 'Ask the shop owner to renew')}</div>`}
    <h3 style="margin-top:16px">${L('পেমেন্ট হিস্ট্রি', 'Payment history')}</h3>${BX.table([{ h: L('তারিখ', 'Date'), f: r => BX.dateTime(r.created_at) }, { h: L('মাস', 'Months'), n: 1, f: r => BX.dg(r.months) }, { h: L('টাকা', 'Amount'), n: 1, f: r => BX.tk(r.amount) }, { h: L('মাধ্যম', 'Method'), k: 'method' }, { h: 'TrxID', k: 'trx_id' }, { h: L('স্ট্যাটাস', 'Status'), f: r => (stB[r.status] || r.status) + (r.admin_note ? `<div class="small mute">${esc(r.admin_note)}</div>` : '') }], b.requests)}`;
  const sub = $('#sub', c);
  if (sub) sub.onclick = async () => { try { await BX.post('/api/billing/request', { months: $('input[name=pl]:checked', c).value, method: $('#pm', c).value, sender: BX.toEnDigits($('#ps', c).value), trx_id: $('#pt', c).value.trim() }); BX.toast(L('জমা হয়েছে — যাচাই করে চালু করা হবে', 'Submitted — will be activated after verification'), 'ok'); route(); } catch (e) { BX.err(e); } };
};

boot();

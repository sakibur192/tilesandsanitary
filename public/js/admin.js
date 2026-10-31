// Baybex Tile ERP — Super Admin panel
BX.lang = 'en'; BX.digits = 'en';
const AP = {};
const AMENU = [['dashboard', '📊', 'Dashboard'], ['shops', '🏬', 'Shops (Tenants)'], ['payments', '💳', 'Payment Requests'], ['settings', '⚙️', 'Platform Settings'], ['pricing', '💰', 'Pricing & Payment'], ['landing', '🌐', 'Landing Page'], ['sms', '✉️', 'SMS Gateway'], ['backups', '💾', 'Backups'], ['admins', '🛡', 'Admins']];
BX.onUnauthorized = () => showLogin();

function showLogin() { $('#login').classList.remove('hidden'); $('#appWrap').classList.add('hidden'); }
$('#lb').onclick = async () => { try { await BX.post('/api/admin/login', { username: $('#lu').value.trim(), password: $('#lp').value }); boot(); } catch (e) { BX.err(e); } };
$('#lp').onkeydown = e => { if (e.key === 'Enter') $('#lb').click(); };
$('#logout').onclick = async () => { await BX.post('/api/admin/logout'); location.reload(); };
$('#menuBtn').onclick = () => { $('#side').classList.add('open'); $('#overlay').classList.add('open'); };
$('#overlay').onclick = () => { $('#side').classList.remove('open'); $('#overlay').classList.remove('open'); };

async function boot() {
  let me; try { me = await BX.get('/api/admin/me'); } catch (e) { return; }
  $('#login').classList.add('hidden'); $('#appWrap').classList.remove('hidden');
  $('#adminName').textContent = me.name;
  $('#menu').innerHTML = AMENU.map(m => `<a href="#/${m[0]}" data-id="${m[0]}"><span class="ic">${m[1]}</span>${m[2]}</a>`).join('');
  window.onhashchange = aroute; aroute();
}
async function aroute() {
  $('#side').classList.remove('open'); $('#overlay').classList.remove('open');
  const name = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  const page = AP[name] ? name : 'dashboard';
  $$('#menu a').forEach(a => a.classList.toggle('on', a.dataset.id === page));
  $('#pageTitle').textContent = (AMENU.find(m => m[0] === page) || [])[2] || '';
  const c = $('#content'); c.innerHTML = '<div class="empty">Loading…</div>';
  try { await AP[page](c); } catch (e) { c.innerHTML = `<div class="card bad">${esc(e.message)}</div>`; }
}

AP.dashboard = async c => {
  const d = await BX.get('/api/admin/stats');
  c.innerHTML = `<div class="grid g4">
    <div class="stat"><div class="l">Total shops</div><div class="v">${d.total}</div><div class="small mute">+${d.new7} in last 7 days</div></div>
    <div class="stat green"><div class="l">Active (paid/trial)</div><div class="v">${d.active}</div></div>
    <div class="stat red"><div class="l">Expired</div><div class="v">${d.expired}</div><div class="small mute">${d.suspended} suspended</div></div>
    <a class="stat amber" href="#/payments"><div class="l">Pending payments</div><div class="v">${d.pending}</div></a>
    <div class="stat blue"><div class="l">Revenue this month</div><div class="v">${BX.tk(d.revenue_month)}</div></div>
    <div class="stat navy"><div class="l">Revenue total</div><div class="v">${BX.tk(d.revenue_total)}</div></div>
    <div class="stat"><div class="l">Invoices (all shops)</div><div class="v">${BX.num(d.invoices)}</div></div>
    <div class="stat"><div class="l">Users (all shops)</div><div class="v">${d.users}</div></div></div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>⏳ Expiring in 7 days</h3>${BX.table([{ h: 'Shop', k: 'name' }, { h: 'Phone', f: r => `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` }, { h: 'Expires', f: r => BX.date(r.plan_expires) }], d.expiring)}</div>
    <div class="card"><h3>🆕 Recent signups</h3>${BX.table([{ h: 'Shop', k: 'name' }, { h: 'Type', k: 'business_type' }, { h: 'Phone', k: 'phone' }, { h: 'Joined', f: r => BX.date(r.created_at) }], d.recent)}</div></div>`;
};

AP.shops = async c => {
  let q = '';
  c.innerHTML = `<div class="page-head"><input class="in" id="q" placeholder="🔍 Search name, phone, shop ID" style="max-width:360px"><button class="btn pri" id="ns">➕ Create shop</button></div><div id="tl"></div>`;
  const load = async () => {
    const rows = await BX.get('/api/admin/tenants?q=' + encodeURIComponent(q));
    const today = BX.today();
    $('#tl', c).innerHTML = BX.table([{ h: 'Shop', f: r => `<b>${esc(r.name)}</b><div class="small mute">${esc(r.slug)} • ${esc(r.business_type)}</div>` }, { h: 'Owner', f: r => esc(r.owner_name) + `<div class="small"><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></div>` },
      { h: 'Status', f: r => r.status === 'suspended' ? '<span class="badge bad">Suspended</span>' : r.plan_expires < today ? '<span class="badge warn">Expired</span>' : '<span class="badge ok">Active</span>' },
      { h: 'Expires', f: r => BX.date(r.plan_expires) }, { h: 'Usage', f: r => `<span class="small">${r.users} users • ${r.products} products • ${r.sales} sales</span><div class="small mute">Last sale: ${r.last_sale ? BX.date(r.last_sale) : '-'}</div>` }, { h: 'SMS', n: 1, k: 'sms_balance' }, { h: 'Joined', f: r => BX.date(r.created_at) }], rows, { click: 1 });
    BX.bindRows($('#tl', c), rows, shopModal);
  };
  $('#q', c).oninput = BX.debounce(() => { q = $('#q', c).value.trim(); load(); }, 300);
  $('#ns', c).onclick = () => BX.formModal('Create shop', [{ k: 'name', label: 'Shop name', req: 1 }, { k: 'owner_name', label: 'Owner name', req: 1 }, { k: 'phone', label: 'Owner mobile (login)', req: 1 }, { k: 'password', label: 'Password', req: 1 }, { k: 'business_type', label: 'Type', type: 'select', options: [['tile', 'Tile & sanitary'], ['sanitary', 'Sanitary'], ['hardware', 'Hardware'], ['wholesale', 'Wholesale']] }, { k: 'plan_expires', label: 'Plan expires', type: 'date', val: BX.addDays(BX.today(), 30) }, { k: 'slug', label: 'Shop ID (optional)' }, { k: 'sms_balance', label: 'SMS balance', type: 'number', val: 0 }, { k: 'address', label: 'Address', full: 1 }], {}, async v => { await BX.post('/api/admin/tenants', v); BX.toast('Shop created', 'ok'); load(); });
  window._reloadShops = load;
  load();
};
function shopModal(t) {
  const f = [{ k: 'name', label: 'Shop name' }, { k: 'slug', label: 'Shop ID (login & catalog URL)' }, { k: 'owner_name', label: 'Owner name' }, { k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email' }, { k: 'business_type', label: 'Type', type: 'select', options: [['tile', 'Tile & sanitary'], ['sanitary', 'Sanitary'], ['hardware', 'Hardware'], ['wholesale', 'Wholesale']] },
    { k: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['suspended', 'Suspended']] }, { k: 'plan_expires', label: 'Plan expires', type: 'date' }, { k: 'sms_balance', label: 'SMS balance', type: 'number' }, { k: 'address', label: 'Address' }, { k: 'admin_note', label: 'Private admin note', type: 'textarea', full: 1 }];
  BX.modal({ title: '🏬 ' + esc(t.name), wide: 1,
    body: `<div class="row" style="margin-bottom:12px;gap:6px"><button class="btn sm" data-ext="30">+30 days</button><button class="btn sm" data-ext="180">+6 months</button><button class="btn sm" data-ext="365">+1 year</button><button class="btn sm" id="sms">+ SMS</button><button class="btn sm" id="rp">🔑 Reset owner password</button><button class="btn sm pri" id="imp">👁 Login as shop</button><a class="btn sm" href="/api/admin/tenants/${t.id}/export">⬇ Export data</a><a class="btn sm" target="_blank" href="/c/${esc(t.slug)}">🛍 Catalog</a></div>${BX.formHtml(f, t)}`,
    onOpen: (el, close) => {
      $$('[data-ext]', el).forEach(b => (b.onclick = async () => { const r = await BX.post(`/api/admin/tenants/${t.id}/extend`, { days: b.dataset.ext }); BX.toast('Extended to ' + BX.date(r.plan_expires), 'ok'); $('[name=plan_expires]', el).value = r.plan_expires; t.plan_expires = r.plan_expires; window._reloadShops && window._reloadShops(); }));
      $('#sms', el).onclick = async () => { const n = prompt('Add how many SMS? (negative to remove)', '500'); if (!n) return; await BX.post(`/api/admin/tenants/${t.id}/sms`, { add: n }); BX.toast('SMS updated', 'ok'); close(); window._reloadShops(); };
      $('#rp', el).onclick = async () => { const p = prompt('New owner password (6+ chars)'); if (!p) return; try { await BX.post(`/api/admin/tenants/${t.id}/reset-password`, { password: p }); BX.toast('Password reset. Login: ' + t.phone, 'ok'); } catch (e) { BX.err(e); } };
      $('#imp', el).onclick = async () => { await BX.post(`/api/admin/tenants/${t.id}/impersonate`); window.open('/app', '_blank'); };
    },
    buttons: [{ label: '🗑 Delete shop', cls: 'danger', onClick: async close => { const n = prompt(`This permanently deletes ALL data of this shop. Type the shop name to confirm:\n${t.name}`); if (!n) return; await BX.del('/api/admin/tenants/' + t.id, { confirm: n }); BX.toast('Deleted', 'ok'); close(); window._reloadShops(); } },
      { label: 'Cancel' }, { label: 'Save', cls: 'pri', onClick: async (close, el) => { await BX.put('/api/admin/tenants/' + t.id, BX.formVals(el, f)); BX.toast('Saved', 'ok'); close(); window._reloadShops(); } }] });
}

AP.payments = async c => {
  let st = 'pending';
  c.innerHTML = `<div class="tabs"><button data-s="pending">Pending</button><button data-s="approved">Approved</button><button data-s="rejected">Rejected</button><button data-s="">All</button></div><div id="pl"></div>`;
  const load = async () => {
    $$('.tabs button', c).forEach(b => b.classList.toggle('on', b.dataset.s === st));
    const rows = await BX.get('/api/admin/payments?status=' + st);
    $('#pl', c).innerHTML = BX.table([{ h: 'Date', f: r => BX.dateTime(r.created_at) }, { h: 'Shop', f: r => `<b>${esc(r.shop)}</b><div class="small">${esc(r.shop_phone)}</div>` }, { h: 'Package', f: r => r.months + ' month(s)' }, { h: 'Amount', n: 1, f: r => BX.tk(r.amount) }, { h: 'Method', k: 'method' }, { h: 'Sender', k: 'sender' }, { h: 'TrxID', f: r => `<b>${esc(r.trx_id)}</b>` }, { h: 'Current expiry', f: r => BX.date(r.plan_expires) },
      { h: '', f: r => r.status === 'pending' ? `<div class="row" style="flex-wrap:nowrap"><button class="btn sm ok" data-ok="${r.id}">✓ Approve</button><button class="btn sm danger" data-no="${r.id}">✕</button></div>` : `<span class="badge ${r.status === 'approved' ? 'ok' : 'bad'}">${r.status}</span><div class="small mute">${esc(r.admin_note || '')}</div>` }], rows);
    $$('[data-ok]', c).forEach(b => (b.onclick = async () => { if (!(await BX.confirm('Verify the TrxID in your bKash/Nagad app first. Approve and extend the subscription?', 'Approve'))) return; await BX.post(`/api/admin/payments/${b.dataset.ok}/approve`, {}); BX.toast('Approved', 'ok'); load(); }));
    $$('[data-no]', c).forEach(b => (b.onclick = async () => { const n = prompt('Reason for rejection (shown to shop)', 'Transaction ID not found'); if (n === null) return; await BX.post(`/api/admin/payments/${b.dataset.no}/reject`, { note: n }); load(); }));
  };
  $$('.tabs button', c).forEach(b => (b.onclick = () => { st = b.dataset.s; load(); }));
  load();
};

async function settingsForm(c, fields, transform) {
  const s = await BX.get('/api/admin/settings');
  c.innerHTML = `<div class="card" style="max-width:900px">${BX.formHtml(fields, s)}<button class="btn pri" id="sv" style="margin-top:14px">💾 Save</button></div>`;
  $('#sv', c).onclick = async () => { try { let v = BX.formVals(c, fields); if (transform) v = transform(v, s); await BX.put('/api/admin/settings', v); BX.toast('Saved', 'ok'); } catch (e) { BX.err(e); } };
  return s;
}
AP.settings = c => settingsForm(c, [{ k: 'brand_name', label: 'Software name' }, { k: 'brand_sub', label: 'Tagline' }, { k: 'company', label: 'Company' }, { k: 'website', label: 'Website' }, { k: 'support_phone', label: 'Support phone' }, { k: 'support_whatsapp', label: 'Support WhatsApp (8801…)' }, { k: 'support_email', label: 'Support email' }, { k: 'primary_color', label: 'Primary color (hex)' },
  { k: 'trial_days', label: 'Free trial days for new signups', type: 'number' }, { k: 'signup_sms_balance', label: 'Free SMS for new signups', type: 'number' }, { k: 'signup_enabled', label: 'Allow public signup', type: 'check' }, { k: 'announcement', label: 'Announcement banner (shown to all shops, blank = none)', type: 'textarea', full: 1 }]);

AP.pricing = async c => {
  const s = await BX.get('/api/admin/settings');
  let plans = JSON.parse(JSON.stringify(s.plans || [])), methods = JSON.parse(JSON.stringify(s.payment_methods || []));
  const draw = () => {
    c.innerHTML = `<div class="card" style="max-width:900px"><h3>💰 Packages (one package, all features — set durations & prices)</h3>
      ${plans.map((p, i) => `<div class="row" style="margin-bottom:8px;flex-wrap:nowrap"><input class="in sm" data-p="${i}" data-k="months" value="${p.months}" style="width:70px" title="months"><span class="small">months</span><input class="in sm" data-p="${i}" data-k="price" value="${p.price}" style="width:110px" title="price ৳"><span class="small">৳</span><input class="in sm" data-p="${i}" data-k="label_bn" value="${esc(p.label_bn)}" placeholder="Bangla label"><input class="in sm" data-p="${i}" data-k="label_en" value="${esc(p.label_en)}" placeholder="English label"><button class="btn sm ghost bad" data-px="${i}">✕</button></div>`).join('')}
      <button class="btn sm" id="pa">➕ Add package</button></div>
      <div class="card" style="max-width:900px;margin-top:12px"><h3>📲 Payment numbers (shown on billing page)</h3>
      ${methods.map((m, i) => `<div class="row" style="margin-bottom:8px;flex-wrap:nowrap"><input class="in sm" data-m="${i}" data-k="name" value="${esc(m.name)}" placeholder="bKash" style="width:120px"><input class="in sm" data-m="${i}" data-k="number" value="${esc(m.number)}" placeholder="01XXXXXXXXX"><input class="in sm" data-m="${i}" data-k="type" value="${esc(m.type || '')}" placeholder="Personal (Send Money)"><button class="btn sm ghost bad" data-mx="${i}">✕</button></div>`).join('')}
      <button class="btn sm" id="ma">➕ Add method</button>
      <div class="f" style="margin-top:10px"><label>Instructions (Bangla)</label><textarea class="in" id="ibn">${esc(s.payment_instructions_bn || '')}</textarea></div>
      <div class="f" style="margin-top:8px"><label>Instructions (English)</label><textarea class="in" id="ien">${esc(s.payment_instructions_en || '')}</textarea></div></div>
      <button class="btn pri lg" id="sv" style="margin-top:14px">💾 Save pricing</button>`;
    $$('[data-p]', c).forEach(i => (i.onchange = () => { plans[+i.dataset.p][i.dataset.k] = ['months', 'price'].includes(i.dataset.k) ? nv(i.value) : i.value; }));
    $$('[data-m]', c).forEach(i => (i.onchange = () => { methods[+i.dataset.m][i.dataset.k] = i.value; }));
    $$('[data-px]', c).forEach(b => (b.onclick = () => { plans.splice(+b.dataset.px, 1); draw(); }));
    $$('[data-mx]', c).forEach(b => (b.onclick = () => { methods.splice(+b.dataset.mx, 1); draw(); }));
    $('#pa', c).onclick = () => { plans.push({ months: 3, price: 4000, label_bn: '৩ মাস', label_en: '3 Months' }); draw(); };
    $('#ma', c).onclick = () => { methods.push({ name: 'Rocket', number: '', type: 'Personal' }); draw(); };
    $('#sv', c).onclick = async () => { plans.sort((a, b) => a.months - b.months); await BX.put('/api/admin/settings', { plans, payment_methods: methods, payment_instructions_bn: $('#ibn', c).value, payment_instructions_en: $('#ien', c).value }); BX.toast('Saved', 'ok'); draw(); };
  };
  draw();
};

AP.landing = async c => {
  const s = await BX.get('/api/admin/settings');
  const ld = JSON.parse(JSON.stringify(s.landing || {})); ld.features = ld.features || [];
  const draw = () => {
    c.innerHTML = `<div class="card" style="max-width:1000px"><h3>Hero</h3><div class="grid g2">
      <div class="f"><label>Headline (Bangla)</label><textarea class="in" id="hbn">${esc(ld.hero_bn || '')}</textarea></div><div class="f"><label>Headline (English)</label><textarea class="in" id="hen">${esc(ld.hero_en || '')}</textarea></div>
      <div class="f"><label>Sub text (Bangla)</label><textarea class="in" id="sbn">${esc(ld.sub_bn || '')}</textarea></div><div class="f"><label>Sub text (English)</label><textarea class="in" id="sen">${esc(ld.sub_en || '')}</textarea></div></div>
      <h3 style="margin-top:14px">Feature cards</h3>${ld.features.map((f, i) => `<div class="row" style="margin-bottom:8px;flex-wrap:nowrap;align-items:flex-start"><input class="in sm" data-f="${i}" data-k="icon" value="${esc(f.icon)}" style="width:50px"><div class="grow grid g2" style="gap:4px"><input class="in sm" data-f="${i}" data-k="bn" value="${esc(f.bn)}" placeholder="Title BN"><input class="in sm" data-f="${i}" data-k="en" value="${esc(f.en)}" placeholder="Title EN"><input class="in sm" data-f="${i}" data-k="dbn" value="${esc(f.dbn)}" placeholder="Desc BN"><input class="in sm" data-f="${i}" data-k="den" value="${esc(f.den)}" placeholder="Desc EN"></div><button class="btn sm ghost bad" data-fx="${i}">✕</button></div>`).join('')}
      <button class="btn sm" id="fa">➕ Add feature</button></div><button class="btn pri lg" id="sv" style="margin-top:14px">💾 Save landing page</button>`;
    $$('[data-f]', c).forEach(i => (i.onchange = () => { ld.features[+i.dataset.f][i.dataset.k] = i.value; }));
    $$('[data-fx]', c).forEach(b => (b.onclick = () => { ld.features.splice(+b.dataset.fx, 1); draw(); }));
    $('#fa', c).onclick = () => { ld.features.push({ icon: '⭐', bn: '', en: '', dbn: '', den: '' }); draw(); };
    $('#sv', c).onclick = async () => { ld.hero_bn = $('#hbn', c).value; ld.hero_en = $('#hen', c).value; ld.sub_bn = $('#sbn', c).value; ld.sub_en = $('#sen', c).value; await BX.put('/api/admin/settings', { landing: ld }); BX.toast('Saved', 'ok'); };
  };
  draw();
};

AP.sms = async c => {
  const s = await BX.get('/api/admin/settings');
  const g = s.sms_gateway || {};
  const logs = await BX.get('/api/admin/sms-logs');
  c.innerHTML = `<div class="card" style="max-width:900px"><h3>✉️ SMS gateway (any Bangladeshi HTTP SMS API)</h3>
    <p class="small mute">Use <b>{to}</b> for the number (8801XXXXXXXXX) and <b>{message}</b> for the text. Works with BulkSMSBD, SSL Wireless, Alpha SMS, GreenWeb, etc. Shops spend SMS credits you allocate from the Shops page.</p>
    <label class="chk"><input type="checkbox" id="en" ${g.enabled ? 'checked' : ''}> Enabled</label>
    <div class="grid g2" style="margin-top:8px"><div class="f"><label>Method</label><select class="in" id="me"><option ${g.method !== 'POST' ? 'selected' : ''}>GET</option><option ${g.method === 'POST' ? 'selected' : ''}>POST</option></select></div><div class="f"><label>Success text contains (optional)</label><input class="in" id="sc" value="${esc(g.success_contains || '')}" placeholder="e.g. 202 or SMS Submitted"></div></div>
    <div class="f" style="margin-top:8px"><label>URL</label><textarea class="in" id="url">${esc(g.url || '')}</textarea></div>
    <div class="f" style="margin-top:8px"><label>POST body (only for POST; JSON or form)</label><textarea class="in" id="bd">${esc(g.body || '')}</textarea></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="sv">💾 Save</button><span class="grow"></span><input class="in sm" id="tn" placeholder="01XXXXXXXXX" style="width:160px"><button class="btn" id="ts">Send test</button></div><pre id="tr" class="small" style="white-space:pre-wrap"></pre></div>
    <h3 style="margin-top:14px">Recent SMS</h3>${BX.table([{ h: 'Time', f: r => BX.dateTime(r.created_at) }, { h: 'Shop', k: 'shop' }, { h: 'To', k: 'to_number' }, { h: 'Message', k: 'message' }, { h: 'Status', f: r => `<span class="badge ${r.status === 'sent' ? 'ok' : 'bad'}">${r.status}</span>` }, { h: 'Response', f: r => `<span class="small">${esc((r.response || '').slice(0, 80))}</span>` }], logs)}`;
  const val = () => ({ enabled: $('#en', c).checked, method: $('#me', c).value, url: $('#url', c).value.trim(), body: $('#bd', c).value, success_contains: $('#sc', c).value });
  $('#sv', c).onclick = async () => { await BX.put('/api/admin/settings', { sms_gateway: val() }); BX.toast('Saved', 'ok'); };
  $('#ts', c).onclick = async () => { await BX.put('/api/admin/settings', { sms_gateway: val() }); const r = await BX.post('/api/admin/sms-test', { to: $('#tn', c).value }); $('#tr', c).textContent = (r.ok ? '✓ HTTP OK\n' : '✕ Failed\n') + r.text; };
};

AP.backups = async c => {
  const files = await BX.get('/api/admin/backups');
  c.innerHTML = `<div class="card" style="max-width:900px"><p>Automatic full JSON backup of every shop runs daily at 3:00 AM (Bangladesh time) into the server's <code>backups/</code> folder (last 14 kept). In Coolify, mount a persistent volume at <code>/app/backups</code> so these survive redeploys, and also enable Coolify's scheduled PostgreSQL backups (to S3) for full database safety.</p>
    <button class="btn pri" id="run">▶ Run backup now</button></div><div style="margin-top:12px">${BX.table([{ h: 'File', k: 'file' }, { h: 'Size', n: 1, f: r => (r.size / 1024 / 1024).toFixed(2) + ' MB' }, { h: '', f: r => `<a class="btn sm" href="/api/admin/backups/${encodeURIComponent(r.file)}">⬇ Download</a>` }], files)}</div>`;
  $('#run', c).onclick = async () => { $('#run', c).disabled = true; await BX.post('/api/admin/backups/run'); BX.toast('Backup complete', 'ok'); aroute(); };
};

AP.admins = async c => {
  const rows = await BX.get('/api/admin/admins');
  c.innerHTML = `<div class="page-head"><span></span><button class="btn pri" id="na">➕ New admin</button></div>${BX.table([{ h: 'Name', k: 'name' }, { h: 'Username', k: 'username' }, { h: 'Created', f: r => BX.date(r.created_at) }, { h: '', f: r => `<button class="btn sm" data-e="${r.id}">✏️ Edit / password</button> <button class="btn sm danger" data-d="${r.id}">🗑</button>` }], rows)}`;
  $('#na', c).onclick = () => BX.formModal('New admin', [{ k: 'name', label: 'Name' }, { k: 'username', label: 'Username', req: 1 }, { k: 'password', label: 'Password', type: 'password', req: 1 }], {}, async v => { await BX.post('/api/admin/admins', v); aroute(); });
  $$('[data-e]', c).forEach(b => (b.onclick = () => { const a = rows.find(x => String(x.id) === b.dataset.e); BX.formModal('Edit ' + esc(a.username), [{ k: 'name', label: 'Name' }, { k: 'username', label: 'Username' }, { k: 'password', label: 'New password (blank = keep)', type: 'password' }], a, async v => { await BX.put('/api/admin/admins/' + a.id, v); BX.toast('Saved', 'ok'); aroute(); }); }));
  $$('[data-d]', c).forEach(b => (b.onclick = async () => { if (await BX.confirm('Delete this admin?')) { try { await BX.del('/api/admin/admins/' + b.dataset.d); aroute(); } catch (e) { BX.err(e); } } }));
};

boot().then(() => { if ($('#appWrap').classList.contains('hidden')) showLogin(); });

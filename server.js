// ============================================================
//  Baybex Tile, Sanitary & Hardware Management System (SaaS)
//  Node.js + Express + PostgreSQL (raw SQL). No .env, no yml.
// ============================================================
const express = require('express');
const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const CFG = require('./config');

// NUMERIC -> number, DATE -> 'YYYY-MM-DD' string (no timezone shifting)
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1082, v => v);

const pool = new Pool({
  connectionString: CFG.DATABASE_URL,
  ssl: CFG.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
});
const q = (sql, params) => pool.query(sql, params);
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const all = async (sql, params) => (await pool.query(sql, params)).rows;

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ---------------- helpers ----------------
const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const r2 = v => Math.round(n(v) * 100) / 100;
const r4 = v => Math.round(n(v) * 10000) / 10000;
const s = v => (v === undefined || v === null ? '' : String(v).trim());
const nullIfEmpty = v => (s(v) === '' ? null : v);
const intOrNull = v => (v === undefined || v === null || v === '' ? null : parseInt(v, 10));
const todayBD = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, days) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10); };
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(s(d));
const dOr = (d, def) => (isDate(d) ? d : def);
class AppError extends Error { constructor(msg, status = 400, extra) { super(msg); this.status = status; this.extra = extra; } }
const fail = (msg, status, extra) => { throw new AppError(msg, status, extra); };
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setCookie(res, name, val, days) {
  const parts = [`${name}=${encodeURIComponent(val)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  parts.push(days > 0 ? `Max-Age=${days * 86400}` : 'Max-Age=0');
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [].concat(prev, parts.join('; ')));
}
const slugify = t => s(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

// ---------------- permissions ----------------
const PERMS = [
  'dashboard', 'pos', 'sales', 'sales_return', 'sales_delete', 'quotation', 'products', 'stock', 'stock_adjust',
  'purchase', 'customers', 'suppliers', 'due_collect', 'supplier_pay', 'expenses', 'cashbook', 'accounts',
  'reports', 'profit', 'employees', 'delivery', 'sms', 'settings', 'users',
];
const DEFAULT_ROLES = [
  { name: 'Owner / মালিক', is_owner: true, perms: PERMS },
  { name: 'Manager / ম্যানেজার', perms: PERMS.filter(p => !['users', 'settings', 'sales_delete'].includes(p)) },
  { name: 'Salesman / বিক্রয়কর্মী', perms: ['dashboard', 'pos', 'sales', 'quotation', 'customers', 'due_collect', 'delivery', 'stock'] },
  { name: 'Accountant / হিসাবরক্ষক', perms: ['dashboard', 'sales', 'customers', 'suppliers', 'due_collect', 'supplier_pay', 'expenses', 'cashbook', 'accounts', 'reports', 'profit', 'employees'] },
  { name: 'Store Keeper / স্টোর কিপার', perms: ['dashboard', 'products', 'stock', 'stock_adjust', 'purchase', 'delivery'] },
];

// ---------------- platform settings ----------------
const DEFAULT_SETTINGS = {
  brand_name: 'Baybex Tile ERP',
  brand_sub: 'Tile, Sanitary & Hardware Management',
  company: 'Baybex',
  support_phone: '01750006696',
  support_whatsapp: '8801750006696',
  support_email: 'bussiness@baybexai.com',
  website: 'https://baybex.com',
  primary_color: '#0f766e',
  signup_enabled: true,
  trial_days: 14,
  signup_sms_balance: 20,
  plans: [
    { months: 1, price: 1500, label_bn: '১ মাস', label_en: '1 Month' },
    { months: 6, price: 8000, label_bn: '৬ মাস', label_en: '6 Months' },
    { months: 12, price: 15000, label_bn: '১ বছর', label_en: '1 Year' },
  ],
  payment_methods: [
    { name: 'bKash', number: '01750006696', type: 'Personal (Send Money)' },
    { name: 'Nagad', number: '01750006696', type: 'Personal (Send Money)' },
  ],
  payment_instructions_bn: 'উপরের নাম্বারে Send Money করে Transaction ID দিন। যাচাই করে ২৪ ঘন্টার মধ্যে প্যাকেজ চালু হবে।',
  payment_instructions_en: 'Send money to the number above and submit the Transaction ID. Your package will be activated within 24 hours after verification.',
  landing: {
    hero_bn: 'টাইলস, স্যানিটারি ও হার্ডওয়্যার দোকানের সম্পূর্ণ হিসাব — এক সফটওয়্যারে',
    hero_en: 'Complete management for Tile, Sanitary & Hardware shops — in one software',
    sub_bn: 'বাকির হিসাব, স্টক, বিক্রি, ক্রয়, ক্যাশবুক, লাভ-ক্ষতি, টাইলস ক্যালকুলেটর — বাংলা ও ইংরেজিতে। মোবাইল ও কম্পিউটার দুটোতেই চলে।',
    sub_en: 'Customer due, stock, sales, purchase, cashbook, profit & loss, tile calculator — in Bangla & English. Works on mobile and computer.',
    features: [
      { icon: '📒', bn: 'বাকির হিসাব', en: 'Customer Due', dbn: 'কাস্টমার অনুযায়ী বাকি, আংশিক পেমেন্ট, লেজার ও SMS রিমাইন্ডার', den: 'Customer-wise due, partial payments, ledger & SMS reminders' },
      { icon: '🧱', bn: 'টাইলস ক্যালকুলেটর', en: 'Tile Calculator', dbn: 'স্কয়ার ফিট থেকে বক্স, ওয়েস্টেজ, শেড ও ব্যাচ ট্র্যাকিং', den: 'Sqft to box, wastage, shade & batch tracking' },
      { icon: '📦', bn: 'স্টক ম্যানেজমেন্ট', en: 'Stock Management', dbn: 'বক্স, পিস, স্কয়ার ফিট, কেজি, ব্যাগ — অটো ইউনিট কনভার্শন', den: 'Box, piece, sqft, kg, bag — automatic unit conversion' },
      { icon: '💵', bn: 'দৈনিক ক্যাশবুক', en: 'Daily Cashbook', dbn: 'ক্যাশ, বিকাশ, নগদ, ব্যাংক — দিনের শুরু থেকে শেষ হিসাব', den: 'Cash, bKash, Nagad, bank — opening to closing' },
      { icon: '📈', bn: 'লাভ-ক্ষতি', en: 'Profit & Loss', dbn: 'আজকের বিক্রি, খরচ, লাভ এক নজরে', den: "Today's sales, expenses and profit at a glance" },
      { icon: '🧾', bn: 'বাংলা ইনভয়েস', en: 'Bangla Invoice', dbn: 'বাংলা/ইংরেজি ইনভয়েস, A4 ও POS প্রিন্ট, বারকোড', den: 'Bangla/English invoice, A4 & POS print, barcode' },
      { icon: '🚚', bn: 'ডেলিভারি', en: 'Delivery', dbn: 'ডেলিভারি স্ট্যাটাস, কোটেশন ও প্রজেক্ট এস্টিমেট', den: 'Delivery status, quotations & project estimates' },
      { icon: '🏬', bn: 'মাল্টি ব্রাঞ্চ ও ইউজার', en: 'Multi-branch & Users', dbn: 'মালিক, ম্যানেজার, সেলসম্যান — আলাদা লগইন ও পারমিশন', den: 'Owner, manager, salesman — separate logins & permissions' },
    ],
  },
  sms_gateway: {
    enabled: false,
    method: 'GET',
    url: 'http://bulksmsbd.net/api/smsapi?api_key=YOUR_KEY&type=text&number={to}&senderid=YOUR_SENDER&message={message}',
    body: '',
    success_contains: '',
  },
  announcement: '',
};
let SETTINGS_CACHE = null;
async function getSettings() {
  if (SETTINGS_CACHE) return SETTINGS_CACHE;
  const rows = await all('SELECT key, value FROM platform_settings');
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  rows.forEach(r => { out[r.key] = r.value; });
  SETTINGS_CACHE = out;
  return out;
}
async function saveSettings(obj) {
  for (const k of Object.keys(obj)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    await q('INSERT INTO platform_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [k, JSON.stringify(obj[k])]);
  }
  SETTINGS_CACHE = null;
}

const DEFAULT_TENANT_SETTINGS = {
  invoice_prefix: 'INV-',
  purchase_prefix: 'PUR-',
  quote_prefix: 'QT-',
  return_prefix: 'RET-',
  vat_percent: 0,
  vat_reg_no: '',
  language: 'bn',
  digits: 'bn',
  invoice_size: 'a4',
  invoice_lang: 'bn',
  invoice_footer: 'ক্রয়কৃত মাল ফেরত নেওয়া হয় না (ভাঙা/ত্রুটিপূর্ণ ছাড়া)। আমাদের সাথে থাকার জন্য ধন্যবাদ।',
  show_prev_due: true,
  allow_negative_stock: false,
  default_wastage: 5,
  logo: '',
  catalog_enabled: true,
  catalog_show_price: true,
  whatsapp: '',
  sms_due_template: 'প্রিয় {name}, {shop} এ আপনার বকেয়া {due} টাকা। অনুগ্রহ করে দ্রুত পরিশোধ করুন। ধন্যবাদ।',
  sms_on_sale: false,
  sms_sale_template: 'প্রিয় {name}, {shop} থেকে {total} টাকার কেনাকাটা করেছেন। জমা {paid}, মোট বাকি {due} টাকা। ধন্যবাদ।',
};

// ---------------- boot / migrate ----------------
async function migrate() {
  await q(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const cnt = await one('SELECT count(*)::int c FROM super_admins');
  if (!cnt.c) {
    await q('INSERT INTO super_admins(name, username, password_hash) VALUES($1,$2,$3)',
      ['Super Admin', CFG.SUPERADMIN_USERNAME, bcrypt.hashSync(CFG.SUPERADMIN_PASSWORD, 10)]);
    console.log(`Super admin created: ${CFG.SUPERADMIN_USERNAME}`);
  }
}

async function nextNo(c, tid, key, prefix) {
  const r = await c.query(
    `INSERT INTO counters(tenant_id,key,value) VALUES($1,$2,1)
     ON CONFLICT(tenant_id,key) DO UPDATE SET value=counters.value+1 RETURNING value`, [tid, key]);
  return prefix + String(r.rows[0].value).padStart(5, '0');
}

async function logAct(t, u, action, detail) {
  try { await q('INSERT INTO activity_log(tenant_id,user_id,user_name,action,detail) VALUES($1,$2,$3,$4,$5)', [t, u && u.id, u && u.name, action, detail]); } catch (e) { /* ignore */ }
}

// ---------------- SMS ----------------
function smsParts(msg) {
  const unicode = /[^\x00-\x7F]/.test(msg);
  const per = unicode ? 70 : 160;
  return Math.max(1, Math.ceil(msg.length / per));
}
function httpRequest(url, method, body) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const opts = { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, timeout: 15000, headers: {} };
      if (body) { opts.headers['Content-Type'] = body.trim().startsWith('{') ? 'application/json' : 'application/x-www-form-urlencoded'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
      const rq = lib.request(opts, rs => { let d = ''; rs.on('data', x => (d += x)); rs.on('end', () => resolve({ ok: rs.statusCode < 400, text: d.slice(0, 500) })); });
      rq.on('error', e => resolve({ ok: false, text: e.message }));
      rq.on('timeout', () => { rq.destroy(); resolve({ ok: false, text: 'timeout' }); });
      if (body) rq.write(body);
      rq.end();
    } catch (e) { resolve({ ok: false, text: e.message }); }
  });
}
function bdPhone(p) {
  let x = s(p).replace(/[^0-9]/g, '');
  if (x.startsWith('880')) return x;
  if (x.startsWith('0')) return '88' + x;
  if (x.length === 10 && x.startsWith('1')) return '880' + x;
  return x;
}
async function sendSms(tid, to, message) {
  const st = await getSettings();
  const g = st.sms_gateway || {};
  const phone = bdPhone(to);
  if (!/^8801[3-9]\d{8}$/.test(phone)) return { ok: false, error: 'Invalid Bangladesh mobile number' };
  if (!g.enabled) return { ok: false, error: 'SMS gateway is not enabled by the platform admin' };
  const parts = smsParts(message);
  const t = await one('SELECT sms_balance FROM tenants WHERE id=$1', [tid]);
  if (!t || t.sms_balance < parts) return { ok: false, error: 'Insufficient SMS balance' };
  const fill = (tpl, enc) => s(tpl).replace(/\{to\}/g, enc ? encodeURIComponent(phone) : phone).replace(/\{message\}/g, enc ? encodeURIComponent(message) : JSON.stringify(message).slice(1, -1));
  const url = fill(g.url, true);
  const body = g.method === 'POST' && g.body ? fill(g.body, !s(g.body).trim().startsWith('{')) : null;
  const res = await httpRequest(url, g.method === 'POST' ? 'POST' : 'GET', body);
  const ok = res.ok && (!g.success_contains || res.text.includes(g.success_contains));
  if (ok) await q('UPDATE tenants SET sms_balance=sms_balance-$2 WHERE id=$1', [tid, parts]);
  await q('INSERT INTO sms_logs(tenant_id,to_number,message,status,response) VALUES($1,$2,$3,$4,$5)', [tid, phone, message, ok ? 'sent' : 'failed', res.text]);
  return ok ? { ok: true, parts } : { ok: false, error: 'Gateway error: ' + res.text };
}

// ============================================================
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

// ---------------- auth ----------------
async function createSession(kind, userId, tenantId, impersonated = false) {
  const token = crypto.randomBytes(32).toString('hex');
  await q('INSERT INTO sessions(token,kind,user_id,tenant_id,impersonated,expires_at) VALUES($1,$2,$3,$4,$5, now() + ($6 || \' days\')::interval)',
    [token, kind, userId, tenantId, impersonated, String(CFG.SESSION_DAYS)]);
  return token;
}

const tenantAuth = (perm) => wrap(async (req, res, next) => {
  const tok = parseCookies(req).bx_t || s(req.headers['x-token']);
  if (!tok) fail('Please login', 401);
  const row = await one(`SELECT s.impersonated, u.id, u.name, u.username, u.branch_id, u.active, u.tenant_id, r.perms, r.is_owner, r.name role_name,
      t.name tenant_name, t.slug, t.status, t.plan_expires, t.settings, t.sms_balance, t.phone tenant_phone, t.address tenant_address, t.business_type
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=u.tenant_id LEFT JOIN roles r ON r.id=u.role_id
    WHERE s.token=$1 AND s.kind='tenant' AND s.expires_at>now()`, [tok]);
  if (!row || !row.active) fail('Session expired, please login again', 401);
  if (row.status === 'suspended') fail('This shop account is suspended. Please contact support.', 403, { code: 'suspended' });
  const perms = row.is_owner ? PERMS : (row.perms || []);
  if (perm && !perms.includes(perm)) fail('You do not have permission for this action', 403);
  const expired = !row.plan_expires || row.plan_expires < todayBD();
  if (expired && req.method !== 'GET' && !req.path.startsWith('/billing') && !req.path.startsWith('/auth')) {
    fail('Your subscription has expired. Please renew from Billing.', 402, { code: 'expired' });
  }
  req.t = row.tenant_id;
  req.u = { id: row.id, name: row.name, username: row.username, branch_id: row.branch_id, perms, is_owner: !!row.is_owner, role_name: row.role_name, impersonated: row.impersonated };
  req.tenant = { id: row.tenant_id, name: row.tenant_name, slug: row.slug, status: row.status, plan_expires: row.plan_expires, expired,
    phone: row.tenant_phone, address: row.tenant_address, business_type: row.business_type, sms_balance: row.sms_balance,
    settings: Object.assign({}, DEFAULT_TENANT_SETTINGS, row.settings || {}) };
  next();
});

// branch resolution: users bound to a branch can only use that branch
async function branchOf(req, wanted) {
  if (req.u.branch_id) return req.u.branch_id;
  const b = intOrNull(wanted !== undefined ? wanted : (req.query.branch_id || req.headers['x-branch']));
  if (b) {
    const ok = await one('SELECT id FROM branches WHERE id=$1 AND tenant_id=$2', [b, req.t]);
    if (ok) return b;
  }
  const first = await one('SELECT id FROM branches WHERE tenant_id=$1 AND active ORDER BY id LIMIT 1', [req.t]);
  return first ? first.id : null;
}
// for reports: null = all branches (only if user is not branch-bound)
function branchFilter(req) {
  if (req.u.branch_id) return req.u.branch_id;
  const b = intOrNull(req.query.branch_id);
  return b || null;
}

const adminAuth = wrap(async (req, res, next) => {
  const tok = parseCookies(req).bx_a || s(req.headers['x-admin-token']);
  if (!tok) fail('Please login', 401);
  const row = await one(`SELECT a.id, a.name, a.username FROM sessions s JOIN super_admins a ON a.id=s.user_id
    WHERE s.token=$1 AND s.kind='admin' AND s.expires_at>now()`, [tok]);
  if (!row) fail('Session expired', 401);
  req.admin = row;
  next();
});

// ============================================================
//  PUBLIC
// ============================================================
app.get('/api/public/settings', wrap(async (req, res) => {
  const st = await getSettings();
  const pub = Object.assign({}, st);
  delete pub.sms_gateway;
  res.json(pub);
}));

async function seedTenant(c, tid, ownerName, username, phone, password, businessType) {
  const br = await c.query('INSERT INTO branches(tenant_id,name,phone) VALUES($1,$2,$3) RETURNING id', [tid, 'Main Branch / প্রধান শাখা', phone]);
  let ownerRole = null;
  for (const r of DEFAULT_ROLES) {
    const x = await c.query('INSERT INTO roles(tenant_id,name,perms,is_owner) VALUES($1,$2,$3,$4) RETURNING id', [tid, r.name, JSON.stringify(r.perms), !!r.is_owner]);
    if (r.is_owner) ownerRole = x.rows[0].id;
  }
  await c.query('INSERT INTO users(tenant_id,role_id,name,username,phone,password_hash) VALUES($1,$2,$3,$4,$5,$6)',
    [tid, ownerRole, ownerName, username, phone, bcrypt.hashSync(password, 10)]);
  for (const [name, type] of [['Cash / ক্যাশ', 'cash'], ['bKash / বিকাশ', 'bkash'], ['Nagad / নগদ', 'nagad'], ['Bank / ব্যাংক', 'bank']]) {
    await c.query('INSERT INTO accounts(tenant_id,name,type) VALUES($1,$2,$3)', [tid, name, type]);
  }
  for (const e of ['দোকান ভাড়া / Rent', 'বিদ্যুৎ বিল / Electricity', 'বেতন / Salary', 'লেবার ও পরিবহন / Labour & Transport', 'চা-নাস্তা / Tea & Snacks', 'মোবাইল-ইন্টারনেট / Mobile & Internet', 'অন্যান্য / Others']) {
    await c.query('INSERT INTO expense_categories(tenant_id,name) VALUES($1,$2)', [tid, e]);
  }
  const cats = {
    tile: ['Floor Tiles / ফ্লোর টাইলস', 'Wall Tiles / ওয়াল টাইলস', 'Porcelain / পোর্সেলিন', 'Commode / কমোড', 'Basin / বেসিন', 'Faucet & Tap / কল', 'Shower / শাওয়ার', 'Fittings / ফিটিংস'],
    sanitary: ['Commode / কমোড', 'Basin / বেসিন', 'Faucet & Tap / কল', 'Shower / শাওয়ার', 'Pipe & Fittings / পাইপ-ফিটিংস', 'Accessories / এক্সেসরিজ'],
    hardware: ['Tools / যন্ত্রপাতি', 'Locks / তালা', 'Pipe & Fittings / পাইপ-ফিটিংস', 'Paint / রং', 'Electrical / ইলেকট্রিক', 'Cement & Rod / সিমেন্ট-রড', 'Nails & Screws / পেরেক-স্ক্রু'],
    wholesale: ['Cement / সিমেন্ট', 'Rod / রড', 'Sand & Stone / বালু-পাথর', 'Brick / ইট', 'Tiles / টাইলস', 'Pipe / পাইপ'],
  };
  for (const cname of (cats[businessType] || cats.tile)) await c.query('INSERT INTO categories(tenant_id,name) VALUES($1,$2)', [tid, cname]);
  return br.rows[0].id;
}

app.post('/api/public/signup', wrap(async (req, res) => {
  const st = await getSettings();
  if (!st.signup_enabled) fail('New registration is currently closed. Please contact support.');
  const b = req.body || {};
  const shop = s(b.shop_name), owner = s(b.owner_name), phone = s(b.phone).replace(/[^0-9]/g, ''), pass = s(b.password);
  if (!shop || !owner) fail('Shop name and owner name are required');
  if (!/^01[3-9]\d{8}$/.test(phone)) fail('Enter a valid Bangladeshi mobile number (01XXXXXXXXX)');
  if (pass.length < 6) fail('Password must be at least 6 characters');
  const exists = await one('SELECT id FROM tenants WHERE phone=$1', [phone]);
  if (exists) fail('A shop is already registered with this mobile number. Please login.');
  let slug = slugify(b.slug || shop) || 'shop';
  if (await one('SELECT id FROM tenants WHERE slug=$1', [slug])) slug = slug.slice(0, 24) + '-' + crypto.randomBytes(2).toString('hex');
  const btype = ['tile', 'sanitary', 'hardware', 'wholesale'].includes(b.business_type) ? b.business_type : 'tile';
  const result = await tx(async c => {
    const t = await c.query(`INSERT INTO tenants(name,slug,owner_name,phone,email,address,business_type,plan_expires,sms_balance,settings)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [shop, slug, owner, phone, s(b.email), s(b.address), btype, addDays(todayBD(), n(st.trial_days) || 14), n(st.signup_sms_balance), JSON.stringify({ language: b.language === 'en' ? 'en' : 'bn', digits: b.language === 'en' ? 'en' : 'bn' })]);
    const tid = t.rows[0].id;
    await seedTenant(c, tid, owner, phone, phone, pass, btype);
    const u = await c.query('SELECT id FROM users WHERE tenant_id=$1', [tid]);
    return { tid, uid: u.rows[0].id };
  });
  const token = await createSession('tenant', result.uid, result.tid);
  setCookie(res, 'bx_t', token, CFG.SESSION_DAYS);
  res.json({ ok: true, slug });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const b = req.body || {};
  const shopKey = s(b.shop).toLowerCase(), username = s(b.username), pass = s(b.password);
  if (!username || !pass) fail('Enter username/mobile and password');
  let users;
  if (shopKey) {
    users = await all(`SELECT u.* FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE (t.slug=$1 OR t.phone=$1) AND u.username=$2`, [shopKey, username]);
  } else {
    users = await all(`SELECT u.* FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.username=$1 OR (u.phone=$1 AND u.phone<>'')`, [username]);
  }
  const matches = users.filter(u => bcrypt.compareSync(pass, u.password_hash));
  if (!matches.length) fail('Wrong login details');
  if (matches.length > 1) fail('This username exists in multiple shops — please enter your Shop ID too', 400, { code: 'need_shop' });
  const u = matches[0];
  if (!u.active) fail('This user is disabled. Contact your shop owner.');
  const token = await createSession('tenant', u.id, u.tenant_id);
  await q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
  setCookie(res, 'bx_t', token, CFG.SESSION_DAYS);
  const t = await one('SELECT slug FROM tenants WHERE id=$1', [u.tenant_id]);
  res.json({ ok: true, slug: t.slug });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const tok = parseCookies(req).bx_t;
  if (tok) await q('DELETE FROM sessions WHERE token=$1', [tok]);
  setCookie(res, 'bx_t', '', 0);
  res.json({ ok: true });
}));

// Public online catalog
app.get('/api/public/catalog/:slug', wrap(async (req, res) => {
  const t = await one('SELECT id,name,slug,phone,address,settings,status FROM tenants WHERE slug=$1', [s(req.params.slug).toLowerCase()]);
  if (!t || t.status !== 'active') fail('Catalog not found', 404);
  const set = Object.assign({}, DEFAULT_TENANT_SETTINGS, t.settings || {});
  if (!set.catalog_enabled) fail('Catalog is not available', 404);
  const products = await all(`SELECT p.id,p.name,p.name_bn,p.kind,p.size,p.base_unit,p.sqft_per_pcs,p.pcs_per_box,p.retail_price,p.description,p.image,
      c.name category, b.name brand, COALESCE((SELECT sum(qty) FROM stock WHERE product_id=p.id),0) qty
    FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id
    WHERE p.tenant_id=$1 AND p.active AND p.show_in_catalog ORDER BY c.name NULLS LAST, p.name`, [t.id]);
  if (!set.catalog_show_price) products.forEach(p => { p.retail_price = null; });
  products.forEach(p => { p.in_stock = p.qty > 0; delete p.qty; });
  res.json({ shop: { name: t.name, phone: t.phone, address: t.address, logo: set.logo, whatsapp: set.whatsapp || t.phone, language: set.language }, products });
}));

// ============================================================
//  SUPER ADMIN
// ============================================================
const A = express.Router();
app.use('/api/admin', A);

A.post('/login', wrap(async (req, res) => {
  const a = await one('SELECT * FROM super_admins WHERE username=$1', [s(req.body.username)]);
  if (!a || !bcrypt.compareSync(s(req.body.password), a.password_hash)) fail('Wrong username or password');
  const token = await createSession('admin', a.id, null);
  setCookie(res, 'bx_a', token, CFG.SESSION_DAYS);
  res.json({ ok: true });
}));
A.post('/logout', wrap(async (req, res) => {
  const tok = parseCookies(req).bx_a;
  if (tok) await q('DELETE FROM sessions WHERE token=$1', [tok]);
  setCookie(res, 'bx_a', '', 0);
  res.json({ ok: true });
}));
A.use(adminAuth);
A.get('/me', (req, res) => res.json(req.admin));

A.get('/stats', wrap(async (req, res) => {
  const today = todayBD();
  const r = await one(`SELECT
      (SELECT count(*) FROM tenants)::int total,
      (SELECT count(*) FROM tenants WHERE status='active' AND plan_expires>=$1)::int active,
      (SELECT count(*) FROM tenants WHERE plan_expires<$1)::int expired,
      (SELECT count(*) FROM tenants WHERE status='suspended')::int suspended,
      (SELECT count(*) FROM tenants WHERE created_at > now() - interval '7 days')::int new7,
      (SELECT count(*) FROM payment_requests WHERE status='pending')::int pending,
      (SELECT COALESCE(sum(amount),0) FROM payment_requests WHERE status='approved' AND date_trunc('month',reviewed_at)=date_trunc('month',now())) revenue_month,
      (SELECT COALESCE(sum(amount),0) FROM payment_requests WHERE status='approved') revenue_total,
      (SELECT count(*) FROM sales)::int invoices,
      (SELECT count(*) FROM users)::int users`, [today]);
  const expiring = await all(`SELECT id,name,phone,plan_expires FROM tenants WHERE plan_expires BETWEEN $1 AND $2 ORDER BY plan_expires`, [today, addDays(today, 7)]);
  const recent = await all(`SELECT id,name,phone,business_type,created_at,plan_expires FROM tenants ORDER BY id DESC LIMIT 8`);
  res.json({ ...r, expiring, recent, today });
}));

A.get('/tenants', wrap(async (req, res) => {
  const qs = '%' + s(req.query.q) + '%';
  const rows = await all(`SELECT t.id,t.name,t.slug,t.owner_name,t.phone,t.email,t.address,t.business_type,t.status,t.plan_expires,t.sms_balance,t.created_at,t.admin_note,
      (SELECT count(*) FROM users WHERE tenant_id=t.id)::int users,
      (SELECT count(*) FROM products WHERE tenant_id=t.id)::int products,
      (SELECT count(*) FROM sales WHERE tenant_id=t.id)::int sales,
      (SELECT max(created_at) FROM sales WHERE tenant_id=t.id) last_sale
    FROM tenants t WHERE t.name ILIKE $1 OR t.phone ILIKE $1 OR t.slug ILIKE $1 OR t.owner_name ILIKE $1 ORDER BY t.id DESC`, [qs]);
  res.json(rows);
}));
A.post('/tenants', wrap(async (req, res) => {
  const b = req.body;
  const phone = s(b.phone).replace(/[^0-9]/g, '');
  if (!s(b.name) || !s(b.owner_name) || !phone || s(b.password).length < 6) fail('Name, owner, phone and password (6+) are required');
  if (await one('SELECT id FROM tenants WHERE phone=$1', [phone])) fail('Phone already registered');
  let slug = slugify(b.slug || b.name) || 'shop';
  if (await one('SELECT id FROM tenants WHERE slug=$1', [slug])) slug += '-' + crypto.randomBytes(2).toString('hex');
  const st = await getSettings();
  const btype = b.business_type || 'tile';
  await tx(async c => {
    const t = await c.query(`INSERT INTO tenants(name,slug,owner_name,phone,address,business_type,plan_expires,sms_balance) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [s(b.name), slug, s(b.owner_name), phone, s(b.address), btype, dOr(b.plan_expires, addDays(todayBD(), n(st.trial_days) || 14)), n(b.sms_balance)]);
    await seedTenant(c, t.rows[0].id, s(b.owner_name), phone, phone, s(b.password), btype);
  });
  res.json({ ok: true });
}));
A.put('/tenants/:id', wrap(async (req, res) => {
  const b = req.body;
  if (b.slug !== undefined) {
    const sl = slugify(b.slug);
    if (!sl) fail('Invalid Shop ID');
    if (await one('SELECT id FROM tenants WHERE slug=$1 AND id<>$2', [sl, req.params.id])) fail('Shop ID already used');
    b.slug = sl;
  }
  const fields = ['name', 'slug', 'owner_name', 'phone', 'email', 'address', 'business_type', 'status', 'plan_expires', 'sms_balance', 'admin_note'];
  const sets = [], vals = [];
  fields.forEach(f => { if (b[f] !== undefined) { vals.push(f === 'sms_balance' ? parseInt(b[f], 10) || 0 : b[f]); sets.push(`${f}=$${vals.length}`); } });
  if (!sets.length) return res.json({ ok: true });
  vals.push(req.params.id);
  await q(`UPDATE tenants SET ${sets.join(',')} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
}));
A.post('/tenants/:id/extend', wrap(async (req, res) => {
  const t = await one('SELECT plan_expires FROM tenants WHERE id=$1', [req.params.id]);
  if (!t) fail('Not found', 404);
  const base = t.plan_expires && t.plan_expires > todayBD() ? t.plan_expires : todayBD();
  const exp = addDays(base, parseInt(req.body.days, 10) || 30);
  await q('UPDATE tenants SET plan_expires=$2 WHERE id=$1', [req.params.id, exp]);
  res.json({ ok: true, plan_expires: exp });
}));
A.post('/tenants/:id/sms', wrap(async (req, res) => {
  await q('UPDATE tenants SET sms_balance=GREATEST(0, sms_balance+$2) WHERE id=$1', [req.params.id, parseInt(req.body.add, 10) || 0]);
  res.json({ ok: true });
}));
A.post('/tenants/:id/reset-password', wrap(async (req, res) => {
  const pass = s(req.body.password);
  if (pass.length < 6) fail('Password must be 6+ characters');
  const owner = await one(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.tenant_id=$1 AND r.is_owner ORDER BY u.id LIMIT 1`, [req.params.id]);
  if (!owner) fail('Owner user not found');
  await q('UPDATE users SET password_hash=$2, active=true WHERE id=$1', [owner.id, bcrypt.hashSync(pass, 10)]);
  res.json({ ok: true });
}));
A.post('/tenants/:id/impersonate', wrap(async (req, res) => {
  const owner = await one(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.tenant_id=$1 AND r.is_owner ORDER BY u.id LIMIT 1`, [req.params.id]);
  if (!owner) fail('Owner user not found');
  const token = await createSession('tenant', owner.id, parseInt(req.params.id, 10), true);
  setCookie(res, 'bx_t', token, 1);
  res.json({ ok: true });
}));
A.delete('/tenants/:id', wrap(async (req, res) => {
  const t = await one('SELECT name FROM tenants WHERE id=$1', [req.params.id]);
  if (!t) fail('Not found', 404);
  if (s(req.body && req.body.confirm) !== t.name) fail('Type the exact shop name to confirm deletion');
  await q('DELETE FROM tenants WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));
A.get('/tenants/:id/export', wrap(async (req, res) => {
  const data = await exportTenant(parseInt(req.params.id, 10));
  res.setHeader('Content-Disposition', `attachment; filename="tenant-${req.params.id}-${todayBD()}.json"`);
  res.json(data);
}));

A.get('/payments', wrap(async (req, res) => {
  const st = s(req.query.status);
  res.json(await all(`SELECT p.*, t.name shop, t.phone shop_phone, t.plan_expires FROM payment_requests p JOIN tenants t ON t.id=p.tenant_id
    ${st ? 'WHERE p.status=$1' : ''} ORDER BY p.id DESC LIMIT 500`, st ? [st] : []));
}));
A.post('/payments/:id/approve', wrap(async (req, res) => {
  await tx(async c => {
    const p = (await c.query('SELECT * FROM payment_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!p) fail('Not found', 404);
    if (p.status !== 'pending') fail('Already reviewed');
    const t = (await c.query('SELECT plan_expires FROM tenants WHERE id=$1', [p.tenant_id])).rows[0];
    const base = t.plan_expires && t.plan_expires > todayBD() ? t.plan_expires : todayBD();
    const d = new Date(base + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + (p.months || 1));
    await c.query(`UPDATE tenants SET plan_expires=$2, status='active' WHERE id=$1`, [p.tenant_id, d.toISOString().slice(0, 10)]);
    await c.query(`UPDATE payment_requests SET status='approved', reviewed_at=now(), admin_note=$2 WHERE id=$1`, [p.id, s(req.body.note)]);
  });
  res.json({ ok: true });
}));
A.post('/payments/:id/reject', wrap(async (req, res) => {
  await q(`UPDATE payment_requests SET status='rejected', reviewed_at=now(), admin_note=$2 WHERE id=$1 AND status='pending'`, [req.params.id, s(req.body.note)]);
  res.json({ ok: true });
}));

A.get('/settings', wrap(async (req, res) => res.json(await getSettings())));
A.put('/settings', wrap(async (req, res) => { await saveSettings(req.body || {}); res.json({ ok: true }); }));
A.post('/sms-test', wrap(async (req, res) => {
  const st = await getSettings();
  const g = st.sms_gateway || {};
  const phone = bdPhone(req.body.to);
  const msg = s(req.body.message) || 'Test SMS from ' + st.brand_name;
  const url = s(g.url).replace(/\{to\}/g, encodeURIComponent(phone)).replace(/\{message\}/g, encodeURIComponent(msg));
  const r = await httpRequest(url, g.method === 'POST' ? 'POST' : 'GET', g.method === 'POST' ? s(g.body).replace(/\{to\}/g, phone).replace(/\{message\}/g, msg) : null);
  res.json(r);
}));
A.get('/sms-logs', wrap(async (req, res) => res.json(await all(`SELECT l.*, t.name shop FROM sms_logs l LEFT JOIN tenants t ON t.id=l.tenant_id ORDER BY l.id DESC LIMIT 300`))));

A.get('/admins', wrap(async (req, res) => res.json(await all('SELECT id,name,username,created_at FROM super_admins ORDER BY id'))));
A.post('/admins', wrap(async (req, res) => {
  const b = req.body;
  if (!s(b.username) || s(b.password).length < 6) fail('Username and password (6+) required');
  if (await one('SELECT id FROM super_admins WHERE username=$1', [s(b.username)])) fail('Username exists');
  await q('INSERT INTO super_admins(name,username,password_hash) VALUES($1,$2,$3)', [s(b.name) || s(b.username), s(b.username), bcrypt.hashSync(s(b.password), 10)]);
  res.json({ ok: true });
}));
A.put('/admins/:id', wrap(async (req, res) => {
  const b = req.body;
  if (s(b.name)) await q('UPDATE super_admins SET name=$2 WHERE id=$1', [req.params.id, s(b.name)]);
  if (s(b.username)) await q('UPDATE super_admins SET username=$2 WHERE id=$1', [req.params.id, s(b.username)]);
  if (s(b.password)) { if (s(b.password).length < 6) fail('Password 6+ chars'); await q('UPDATE super_admins SET password_hash=$2 WHERE id=$1', [req.params.id, bcrypt.hashSync(s(b.password), 10)]); }
  res.json({ ok: true });
}));
A.delete('/admins/:id', wrap(async (req, res) => {
  if (parseInt(req.params.id, 10) === req.admin.id) fail('You cannot delete yourself');
  await q('DELETE FROM super_admins WHERE id=$1', [req.params.id]);
  await q(`DELETE FROM sessions WHERE kind='admin' AND user_id=$1`, [req.params.id]);
  res.json({ ok: true });
}));
A.get('/backups', wrap(async (req, res) => {
  if (!fs.existsSync(CFG.BACKUP_DIR)) return res.json([]);
  res.json(fs.readdirSync(CFG.BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse().map(f => ({ file: f, size: fs.statSync(path.join(CFG.BACKUP_DIR, f)).size })));
}));
A.post('/backups/run', wrap(async (req, res) => { const f = await runBackup(); res.json({ ok: true, file: f }); }));
A.get('/backups/:file', wrap(async (req, res) => {
  const f = path.basename(req.params.file);
  const p = path.join(CFG.BACKUP_DIR, f);
  if (!fs.existsSync(p)) fail('Not found', 404);
  res.download(p);
}));

// ============================================================
//  TENANT API
// ============================================================
const T = express.Router();
app.use('/api', T);

T.get('/me', tenantAuth(), wrap(async (req, res) => {
  const branches = await all('SELECT id,name FROM branches WHERE tenant_id=$1 AND active ORDER BY id', [req.t]);
  const st = await getSettings();
  res.json({ user: req.u, tenant: req.tenant, branches, perms_all: PERMS, today: todayBD(),
    platform: { brand_name: st.brand_name, support_phone: st.support_phone, support_whatsapp: st.support_whatsapp, announcement: st.announcement, primary_color: st.primary_color } });
}));

T.post('/auth/change-password', tenantAuth(), wrap(async (req, res) => {
  const u = await one('SELECT password_hash FROM users WHERE id=$1', [req.u.id]);
  if (!bcrypt.compareSync(s(req.body.old_password), u.password_hash)) fail('Current password is wrong');
  if (s(req.body.new_password).length < 6) fail('New password must be 6+ characters');
  await q('UPDATE users SET password_hash=$2 WHERE id=$1', [req.u.id, bcrypt.hashSync(s(req.body.new_password), 10)]);
  res.json({ ok: true });
}));

// ---------- generic simple CRUD ----------
function crud(route, table, fields, perm, opts = {}) {
  T.get('/' + route, tenantAuth(), wrap(async (req, res) => {
    res.json(await all(`SELECT * FROM ${table} WHERE tenant_id=$1 ${opts.activeOnly && !req.query.all ? 'AND active' : ''} ORDER BY ${opts.order || 'id'}`, [req.t]));
  }));
  T.post('/' + route, tenantAuth(perm), wrap(async (req, res) => {
    const b = req.body; const cols = ['tenant_id'], vals = [req.t];
    fields.forEach(f => { if (b[f] !== undefined) { cols.push(f); vals.push(b[f] === '' ? null : b[f]); } });
    if (fields.includes('name') && !s(b.name)) fail('Name is required');
    const r = await one(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals);
    res.json(r);
  }));
  T.put('/' + route + '/:id', tenantAuth(perm), wrap(async (req, res) => {
    const b = req.body; const sets = [], vals = [req.params.id, req.t];
    fields.concat(['active']).forEach(f => { if (b[f] !== undefined) { vals.push(b[f] === '' ? null : b[f]); sets.push(`${f}=$${vals.length}`); } });
    if (!sets.length) return res.json({ ok: true });
    const r = await one(`UPDATE ${table} SET ${sets.join(',')} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals);
    if (!r) fail('Not found', 404);
    res.json(r);
  }));
  T.delete('/' + route + '/:id', tenantAuth(perm), wrap(async (req, res) => {
    try { await q(`DELETE FROM ${table} WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.t]); }
    catch (e) { await q(`UPDATE ${table} SET active=false WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.t]); }
    res.json({ ok: true });
  }));
}
crud('categories', 'categories', ['name'], 'products', { activeOnly: true, order: 'name' });
crud('brands', 'brands', ['name'], 'products', { activeOnly: true, order: 'name' });
crud('expense-categories', 'expense_categories', ['name'], 'expenses', { activeOnly: true, order: 'name' });
crud('branches', 'branches', ['name', 'address', 'phone'], 'settings', { activeOnly: true });
crud('employees', 'employees', ['name', 'phone', 'designation', 'address', 'nid', 'salary', 'join_date', 'branch_id'], 'employees', { activeOnly: true, order: 'name' });

// ---------- accounts ----------
const ACC_BAL = `a.opening_balance + COALESCE((SELECT sum(CASE WHEN direction='in' THEN amount ELSE -amount END) FROM account_txns WHERE account_id=a.id),0)`;
T.get('/accounts', tenantAuth(), wrap(async (req, res) => {
  res.json(await all(`SELECT a.*, ${ACC_BAL} balance FROM accounts a WHERE tenant_id=$1 ${req.query.all ? '' : 'AND active'} ORDER BY id`, [req.t]));
}));
T.post('/accounts', tenantAuth('accounts'), wrap(async (req, res) => {
  const b = req.body; if (!s(b.name)) fail('Name required');
  res.json(await one('INSERT INTO accounts(tenant_id,name,type,number,opening_balance) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.t, s(b.name), s(b.type) || 'cash', s(b.number), n(b.opening_balance)]));
}));
T.put('/accounts/:id', tenantAuth('accounts'), wrap(async (req, res) => {
  const b = req.body;
  await q('UPDATE accounts SET name=COALESCE($3,name), type=COALESCE($4,type), number=COALESCE($5,number), opening_balance=COALESCE($6,opening_balance), active=COALESCE($7,active) WHERE id=$1 AND tenant_id=$2',
    [req.params.id, req.t, nullIfEmpty(b.name), nullIfEmpty(b.type), b.number === undefined ? null : s(b.number), b.opening_balance === undefined ? null : n(b.opening_balance), b.active === undefined ? null : !!b.active]);
  res.json({ ok: true });
}));
async function accountOk(c, tid, aid) {
  const a = (await c.query('SELECT id,name,type FROM accounts WHERE id=$1 AND tenant_id=$2', [aid, tid])).rows[0];
  if (!a) fail('Select a valid payment account');
  return a;
}
async function addTxn(c, o) {
  if (!(r2(o.amount) > 0)) return;
  await c.query(`INSERT INTO account_txns(tenant_id,account_id,branch_id,date,direction,amount,type,ref_type,ref_id,party,note,user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [o.t, o.account_id, o.branch_id || null, o.date || todayBD(), o.direction, r2(o.amount), o.type, o.ref_type || null, o.ref_id || null, o.party || null, o.note || null, o.user_id || null]);
}
T.post('/accounts/transfer', tenantAuth('accounts'), wrap(async (req, res) => {
  const b = req.body; const amt = r2(b.amount);
  if (amt <= 0) fail('Enter amount');
  if (String(b.from) === String(b.to)) fail('Choose two different accounts');
  await tx(async c => {
    const f = await accountOk(c, req.t, b.from), to = await accountOk(c, req.t, b.to);
    const date = dOr(b.date, todayBD()), br = await branchOf(req);
    await addTxn(c, { t: req.t, account_id: f.id, branch_id: br, date, direction: 'out', amount: amt, type: 'transfer', note: `→ ${to.name} ${s(b.note)}`, user_id: req.u.id });
    await addTxn(c, { t: req.t, account_id: to.id, branch_id: br, date, direction: 'in', amount: amt, type: 'transfer', note: `← ${f.name} ${s(b.note)}`, user_id: req.u.id });
  });
  res.json({ ok: true });
}));
T.post('/accounts/:id/adjust', tenantAuth('accounts'), wrap(async (req, res) => {
  const b = req.body; const amt = r2(b.amount);
  if (amt <= 0) fail('Enter amount');
  await tx(async c => {
    await accountOk(c, req.t, req.params.id);
    await addTxn(c, { t: req.t, account_id: req.params.id, branch_id: await branchOf(req), date: dOr(b.date, todayBD()), direction: b.direction === 'out' ? 'out' : 'in',
      amount: amt, type: b.direction === 'out' ? 'withdraw' : 'deposit', note: s(b.note), user_id: req.u.id });
  });
  res.json({ ok: true });
}));
T.get('/accounts/:id/statement', tenantAuth('accounts'), wrap(async (req, res) => {
  const from = dOr(req.query.from, addDays(todayBD(), -30)), to = dOr(req.query.to, todayBD());
  const a = await one('SELECT * FROM accounts WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  if (!a) fail('Not found', 404);
  const op = await one(`SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM account_txns WHERE account_id=$1 AND date<$2`, [a.id, from]);
  const rows = await all(`SELECT x.*, u.name user_name FROM account_txns x LEFT JOIN users u ON u.id=x.user_id WHERE account_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date, id`, [a.id, from, to]);
  res.json({ account: a, opening: r2(a.opening_balance + op.v), rows });
}));

// ---------- products ----------
function tileUnits(p) {
  const units = [{ name: 'sqft', factor: 1 }];
  if (n(p.sqft_per_pcs) > 0) units.push({ name: 'pcs', factor: r4(p.sqft_per_pcs) });
  if (n(p.sqft_per_pcs) > 0 && n(p.pcs_per_box) > 0) units.push({ name: 'box', factor: r4(n(p.sqft_per_pcs) * n(p.pcs_per_box)) });
  return units;
}
async function saveProduct(c, tid, id, b) {
  const kind = ['tile', 'sanitary', 'hardware', 'general'].includes(b.kind) ? b.kind : 'general';
  if (!s(b.name)) fail('Product name is required');
  const base = kind === 'tile' ? 'sqft' : (s(b.base_unit) || 'pcs');
  if (kind === 'tile' && !(n(b.sqft_per_pcs) > 0 && n(b.pcs_per_box) > 0)) fail('For tiles enter sqft per piece and pieces per box');
  if (s(b.barcode)) {
    const dup = (await c.query('SELECT id FROM products WHERE tenant_id=$1 AND barcode=$2 AND id<>$3', [tid, s(b.barcode), id || 0])).rows[0];
    if (dup) fail('This barcode is already used by another product');
  }
  const vals = [kind, s(b.name), s(b.name_bn), s(b.sku), s(b.barcode), intOrNull(b.category_id), intOrNull(b.brand_id), s(b.size), base,
    kind === 'tile' ? r4(b.sqft_per_pcs) : null, kind === 'tile' ? r4(b.pcs_per_box) : null,
    r4(b.purchase_price), r4(b.retail_price), r4(b.wholesale_price), n(b.vat_percent), n(b.reorder_level),
    s(b.sale_unit) || (kind === 'tile' ? 'box' : base), s(b.purchase_unit) || (kind === 'tile' ? 'box' : base),
    s(b.description), b.image === undefined ? null : s(b.image), b.show_in_catalog !== false, b.active !== false];
  let pid = id;
  if (id) {
    const r = await c.query(`UPDATE products SET kind=$1,name=$2,name_bn=$3,sku=$4,barcode=$5,category_id=$6,brand_id=$7,size=$8,base_unit=$9,sqft_per_pcs=$10,pcs_per_box=$11,
      purchase_price=$12,retail_price=$13,wholesale_price=$14,vat_percent=$15,reorder_level=$16,sale_unit=$17,purchase_unit=$18,description=$19,
      image=COALESCE($20,image),show_in_catalog=$21,active=$22 WHERE id=$23 AND tenant_id=$24 RETURNING id`, vals.concat([id, tid]));
    if (!r.rows[0]) fail('Product not found', 404);
  } else {
    const r = await c.query(`INSERT INTO products(kind,name,name_bn,sku,barcode,category_id,brand_id,size,base_unit,sqft_per_pcs,pcs_per_box,purchase_price,retail_price,
      wholesale_price,vat_percent,reorder_level,sale_unit,purchase_unit,description,image,show_in_catalog,active,tenant_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`, vals.concat([tid]));
    pid = r.rows[0].id;
  }
  await c.query('DELETE FROM product_units WHERE product_id=$1', [pid]);
  let units = kind === 'tile' ? tileUnits(b) : [{ name: base, factor: 1 }];
  if (kind !== 'tile' && Array.isArray(b.units)) {
    b.units.forEach(u => { if (s(u.name) && s(u.name) !== base && n(u.factor) > 0) units.push({ name: s(u.name), factor: n(u.factor), retail_price: u.retail_price, wholesale_price: u.wholesale_price }); });
  }
  if (kind === 'tile' && Array.isArray(b.units)) {
    b.units.forEach(u => { const x = units.find(z => z.name === u.name); if (x) { x.retail_price = u.retail_price; x.wholesale_price = u.wholesale_price; } });
  }
  for (const u of units) {
    await c.query('INSERT INTO product_units(tenant_id,product_id,name,factor,retail_price,wholesale_price) VALUES($1,$2,$3,$4,$5,$6)',
      [tid, pid, u.name, u.factor, n(u.retail_price) > 0 ? r4(u.retail_price) : null, n(u.wholesale_price) > 0 ? r4(u.wholesale_price) : null]);
  }
  return pid;
}
const UNITS_JSON = `COALESCE((SELECT json_agg(json_build_object('name',pu.name,'factor',pu.factor,'retail_price',pu.retail_price,'wholesale_price',pu.wholesale_price) ORDER BY pu.factor) FROM product_units pu WHERE pu.product_id=p.id),'[]')`;

T.get('/products', tenantAuth(), wrap(async (req, res) => {
  const br = await branchOf(req);
  const params = [req.t, br]; const where = ['p.tenant_id=$1'];
  if (!req.query.all) where.push('p.active');
  if (s(req.query.q)) { params.push('%' + s(req.query.q) + '%'); where.push(`(p.name ILIKE $${params.length} OR p.name_bn ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length} OR p.size ILIKE $${params.length})`); }
  if (intOrNull(req.query.category_id)) { params.push(intOrNull(req.query.category_id)); where.push(`p.category_id=$${params.length}`); }
  if (s(req.query.kind)) { params.push(s(req.query.kind)); where.push(`p.kind=$${params.length}`); }
  const rows = await all(`SELECT p.id,p.kind,p.name,p.name_bn,p.sku,p.barcode,p.size,p.base_unit,p.sqft_per_pcs,p.pcs_per_box,p.purchase_price,p.retail_price,p.wholesale_price,
      p.vat_percent,p.reorder_level,p.sale_unit,p.purchase_unit,p.category_id,p.brand_id,p.active,p.show_in_catalog,(p.image IS NOT NULL AND p.image<>'') has_image,
      c.name category, b.name brand,
      COALESCE((SELECT sum(qty) FROM stock WHERE product_id=p.id AND branch_id=$2),0) stock,
      COALESCE((SELECT sum(qty) FROM stock WHERE product_id=p.id),0) stock_all,
      ${UNITS_JSON} units
    FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id
    WHERE ${where.join(' AND ')} ORDER BY p.name LIMIT ${req.query.limit ? Math.min(parseInt(req.query.limit, 10) || 50, 2000) : 2000}`, params);
  if (req.query.low) return res.json(rows.filter(r => r.stock <= r.reorder_level));
  res.json(rows);
}));
T.get('/products/lookup', tenantAuth(), wrap(async (req, res) => {
  const code = s(req.query.code);
  const p = await one(`SELECT id FROM products WHERE tenant_id=$1 AND active AND (barcode=$2 OR sku=$2) LIMIT 1`, [req.t, code]);
  res.json(p || null);
}));
T.get('/products/:id', tenantAuth(), wrap(async (req, res) => {
  const br = await branchOf(req);
  const p = await one(`SELECT p.*, ${UNITS_JSON} units, c.name category, b.name brand FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id WHERE p.id=$1 AND p.tenant_id=$2`, [req.params.id, req.t]);
  if (!p) fail('Not found', 404);
  p.batches = await all(`SELECT s.batch, s.shade, s.qty, s.branch_id, br.name branch FROM stock s JOIN branches br ON br.id=s.branch_id WHERE s.product_id=$1 AND s.qty<>0 ORDER BY s.branch_id, s.batch, s.shade`, [p.id]);
  p.stock = p.batches.filter(x => x.branch_id === br).reduce((a, x) => a + n(x.qty), 0);
  res.json(p);
}));
T.post('/products', tenantAuth('products'), wrap(async (req, res) => {
  const b = req.body;
  const id = await tx(async c => {
    const pid = await saveProduct(c, req.t, null, b);
    if (n(b.opening_stock) !== 0) {
      const br = await branchOf(req, b.branch_id);
      const factor = n(b.opening_factor) || 1;
      await moveStock(c, req.t, { product_id: pid, branch_id: br, batch: s(b.opening_batch), shade: s(b.opening_shade), qty: n(b.opening_stock) * factor, type: 'opening', cost: r4(b.purchase_price), note: 'Opening stock', user_id: req.u.id });
    }
    return pid;
  });
  logAct(req.t, req.u, 'product_add', s(b.name));
  res.json({ ok: true, id });
}));
T.put('/products/:id', tenantAuth('products'), wrap(async (req, res) => {
  await tx(c => saveProduct(c, req.t, parseInt(req.params.id, 10), req.body));
  res.json({ ok: true });
}));
T.delete('/products/:id', tenantAuth('products'), wrap(async (req, res) => {
  const used = await one('SELECT (SELECT count(*) FROM sale_items WHERE product_id=$1)+(SELECT count(*) FROM purchase_items WHERE product_id=$1) c', [req.params.id]);
  if (n(used.c) > 0) await q('UPDATE products SET active=false WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  else await q('DELETE FROM products WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  res.json({ ok: true, archived: n(used.c) > 0 });
}));
T.post('/products/bulk', tenantAuth('products'), wrap(async (req, res) => {
  const list = Array.isArray(req.body.items) ? req.body.items.slice(0, 2000) : [];
  let added = 0; const errors = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    try {
      await tx(async c => {
        if (s(it.category) && !it.category_id) {
          let cat = (await c.query('SELECT id FROM categories WHERE tenant_id=$1 AND lower(name)=lower($2)', [req.t, s(it.category)])).rows[0];
          if (!cat) cat = (await c.query('INSERT INTO categories(tenant_id,name) VALUES($1,$2) RETURNING id', [req.t, s(it.category)])).rows[0];
          it.category_id = cat.id;
        }
        if (s(it.brand) && !it.brand_id) {
          let br = (await c.query('SELECT id FROM brands WHERE tenant_id=$1 AND lower(name)=lower($2)', [req.t, s(it.brand)])).rows[0];
          if (!br) br = (await c.query('INSERT INTO brands(tenant_id,name) VALUES($1,$2) RETURNING id', [req.t, s(it.brand)])).rows[0];
          it.brand_id = br.id;
        }
        const pid = await saveProduct(c, req.t, null, it);
        if (n(it.opening_stock) > 0) {
          const brId = await branchOf(req);
          const factor = it.kind === 'tile' ? n(it.sqft_per_pcs) * n(it.pcs_per_box) : 1;
          await moveStock(c, req.t, { product_id: pid, branch_id: brId, qty: n(it.opening_stock) * (factor || 1), type: 'opening', cost: r4(it.purchase_price), note: 'Opening stock (import)', user_id: req.u.id });
        }
      });
      added++;
    } catch (e) { errors.push(`Row ${i + 2}: ${e.message}`); }
  }
  res.json({ ok: true, added, errors: errors.slice(0, 50) });
}));

// ---------- stock ----------
async function moveStock(c, tid, m) {
  const qty = r4(m.qty);
  if (qty === 0) return;
  const batch = s(m.batch), shade = s(m.shade);
  if (!m.branch_id) fail('No branch selected');
  if (qty < 0 && m.check) {
    const cur = (await c.query('SELECT qty FROM stock WHERE product_id=$1 AND branch_id=$2 AND batch=$3 AND shade=$4', [m.product_id, m.branch_id, batch, shade])).rows[0];
    if (!cur || n(cur.qty) + qty < -0.0001) {
      const p = (await c.query('SELECT name FROM products WHERE id=$1', [m.product_id])).rows[0];
      fail(`Not enough stock for "${p ? p.name : ''}"${batch || shade ? ` (batch ${batch || '-'}, shade ${shade || '-'})` : ''}. Available: ${cur ? r4(cur.qty) : 0}`);
    }
  }
  await c.query(`INSERT INTO stock(tenant_id,product_id,branch_id,batch,shade,qty) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(product_id,branch_id,batch,shade) DO UPDATE SET qty=stock.qty+EXCLUDED.qty`, [tid, m.product_id, m.branch_id, batch, shade, qty]);
  await c.query(`INSERT INTO stock_moves(tenant_id,product_id,branch_id,batch,shade,qty,type,ref_type,ref_id,cost,note,user_id,date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  [tid, m.product_id, m.branch_id, batch, shade, qty, m.type, m.ref_type || null, m.ref_id || null, n(m.cost), m.note || null, m.user_id || null, m.date || todayBD()]);
}
T.get('/stock', tenantAuth(), wrap(async (req, res) => {
  const bf = branchFilter(req);
  const params = [req.t]; let bcond = '';
  if (bf) { params.push(bf); bcond = `AND s.branch_id=$2`; }
  const rows = await all(`SELECT s.product_id, s.batch, s.shade, s.branch_id, br.name branch, s.qty, p.name, p.kind, p.size, p.base_unit, p.sqft_per_pcs, p.pcs_per_box,
      p.purchase_price, p.retail_price, p.reorder_level, c.name category
    FROM stock s JOIN products p ON p.id=s.product_id JOIN branches br ON br.id=s.branch_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE s.tenant_id=$1 ${bcond} AND s.qty<>0 AND p.active ORDER BY p.name, s.batch, s.shade`, params);
  res.json(rows);
}));
T.get('/stock/batches/:pid', tenantAuth(), wrap(async (req, res) => {
  const br = await branchOf(req);
  res.json(await all('SELECT batch, shade, qty FROM stock WHERE product_id=$1 AND branch_id=$2 AND tenant_id=$3 AND qty<>0 ORDER BY batch, shade', [req.params.pid, br, req.t]));
}));
T.post('/stock/adjust', tenantAuth('stock_adjust'), wrap(async (req, res) => {
  const b = req.body;
  const type = ['adjust', 'damage', 'opening'].includes(b.type) ? b.type : 'adjust';
  const p = await one('SELECT id,purchase_price,name FROM products WHERE id=$1 AND tenant_id=$2', [b.product_id, req.t]);
  if (!p) fail('Select product');
  let qty = n(b.qty) * (n(b.factor) || 1);
  if (type === 'damage') qty = -Math.abs(qty);
  if (qty === 0) fail('Enter quantity');
  await tx(async c => moveStock(c, req.t, { product_id: p.id, branch_id: await branchOf(req, b.branch_id), batch: b.batch, shade: b.shade, qty, type, cost: p.purchase_price, note: s(b.note), user_id: req.u.id, date: dOr(b.date, todayBD()) }));
  logAct(req.t, req.u, 'stock_' + type, `${p.name}: ${qty}`);
  res.json({ ok: true });
}));
T.post('/stock/transfer', tenantAuth('stock_adjust'), wrap(async (req, res) => {
  if (req.u.branch_id) fail('Branch users cannot transfer stock');
  const b = req.body; const qty = Math.abs(n(b.qty) * (n(b.factor) || 1));
  if (!qty) fail('Enter quantity');
  if (String(b.from_branch) === String(b.to_branch)) fail('Choose different branches');
  const p = await one('SELECT id,purchase_price FROM products WHERE id=$1 AND tenant_id=$2', [b.product_id, req.t]);
  if (!p) fail('Select product');
  const fb = await one('SELECT id,name FROM branches WHERE id=$1 AND tenant_id=$2', [b.from_branch, req.t]);
  const tb = await one('SELECT id,name FROM branches WHERE id=$1 AND tenant_id=$2', [b.to_branch, req.t]);
  if (!fb || !tb) fail('Select branches');
  await tx(async c => {
    await moveStock(c, req.t, { product_id: p.id, branch_id: fb.id, batch: b.batch, shade: b.shade, qty: -qty, type: 'transfer_out', cost: p.purchase_price, note: `To ${tb.name}. ${s(b.note)}`, user_id: req.u.id, check: true });
    await moveStock(c, req.t, { product_id: p.id, branch_id: tb.id, batch: b.batch, shade: b.shade, qty, type: 'transfer_in', cost: p.purchase_price, note: `From ${fb.name}. ${s(b.note)}`, user_id: req.u.id });
  });
  res.json({ ok: true });
}));
T.get('/stock/moves', tenantAuth(), wrap(async (req, res) => {
  const params = [req.t]; const where = ['m.tenant_id=$1'];
  if (intOrNull(req.query.product_id)) { params.push(intOrNull(req.query.product_id)); where.push(`m.product_id=$${params.length}`); }
  if (s(req.query.type)) { params.push(s(req.query.type)); where.push(`m.type=$${params.length}`); }
  const bf = branchFilter(req); if (bf) { params.push(bf); where.push(`m.branch_id=$${params.length}`); }
  if (isDate(req.query.from)) { params.push(req.query.from); where.push(`m.date>=$${params.length}`); }
  if (isDate(req.query.to)) { params.push(req.query.to); where.push(`m.date<=$${params.length}`); }
  res.json(await all(`SELECT m.*, p.name, p.base_unit, p.kind, p.sqft_per_pcs, p.pcs_per_box, u.name user_name, br.name branch FROM stock_moves m JOIN products p ON p.id=m.product_id
    LEFT JOIN users u ON u.id=m.user_id LEFT JOIN branches br ON br.id=m.branch_id WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT 1000`, params));
}));

// ---------- customers & suppliers ----------
const CUST_BAL = `COALESCE((SELECT sum(debit-credit) FROM party_ledger l WHERE l.party_type='customer' AND l.party_id=c.id),0)`;
const SUP_BAL = `COALESCE((SELECT sum(credit-debit) FROM party_ledger l WHERE l.party_type='supplier' AND l.party_id=c.id),0)`;
async function partyBalance(c, type, id) {
  const r = (await c.query(`SELECT COALESCE(sum(${type === 'customer' ? 'debit-credit' : 'credit-debit'}),0) b FROM party_ledger WHERE party_type=$1 AND party_id=$2`, [type, id])).rows[0];
  return r2(r.b);
}
async function ledger(c, o) {
  if (!r2(o.debit) && !r2(o.credit)) return;
  await c.query(`INSERT INTO party_ledger(tenant_id,party_type,party_id,date,ref_type,ref_id,ref_no,debit,credit,note,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [o.t, o.party_type, o.party_id, o.date || todayBD(), o.ref_type || null, o.ref_id || null, o.ref_no || null, r2(o.debit), r2(o.credit), o.note || null, o.user_id || null]);
}

T.get('/customers', tenantAuth(), wrap(async (req, res) => {
  const params = [req.t]; let w = '';
  if (s(req.query.q)) { params.push('%' + s(req.query.q) + '%'); w = `AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.address ILIKE $2)`; }
  const rows = await all(`SELECT c.*, ${CUST_BAL} balance,
      (SELECT max(date) FROM party_ledger l WHERE l.party_type='customer' AND l.party_id=c.id AND l.credit>0) last_payment,
      (SELECT max(date) FROM party_ledger l WHERE l.party_type='customer' AND l.party_id=c.id AND l.debit>0) last_purchase,
      (SELECT min(date) FROM party_ledger l WHERE l.party_type='customer' AND l.party_id=c.id AND l.debit>0) first_purchase
    FROM customers c WHERE c.tenant_id=$1 ${req.query.all ? '' : 'AND c.active'} ${w} ORDER BY c.name LIMIT 5000`, params);
  const today = todayBD();
  rows.forEach(r => {
    const since = r.last_payment && r.last_payment > (r.first_purchase || '') ? r.last_payment : (r.first_purchase || r.last_payment);
    r.days_since = since ? Math.round((new Date(today) - new Date(since)) / 864e5) : 0;
    r.overdue = r.balance > 0 && r.days_since > (r.due_days || 30);
  });
  if (req.query.due) return res.json(rows.filter(r => r.balance > 0));
  if (req.query.overdue) return res.json(rows.filter(r => r.overdue));
  res.json(rows);
}));
T.post('/customers', tenantAuth('customers'), wrap(async (req, res) => {
  const b = req.body; if (!s(b.name)) fail('Customer name is required');
  const phone = s(b.phone).replace(/[^0-9]/g, '');
  if (phone && !/^01[3-9]\d{8}$/.test(phone)) fail('Enter a valid mobile number (01XXXXXXXXX)');
  if (phone) { const d = await one('SELECT id,name FROM customers WHERE tenant_id=$1 AND phone=$2 AND active', [req.t, phone]); if (d) fail(`This number already belongs to customer "${d.name}"`); }
  const r = await tx(async c => {
    const x = (await c.query(`INSERT INTO customers(tenant_id,name,phone,address,type,credit_limit,due_days,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.t, s(b.name), phone, s(b.address), s(b.type) || 'retail', n(b.credit_limit), parseInt(b.due_days, 10) || 30, s(b.notes)])).rows[0];
    if (n(b.opening_due) !== 0) await ledger(c, { t: req.t, party_type: 'customer', party_id: x.id, ref_type: 'opening', debit: n(b.opening_due) > 0 ? n(b.opening_due) : 0, credit: n(b.opening_due) < 0 ? -n(b.opening_due) : 0, note: 'Previous due / পূর্বের বাকি', user_id: req.u.id });
    return x;
  });
  res.json(r);
}));
T.put('/customers/:id', tenantAuth('customers'), wrap(async (req, res) => {
  const b = req.body; const phone = s(b.phone).replace(/[^0-9]/g, '');
  if (phone && !/^01[3-9]\d{8}$/.test(phone)) fail('Enter a valid mobile number (01XXXXXXXXX)');
  await q(`UPDATE customers SET name=$3,phone=$4,address=$5,type=$6,credit_limit=$7,due_days=$8,notes=$9,active=COALESCE($10,active) WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.t, s(b.name), phone, s(b.address), s(b.type) || 'retail', n(b.credit_limit), parseInt(b.due_days, 10) || 30, s(b.notes), b.active === undefined ? null : !!b.active]);
  res.json({ ok: true });
}));
T.delete('/customers/:id', tenantAuth('customers'), wrap(async (req, res) => {
  const bal = await one(`SELECT ${CUST_BAL} b FROM customers c WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.t]);
  if (bal && Math.abs(bal.b) > 0.009) fail('Customer has a non-zero balance. Settle it first.');
  await q('UPDATE customers SET active=false WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  res.json({ ok: true });
}));
T.get('/customers/:id/ledger', tenantAuth(), wrap(async (req, res) => {
  const c = await one(`SELECT c.*, ${CUST_BAL} balance FROM customers c WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.t]);
  if (!c) fail('Not found', 404);
  const from = dOr(req.query.from, '2000-01-01'), to = dOr(req.query.to, '2999-12-31');
  const op = await one(`SELECT COALESCE(sum(debit-credit),0) v FROM party_ledger WHERE party_type='customer' AND party_id=$1 AND date<$2`, [c.id, from]);
  const rows = await all(`SELECT * FROM party_ledger WHERE party_type='customer' AND party_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date, id`, [c.id, from, to]);
  let run = op.v; rows.forEach(r => { run = r2(run + r.debit - r.credit); r.balance = run; });
  res.json({ customer: c, opening: r2(op.v), rows });
}));
async function receivePayment(req, partyType, id, b) {
  const amt = r2(b.amount), disc = r2(b.discount);
  if (amt <= 0 && disc <= 0) fail('Enter amount');
  const tbl = partyType === 'customer' ? 'customers' : 'suppliers';
  const p = await one(`SELECT id,name FROM ${tbl} WHERE id=$1 AND tenant_id=$2`, [id, req.t]);
  if (!p) fail('Not found', 404);
  const date = dOr(b.date, todayBD());
  return tx(async c => {
    const br = await branchOf(req);
    const key = partyType === 'customer' ? 'collection' : 'supplier_payment';
    const refNo = await nextNo(c, req.t, key, partyType === 'customer' ? 'MR-' : 'SP-');
    if (amt > 0) {
      const acc = await accountOk(c, req.t, b.account_id);
      await addTxn(c, { t: req.t, account_id: acc.id, branch_id: br, date, direction: partyType === 'customer' ? 'in' : 'out', amount: amt, type: key, ref_type: key, ref_id: p.id, party: p.name, note: (refNo + ' ' + s(b.note)).trim(), user_id: req.u.id });
    }
    if (partyType === 'customer') {
      await ledger(c, { t: req.t, party_type: 'customer', party_id: p.id, date, ref_type: 'payment', ref_no: refNo, credit: amt, note: s(b.note) || 'Payment received / টাকা জমা', user_id: req.u.id });
      if (disc > 0) await ledger(c, { t: req.t, party_type: 'customer', party_id: p.id, date, ref_type: 'discount', ref_no: refNo, credit: disc, note: 'Due discount / বাকি মওকুফ', user_id: req.u.id });
    } else {
      await ledger(c, { t: req.t, party_type: 'supplier', party_id: p.id, date, ref_type: 'payment', ref_no: refNo, debit: amt, note: s(b.note) || 'Payment to supplier / সাপ্লায়ার পেমেন্ট', user_id: req.u.id });
      if (disc > 0) await ledger(c, { t: req.t, party_type: 'supplier', party_id: p.id, date, ref_type: 'discount', ref_no: refNo, debit: disc, note: 'Discount received / ডিসকাউন্ট', user_id: req.u.id });
    }
    const balance = await partyBalance(c, partyType, p.id);
    return { ok: true, receipt_no: refNo, balance, name: p.name, amount: amt, discount: disc, date };
  });
}
T.post('/customers/:id/payment', tenantAuth('due_collect'), wrap(async (req, res) => {
  const r = await receivePayment(req, 'customer', req.params.id, req.body);
  logAct(req.t, req.u, 'due_collect', `${r.name}: ${r.amount}`);
  res.json(r);
}));
T.post('/customers/:id/adjust', tenantAuth('customers'), wrap(async (req, res) => {
  const b = req.body; const amt = r2(b.amount);
  if (!amt) fail('Enter amount');
  await tx(c => ledger(c, { t: req.t, party_type: 'customer', party_id: req.params.id, date: dOr(b.date, todayBD()), ref_type: 'adjust', debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, note: s(b.note) || 'Adjustment', user_id: req.u.id }));
  res.json({ ok: true });
}));

T.get('/suppliers', tenantAuth(), wrap(async (req, res) => {
  const params = [req.t]; let w = '';
  if (s(req.query.q)) { params.push('%' + s(req.query.q) + '%'); w = `AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.company ILIKE $2)`; }
  const rows = await all(`SELECT c.*, ${SUP_BAL} balance,
     (SELECT max(date) FROM party_ledger l WHERE l.party_type='supplier' AND l.party_id=c.id AND l.debit>0) last_payment
    FROM suppliers c WHERE c.tenant_id=$1 ${req.query.all ? '' : 'AND c.active'} ${w} ORDER BY c.name`, params);
  if (req.query.due) return res.json(rows.filter(r => r.balance > 0));
  res.json(rows);
}));
T.post('/suppliers', tenantAuth('suppliers'), wrap(async (req, res) => {
  const b = req.body; if (!s(b.name)) fail('Supplier name is required');
  const r = await tx(async c => {
    const x = (await c.query(`INSERT INTO suppliers(tenant_id,name,company,phone,address,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.t, s(b.name), s(b.company), s(b.phone).replace(/[^0-9]/g, ''), s(b.address), s(b.notes)])).rows[0];
    if (n(b.opening_due) !== 0) await ledger(c, { t: req.t, party_type: 'supplier', party_id: x.id, ref_type: 'opening', credit: n(b.opening_due) > 0 ? n(b.opening_due) : 0, debit: n(b.opening_due) < 0 ? -n(b.opening_due) : 0, note: 'Previous payable / পূর্বের পাওনা', user_id: req.u.id });
    return x;
  });
  res.json(r);
}));
T.put('/suppliers/:id', tenantAuth('suppliers'), wrap(async (req, res) => {
  const b = req.body;
  await q(`UPDATE suppliers SET name=$3,company=$4,phone=$5,address=$6,notes=$7,active=COALESCE($8,active) WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.t, s(b.name), s(b.company), s(b.phone).replace(/[^0-9]/g, ''), s(b.address), s(b.notes), b.active === undefined ? null : !!b.active]);
  res.json({ ok: true });
}));
T.delete('/suppliers/:id', tenantAuth('suppliers'), wrap(async (req, res) => {
  const bal = await one(`SELECT ${SUP_BAL} b FROM suppliers c WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.t]);
  if (bal && Math.abs(bal.b) > 0.009) fail('Supplier has a non-zero balance. Settle it first.');
  await q('UPDATE suppliers SET active=false WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  res.json({ ok: true });
}));
T.get('/suppliers/:id/ledger', tenantAuth(), wrap(async (req, res) => {
  const c = await one(`SELECT c.*, ${SUP_BAL} balance FROM suppliers c WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.t]);
  if (!c) fail('Not found', 404);
  const from = dOr(req.query.from, '2000-01-01'), to = dOr(req.query.to, '2999-12-31');
  const op = await one(`SELECT COALESCE(sum(credit-debit),0) v FROM party_ledger WHERE party_type='supplier' AND party_id=$1 AND date<$2`, [c.id, from]);
  const rows = await all(`SELECT * FROM party_ledger WHERE party_type='supplier' AND party_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date, id`, [c.id, from, to]);
  let run = op.v; rows.forEach(r => { run = r2(run + r.credit - r.debit); r.balance = run; });
  res.json({ supplier: c, opening: r2(op.v), rows });
}));
T.post('/suppliers/:id/payment', tenantAuth('supplier_pay'), wrap(async (req, res) => {
  const r = await receivePayment(req, 'supplier', req.params.id, req.body);
  logAct(req.t, req.u, 'supplier_pay', `${r.name}: ${r.amount}`);
  res.json(r);
}));

// ---------- sales ----------
async function computeLines(c, tid, items, saleType) {
  if (!Array.isArray(items) || !items.length) fail('Add at least one product');
  const lines = [];
  for (const it of items) {
    const p = (await c.query('SELECT * FROM products WHERE id=$1 AND tenant_id=$2', [it.product_id, tid])).rows[0];
    if (!p) fail('Product not found');
    const units = (await c.query('SELECT * FROM product_units WHERE product_id=$1', [p.id])).rows;
    const u = units.find(x => x.name === s(it.unit)) || units.find(x => x.name === p.base_unit) || { name: p.base_unit, factor: 1 };
    const qty = r4(it.qty);
    if (!(qty > 0)) fail(`Enter quantity for "${p.name}"`);
    const defRate = saleType === 'wholesale'
      ? (n(u.wholesale_price) || n(p.wholesale_price) * n(u.factor) || n(u.retail_price) || n(p.retail_price) * n(u.factor))
      : (n(u.retail_price) || n(p.retail_price) * n(u.factor));
    const rate = it.rate === undefined || it.rate === '' ? r4(defRate) : r4(it.rate);
    const disc = r2(it.discount);
    const total = r2(qty * rate - disc);
    lines.push({ p, unit: u.name, factor: n(u.factor), qty, rate, discount: disc, total, base_qty: r4(qty * n(u.factor)), batch: s(it.batch), shade: s(it.shade), name: p.name + (p.size ? ` (${p.size})` : '') });
  }
  return lines;
}
function totals(lines, b, settings) {
  const subtotal = r2(lines.reduce((a, l) => a + l.total, 0));
  let discount = r2(b.discount);
  if (s(b.discount_type) === 'percent') discount = r2(subtotal * n(b.discount) / 100);
  if (discount > subtotal) fail('Discount cannot be more than subtotal');
  const vatPct = b.vat_percent === undefined || b.vat_percent === '' ? n(settings.vat_percent) : n(b.vat_percent);
  const vat = r2((subtotal - discount) * vatPct / 100);
  const delivery = r2(b.delivery_charge);
  return { subtotal, discount, vat, vatPct, delivery, total: r2(subtotal - discount + vat + delivery) };
}

T.post('/sales', tenantAuth('pos'), wrap(async (req, res) => {
  const b = req.body; const set = req.tenant.settings;
  const result = await tx(async c => {
    const br = await branchOf(req, b.branch_id);
    const saleType = b.sale_type === 'wholesale' ? 'wholesale' : 'retail';
    const lines = await computeLines(c, req.t, b.items, saleType);
    const tt = totals(lines, b, set);
    const date = dOr(b.date, todayBD());
    let cust = null;
    if (intOrNull(b.customer_id)) {
      cust = (await c.query('SELECT * FROM customers WHERE id=$1 AND tenant_id=$2', [b.customer_id, req.t])).rows[0];
      if (!cust) fail('Customer not found');
    } else if (s(b.new_customer_name) && s(b.customer_phone)) {
      const phone = s(b.customer_phone).replace(/[^0-9]/g, '');
      if (!/^01[3-9]\d{8}$/.test(phone)) fail('Enter a valid customer mobile number');
      cust = (await c.query('SELECT * FROM customers WHERE tenant_id=$1 AND phone=$2 AND active', [req.t, phone])).rows[0];
      if (!cust) cust = (await c.query(`INSERT INTO customers(tenant_id,name,phone,address,type) VALUES($1,$2,$3,$4,$5) RETURNING *`, [req.t, s(b.new_customer_name), phone, s(b.customer_address), saleType === 'wholesale' ? 'wholesale' : 'retail'])).rows[0];
    }
    const payments = (Array.isArray(b.payments) ? b.payments : []).filter(p => r2(p.amount) > 0);
    let paidTotal = r2(payments.reduce((a, p) => a + r2(p.amount), 0));
    if (!cust && paidTotal < tt.total - 0.009) fail('Credit (due) sale needs a customer. Select or add a customer.');
    if (!cust && paidTotal > tt.total) {
      // walk-in: extra is change returned; reduce last payment
      let extra = r2(paidTotal - tt.total);
      for (let i = payments.length - 1; i >= 0 && extra > 0; i--) { const cut = Math.min(extra, r2(payments[i].amount)); payments[i].amount = r2(payments[i].amount - cut); extra = r2(extra - cut); }
      paidTotal = tt.total;
    }
    const prevDue = cust ? await partyBalance(c, 'customer', cust.id) : 0;
    const invoicePaid = Math.min(paidTotal, tt.total);
    const due = r2(tt.total - invoicePaid);
    if (cust && n(cust.credit_limit) > 0 && !b.force) {
      const after = r2(prevDue + tt.total - paidTotal);
      if (after > n(cust.credit_limit)) fail(`Credit limit exceeded: balance will be ${after}, limit ${cust.credit_limit}`, 409, { code: 'credit_limit' });
    }
    const invNo = await nextNo(c, req.t, 'invoice', set.invoice_prefix || 'INV-');
    const delivery = b.delivery || {};
    const sale = (await c.query(`INSERT INTO sales(tenant_id,branch_id,invoice_no,date,customer_id,customer_name,customer_phone,customer_address,sale_type,subtotal,discount,vat,delivery_charge,total,paid,due,previous_due,note,
        delivery_status,delivery_address,delivery_person,delivery_phone,delivery_date,user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
    [req.t, br, invNo, date, cust ? cust.id : null, cust ? cust.name : (s(b.customer_name) || 'Walk-in / সাধারণ ক্রেতা'), cust ? cust.phone : s(b.customer_phone), cust ? cust.address : s(b.customer_address),
      saleType, tt.subtotal, tt.discount, tt.vat, tt.delivery, tt.total, invoicePaid, due, prevDue, s(b.note),
      delivery.enabled ? 'pending' : 'none', s(delivery.address) || (cust ? cust.address : ''), s(delivery.person), s(delivery.phone), isDate(delivery.date) ? delivery.date : null, req.u.id])).rows[0];
    let cost = 0;
    for (const l of lines) {
      const unitCost = n(l.p.purchase_price);
      cost += unitCost * l.base_qty;
      await c.query(`INSERT INTO sale_items(tenant_id,sale_id,product_id,name,batch,shade,unit,factor,qty,rate,discount,total,base_qty,cost) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [req.t, sale.id, l.p.id, l.name, l.batch, l.shade, l.unit, l.factor, l.qty, l.rate, l.discount, l.total, l.base_qty, unitCost]);
      await moveStock(c, req.t, { product_id: l.p.id, branch_id: br, batch: l.batch, shade: l.shade, qty: -l.base_qty, type: 'sale', ref_type: 'sale', ref_id: sale.id, cost: unitCost, note: invNo, user_id: req.u.id, date, check: !set.allow_negative_stock });
    }
    await c.query('UPDATE sales SET cost_total=$2 WHERE id=$1', [sale.id, r2(cost)]);
    for (const p of payments) {
      const acc = await accountOk(c, req.t, p.account_id);
      await addTxn(c, { t: req.t, account_id: acc.id, branch_id: br, date, direction: 'in', amount: p.amount, type: 'sale', ref_type: 'sale', ref_id: sale.id, party: sale.customer_name, note: invNo + (s(p.ref) ? ' / ' + s(p.ref) : ''), user_id: req.u.id });
    }
    if (cust) {
      await ledger(c, { t: req.t, party_type: 'customer', party_id: cust.id, date, ref_type: 'sale', ref_id: sale.id, ref_no: invNo, debit: tt.total, note: 'Sale / বিক্রি', user_id: req.u.id });
      if (paidTotal > 0) await ledger(c, { t: req.t, party_type: 'customer', party_id: cust.id, date, ref_type: 'sale_payment', ref_id: sale.id, ref_no: invNo, credit: paidTotal, note: paidTotal > tt.total ? 'Payment (incl. previous due) / জমা (পূর্বের বাকিসহ)' : 'Payment / জমা', user_id: req.u.id });
    }
    if (intOrNull(b.quotation_id)) await c.query(`UPDATE quotations SET status='converted', sale_id=$3 WHERE id=$1 AND tenant_id=$2`, [b.quotation_id, req.t, sale.id]);
    const balance = cust ? await partyBalance(c, 'customer', cust.id) : 0;
    return { sale, balance, cust, paidTotal };
  });
  logAct(req.t, req.u, 'sale', `${result.sale.invoice_no}: ${result.sale.total}`);
  if (result.cust && set.sms_on_sale && result.cust.phone) {
    const msg = s(set.sms_sale_template).replace(/\{name\}/g, result.cust.name).replace(/\{shop\}/g, req.tenant.name).replace(/\{total\}/g, result.sale.total).replace(/\{paid\}/g, result.paidTotal).replace(/\{due\}/g, result.balance).replace(/\{invoice\}/g, result.sale.invoice_no);
    sendSms(req.t, result.cust.phone, msg).catch(() => {});
  }
  res.json({ ok: true, id: result.sale.id, invoice_no: result.sale.invoice_no });
}));

T.get('/sales', tenantAuth('sales'), wrap(async (req, res) => {
  const params = [req.t]; const where = ['s.tenant_id=$1'];
  const from = dOr(req.query.from, null), to = dOr(req.query.to, null);
  if (from) { params.push(from); where.push(`s.date>=$${params.length}`); }
  if (to) { params.push(to); where.push(`s.date<=$${params.length}`); }
  if (s(req.query.q)) { params.push('%' + s(req.query.q) + '%'); where.push(`(s.invoice_no ILIKE $${params.length} OR s.customer_name ILIKE $${params.length} OR s.customer_phone ILIKE $${params.length})`); }
  if (intOrNull(req.query.customer_id)) { params.push(intOrNull(req.query.customer_id)); where.push(`s.customer_id=$${params.length}`); }
  if (req.query.due) where.push('s.due>0');
  const bf = branchFilter(req); if (bf) { params.push(bf); where.push(`s.branch_id=$${params.length}`); }
  res.json(await all(`SELECT s.id,s.invoice_no,s.date,s.customer_id,s.customer_name,s.customer_phone,s.sale_type,s.total,s.paid,s.due,s.returned,s.delivery_status,s.created_at,u.name user_name, br.name branch
    FROM sales s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN branches br ON br.id=s.branch_id WHERE ${where.join(' AND ')} ORDER BY s.id DESC LIMIT 1000`, params));
}));
T.get('/sales/:id', tenantAuth(), wrap(async (req, res) => {
  const sale = await one(`SELECT s.*, u.name user_name, br.name branch_name, br.address branch_address, br.phone branch_phone FROM sales s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN branches br ON br.id=s.branch_id WHERE s.id=$1 AND s.tenant_id=$2`, [req.params.id, req.t]);
  if (!sale) fail('Not found', 404);
  sale.items = await all(`SELECT si.*, p.kind, p.sqft_per_pcs, p.pcs_per_box, p.base_unit FROM sale_items si LEFT JOIN products p ON p.id=si.product_id WHERE si.sale_id=$1 ORDER BY si.id`, [sale.id]);
  sale.payments = await all(`SELECT x.amount, x.date, a.name account, a.type FROM account_txns x JOIN accounts a ON a.id=x.account_id WHERE x.ref_type='sale' AND x.ref_id=$1 AND x.tenant_id=$2 AND x.type='sale'`, [sale.id, req.t]);
  sale.returns = await all('SELECT * FROM sale_returns WHERE sale_id=$1 ORDER BY id', [sale.id]);
  if (sale.customer_id) sale.current_balance = await partyBalance(pool, 'customer', sale.customer_id);
  res.json(sale);
}));
T.delete('/sales/:id', tenantAuth('sales_delete'), wrap(async (req, res) => {
  await tx(async c => {
    const sale = (await c.query('SELECT * FROM sales WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [req.params.id, req.t])).rows[0];
    if (!sale) fail('Not found', 404);
    if (n(sale.returned) > 0) fail('This invoice has returns and cannot be deleted');
    const items = (await c.query('SELECT * FROM sale_items WHERE sale_id=$1', [sale.id])).rows;
    for (const it of items) if (it.product_id) await moveStock(c, req.t, { product_id: it.product_id, branch_id: sale.branch_id, batch: it.batch, shade: it.shade, qty: n(it.base_qty), type: 'adjust', note: 'Invoice deleted ' + sale.invoice_no, user_id: req.u.id });
    await c.query(`DELETE FROM account_txns WHERE tenant_id=$1 AND ref_type='sale' AND ref_id=$2`, [req.t, sale.id]);
    await c.query(`DELETE FROM party_ledger WHERE tenant_id=$1 AND ref_type IN ('sale','sale_payment') AND ref_id=$2`, [req.t, sale.id]);
    await c.query(`UPDATE quotations SET status='open', sale_id=NULL WHERE sale_id=$1`, [sale.id]);
    await c.query('DELETE FROM sales WHERE id=$1', [sale.id]);
    logAct(req.t, req.u, 'sale_delete', sale.invoice_no + ': ' + sale.total);
  });
  res.json({ ok: true });
}));
T.put('/sales/:id/delivery', tenantAuth('delivery'), wrap(async (req, res) => {
  const b = req.body;
  const st = ['none', 'pending', 'dispatched', 'delivered'].includes(b.delivery_status) ? b.delivery_status : 'pending';
  await q(`UPDATE sales SET delivery_status=$3, delivery_address=$4, delivery_person=$5, delivery_phone=$6, delivery_date=$7 WHERE id=$1 AND tenant_id=$2`,
    [req.params.id, req.t, st, s(b.delivery_address), s(b.delivery_person), s(b.delivery_phone), isDate(b.delivery_date) ? b.delivery_date : null]);
  res.json({ ok: true });
}));
T.get('/deliveries', tenantAuth('delivery'), wrap(async (req, res) => {
  const st = s(req.query.status);
  const params = [req.t]; let w = `AND s.delivery_status<>'none'`;
  if (st) { params.push(st); w = `AND s.delivery_status=$2`; }
  const bf = branchFilter(req); if (bf) { params.push(bf); w += ` AND s.branch_id=$${params.length}`; }
  res.json(await all(`SELECT s.id,s.invoice_no,s.date,s.customer_name,s.customer_phone,s.total,s.due,s.delivery_status,s.delivery_address,s.delivery_person,s.delivery_phone,s.delivery_date
    FROM sales s WHERE s.tenant_id=$1 ${w} ORDER BY (s.delivery_status='delivered'), s.id DESC LIMIT 500`, params));
}));

// returns
T.post('/sales/:id/return', tenantAuth('sales_return'), wrap(async (req, res) => {
  const b = req.body;
  const r = await tx(async c => {
    const sale = (await c.query('SELECT * FROM sales WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [req.params.id, req.t])).rows[0];
    if (!sale) fail('Invoice not found', 404);
    const items = (await c.query('SELECT * FROM sale_items WHERE sale_id=$1', [sale.id])).rows;
    const date = dOr(b.date, todayBD());
    const retNo = await nextNo(c, req.t, 'return', req.tenant.settings.return_prefix || 'RET-');
    let total = 0, cost = 0; const done = [];
    const discRatio = sale.subtotal > 0 ? (sale.subtotal - sale.discount + sale.vat) / sale.subtotal : 1;
    for (const ri of (b.items || [])) {
      const it = items.find(x => x.id === parseInt(ri.sale_item_id, 10));
      if (!it) continue;
      const qty = r4(ri.qty); if (!(qty > 0)) continue;
      const baseQty = r4(qty * n(it.factor));
      if (baseQty > n(it.base_qty) - n(it.returned_base_qty) + 0.0001) fail(`Return qty for "${it.name}" is more than sold`);
      const lineValue = r2((n(it.total) / n(it.qty)) * qty * discRatio);
      total += lineValue; cost += n(it.cost) * baseQty;
      await c.query('UPDATE sale_items SET returned_base_qty=returned_base_qty+$2 WHERE id=$1', [it.id, baseQty]);
      if (ri.restock !== false) await moveStock(c, req.t, { product_id: it.product_id, branch_id: sale.branch_id, batch: it.batch, shade: it.shade, qty: baseQty, type: 'sale_return', ref_type: 'sale_return', ref_id: sale.id, cost: it.cost, note: retNo + ' (' + sale.invoice_no + ')', user_id: req.u.id, date });
      else await c.query(`INSERT INTO stock_moves(tenant_id,product_id,branch_id,batch,shade,qty,type,ref_type,ref_id,cost,note,user_id,date) VALUES($1,$2,$3,$4,$5,0,'damage','sale_return',$6,$7,$8,$9,$10)`,
        [req.t, it.product_id, sale.branch_id, it.batch, it.shade, sale.id, it.cost, `Returned broken ${qty} ${it.unit} - not restocked (${retNo})`, req.u.id, date]);
      done.push({ sale_item_id: it.id, name: it.name, qty, unit: it.unit, value: lineValue, restock: ri.restock !== false });
    }
    if (!done.length) fail('Select items and quantity to return');
    total = r2(total);
    const refund = Math.min(r2(b.refund), total);
    const rr = (await c.query(`INSERT INTO sale_returns(tenant_id,sale_id,branch_id,return_no,date,total,cost_total,refund,account_id,items,note,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.t, sale.id, sale.branch_id, retNo, date, total, r2(cost), refund, intOrNull(b.account_id), JSON.stringify(done), s(b.note), req.u.id])).rows[0];
    await c.query('UPDATE sales SET returned=returned+$2 WHERE id=$1', [sale.id, total]);
    if (refund > 0) {
      const acc = await accountOk(c, req.t, b.account_id);
      await addTxn(c, { t: req.t, account_id: acc.id, branch_id: sale.branch_id, date, direction: 'out', amount: refund, type: 'refund', ref_type: 'sale_return', ref_id: rr.id, party: sale.customer_name, note: retNo + ' / ' + sale.invoice_no, user_id: req.u.id });
    }
    if (sale.customer_id) {
      await ledger(c, { t: req.t, party_type: 'customer', party_id: sale.customer_id, date, ref_type: 'return', ref_id: rr.id, ref_no: retNo, credit: total, note: 'Sales return / ফেরত (' + sale.invoice_no + ')', user_id: req.u.id });
      if (refund > 0) await ledger(c, { t: req.t, party_type: 'customer', party_id: sale.customer_id, date, ref_type: 'refund', ref_id: rr.id, ref_no: retNo, debit: refund, note: 'Cash refund / টাকা ফেরত', user_id: req.u.id });
    } else if (refund < total - 0.009) fail('Walk-in customer return must be fully refunded');
    return rr;
  });
  logAct(req.t, req.u, 'sale_return', r.return_no + ': ' + r.total);
  res.json({ ok: true, return: r });
}));
T.get('/returns', tenantAuth('sales'), wrap(async (req, res) => {
  const from = dOr(req.query.from, addDays(todayBD(), -30)), to = dOr(req.query.to, todayBD());
  res.json(await all(`SELECT r.*, s.invoice_no, s.customer_name, u.name user_name FROM sale_returns r JOIN sales s ON s.id=r.sale_id LEFT JOIN users u ON u.id=r.user_id
    WHERE r.tenant_id=$1 AND r.date BETWEEN $2 AND $3 ORDER BY r.id DESC`, [req.t, from, to]));
}));

// ---------- purchases ----------
T.post('/purchases', tenantAuth('purchase'), wrap(async (req, res) => {
  const b = req.body;
  const r = await tx(async c => {
    const br = await branchOf(req, b.branch_id);
    const sup = intOrNull(b.supplier_id) ? (await c.query('SELECT * FROM suppliers WHERE id=$1 AND tenant_id=$2', [b.supplier_id, req.t])).rows[0] : null;
    if (!Array.isArray(b.items) || !b.items.length) fail('Add at least one product');
    const date = dOr(b.date, todayBD());
    const lines = [];
    for (const it of b.items) {
      const p = (await c.query('SELECT * FROM products WHERE id=$1 AND tenant_id=$2', [it.product_id, req.t])).rows[0];
      if (!p) fail('Product not found');
      const u = (await c.query('SELECT * FROM product_units WHERE product_id=$1 AND name=$2', [p.id, s(it.unit)])).rows[0] || { name: p.base_unit, factor: 1 };
      const qty = r4(it.qty), rate = r4(it.rate);
      if (!(qty > 0)) fail(`Enter quantity for "${p.name}"`);
      lines.push({ p, unit: u.name, factor: n(u.factor), qty, rate, total: r2(qty * rate), base_qty: r4(qty * n(u.factor)), batch: s(it.batch), shade: s(it.shade) });
    }
    const subtotal = r2(lines.reduce((a, l) => a + l.total, 0));
    const discount = r2(b.discount), other = r2(b.other_cost);
    const total = r2(subtotal - discount + other);
    const paid = r2(b.paid);
    if (!sup && paid < total - 0.009) fail('Purchase on credit needs a supplier');
    if (paid > total + 0.009) fail('Paid amount is more than total');
    const pno = await nextNo(c, req.t, 'purchase', req.tenant.settings.purchase_prefix || 'PUR-');
    const pur = (await c.query(`INSERT INTO purchases(tenant_id,branch_id,purchase_no,supplier_id,supplier_invoice,date,subtotal,discount,other_cost,total,paid,due,note,user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [req.t, br, pno, sup ? sup.id : null, s(b.supplier_invoice), date, subtotal, discount, other, total, paid, r2(total - paid), s(b.note), req.u.id])).rows[0];
    const ratio = subtotal > 0 ? total / subtotal : 1; // spread discount & carrying cost into item cost
    for (const l of lines) {
      await c.query(`INSERT INTO purchase_items(tenant_id,purchase_id,product_id,name,batch,shade,unit,factor,qty,rate,total,base_qty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [req.t, pur.id, l.p.id, l.p.name + (l.p.size ? ` (${l.p.size})` : ''), l.batch, l.shade, l.unit, l.factor, l.qty, l.rate, l.total, l.base_qty]);
      const unitCost = l.base_qty > 0 ? r4((l.total * ratio) / l.base_qty) : 0;
      const cur = (await c.query('SELECT COALESCE(sum(qty),0) q FROM stock WHERE product_id=$1', [l.p.id])).rows[0];
      const oldQ = Math.max(0, n(cur.q));
      const avg = oldQ + l.base_qty > 0 ? r4((oldQ * n(l.p.purchase_price) + l.base_qty * unitCost) / (oldQ + l.base_qty)) : unitCost;
      await c.query('UPDATE products SET purchase_price=$2 WHERE id=$1', [l.p.id, avg]);
      if (b.update_prices && l.p.purchase_price !== avg) { /* selling prices unchanged by design */ }
      await moveStock(c, req.t, { product_id: l.p.id, branch_id: br, batch: l.batch, shade: l.shade, qty: l.base_qty, type: 'purchase', ref_type: 'purchase', ref_id: pur.id, cost: unitCost, note: pno, user_id: req.u.id, date });
    }
    if (paid > 0) {
      const acc = await accountOk(c, req.t, b.account_id);
      await addTxn(c, { t: req.t, account_id: acc.id, branch_id: br, date, direction: 'out', amount: paid, type: 'purchase', ref_type: 'purchase', ref_id: pur.id, party: sup ? sup.name : '', note: pno, user_id: req.u.id });
    }
    if (sup) {
      await ledger(c, { t: req.t, party_type: 'supplier', party_id: sup.id, date, ref_type: 'purchase', ref_id: pur.id, ref_no: pno, credit: total, note: 'Purchase / ক্রয়', user_id: req.u.id });
      if (paid > 0) await ledger(c, { t: req.t, party_type: 'supplier', party_id: sup.id, date, ref_type: 'purchase_payment', ref_id: pur.id, ref_no: pno, debit: paid, note: 'Paid / পরিশোধ', user_id: req.u.id });
    }
    return pur;
  });
  logAct(req.t, req.u, 'purchase', r.purchase_no + ': ' + r.total);
  res.json({ ok: true, id: r.id, purchase_no: r.purchase_no });
}));
T.get('/purchases', tenantAuth('purchase'), wrap(async (req, res) => {
  const params = [req.t]; const where = ['p.tenant_id=$1'];
  if (isDate(req.query.from)) { params.push(req.query.from); where.push(`p.date>=$${params.length}`); }
  if (isDate(req.query.to)) { params.push(req.query.to); where.push(`p.date<=$${params.length}`); }
  if (intOrNull(req.query.supplier_id)) { params.push(intOrNull(req.query.supplier_id)); where.push(`p.supplier_id=$${params.length}`); }
  if (s(req.query.q)) { params.push('%' + s(req.query.q) + '%'); where.push(`(p.purchase_no ILIKE $${params.length} OR sp.name ILIKE $${params.length} OR p.supplier_invoice ILIKE $${params.length})`); }
  const bf = branchFilter(req); if (bf) { params.push(bf); where.push(`p.branch_id=$${params.length}`); }
  res.json(await all(`SELECT p.*, sp.name supplier_name, u.name user_name FROM purchases p LEFT JOIN suppliers sp ON sp.id=p.supplier_id LEFT JOIN users u ON u.id=p.user_id
    WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 1000`, params));
}));
T.get('/purchases/:id', tenantAuth('purchase'), wrap(async (req, res) => {
  const p = await one(`SELECT p.*, sp.name supplier_name, sp.phone supplier_phone, sp.address supplier_address, u.name user_name FROM purchases p LEFT JOIN suppliers sp ON sp.id=p.supplier_id LEFT JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.tenant_id=$2`, [req.params.id, req.t]);
  if (!p) fail('Not found', 404);
  p.items = await all('SELECT * FROM purchase_items WHERE purchase_id=$1 ORDER BY id', [p.id]);
  res.json(p);
}));
T.delete('/purchases/:id', tenantAuth('sales_delete'), wrap(async (req, res) => {
  await tx(async c => {
    const p = (await c.query('SELECT * FROM purchases WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [req.params.id, req.t])).rows[0];
    if (!p) fail('Not found', 404);
    const items = (await c.query('SELECT * FROM purchase_items WHERE purchase_id=$1', [p.id])).rows;
    for (const it of items) if (it.product_id) await moveStock(c, req.t, { product_id: it.product_id, branch_id: p.branch_id, batch: it.batch, shade: it.shade, qty: -n(it.base_qty), type: 'adjust', note: 'Purchase deleted ' + p.purchase_no, user_id: req.u.id });
    await c.query(`DELETE FROM account_txns WHERE tenant_id=$1 AND ref_type='purchase' AND ref_id=$2`, [req.t, p.id]);
    await c.query(`DELETE FROM party_ledger WHERE tenant_id=$1 AND ref_type IN ('purchase','purchase_payment') AND ref_id=$2`, [req.t, p.id]);
    await c.query('DELETE FROM purchases WHERE id=$1', [p.id]);
    logAct(req.t, req.u, 'purchase_delete', p.purchase_no);
  });
  res.json({ ok: true });
}));

// ---------- quotations / project estimates ----------
T.get('/quotations', tenantAuth('quotation'), wrap(async (req, res) => {
  res.json(await all(`SELECT id,quote_no,date,valid_until,customer_name,customer_phone,project_name,total,status,sale_id FROM quotations WHERE tenant_id=$1 ORDER BY id DESC LIMIT 1000`, [req.t]));
}));
T.get('/quotations/:id', tenantAuth('quotation'), wrap(async (req, res) => {
  const x = await one('SELECT * FROM quotations WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  if (!x) fail('Not found', 404);
  res.json(x);
}));
async function saveQuote(req, id) {
  const b = req.body;
  return tx(async c => {
    const saleType = b.sale_type === 'wholesale' ? 'wholesale' : 'retail';
    const lines = await computeLines(c, req.t, b.items, saleType);
    const tt = totals(lines, b, req.tenant.settings);
    const items = lines.map((l, i) => ({ product_id: l.p.id, name: l.name, kind: l.p.kind, unit: l.unit, factor: l.factor, qty: l.qty, rate: l.rate, discount: l.discount, total: l.total, batch: l.batch, shade: l.shade, area: s((b.items[i] || {}).area), room: s((b.items[i] || {}).room) }));
    let cust = intOrNull(b.customer_id) ? (await c.query('SELECT * FROM customers WHERE id=$1 AND tenant_id=$2', [b.customer_id, req.t])).rows[0] : null;
    const vals = [cust ? cust.id : null, cust ? cust.name : s(b.customer_name), cust ? cust.phone : s(b.customer_phone), cust ? cust.address : s(b.customer_address), s(b.project_name), saleType,
      JSON.stringify(items), tt.subtotal, tt.discount, tt.vat, tt.delivery, tt.total, s(b.note), dOr(b.valid_until, addDays(todayBD(), 15))];
    if (id) {
      const r = (await c.query(`UPDATE quotations SET customer_id=$1,customer_name=$2,customer_phone=$3,customer_address=$4,project_name=$5,sale_type=$6,items=$7,subtotal=$8,discount=$9,vat=$10,delivery_charge=$11,total=$12,note=$13,valid_until=$14
        WHERE id=$15 AND tenant_id=$16 RETURNING id, quote_no`, vals.concat([id, req.t]))).rows[0];
      if (!r) fail('Not found', 404);
      return r;
    }
    const no = await nextNo(c, req.t, 'quote', req.tenant.settings.quote_prefix || 'QT-');
    return (await c.query(`INSERT INTO quotations(customer_id,customer_name,customer_phone,customer_address,project_name,sale_type,items,subtotal,discount,vat,delivery_charge,total,note,valid_until,tenant_id,branch_id,quote_no,user_id,date)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id, quote_no`, vals.concat([req.t, await branchOf(req), no, req.u.id, todayBD()]))).rows[0];
  });
}
T.post('/quotations', tenantAuth('quotation'), wrap(async (req, res) => res.json({ ok: true, ...(await saveQuote(req, null)) })));
T.put('/quotations/:id', tenantAuth('quotation'), wrap(async (req, res) => res.json({ ok: true, ...(await saveQuote(req, parseInt(req.params.id, 10))) })));
T.put('/quotations/:id/status', tenantAuth('quotation'), wrap(async (req, res) => {
  await q('UPDATE quotations SET status=$3 WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t, ['open', 'cancelled', 'converted'].includes(req.body.status) ? req.body.status : 'open']);
  res.json({ ok: true });
}));
T.delete('/quotations/:id', tenantAuth('quotation'), wrap(async (req, res) => { await q('DELETE FROM quotations WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]); res.json({ ok: true }); }));

// ---------- expenses ----------
T.get('/expenses', tenantAuth('expenses'), wrap(async (req, res) => {
  const from = dOr(req.query.from, addDays(todayBD(), -30)), to = dOr(req.query.to, todayBD());
  const params = [req.t, from, to]; let w = '';
  const bf = branchFilter(req); if (bf) { params.push(bf); w = 'AND e.branch_id=$4'; }
  res.json(await all(`SELECT e.*, ec.name category, a.name account, u.name user_name, em.name employee FROM expenses e LEFT JOIN expense_categories ec ON ec.id=e.category_id
    LEFT JOIN accounts a ON a.id=e.account_id LEFT JOIN users u ON u.id=e.user_id LEFT JOIN employees em ON em.id=e.employee_id
    WHERE e.tenant_id=$1 AND e.date BETWEEN $2 AND $3 ${w} ORDER BY e.date DESC, e.id DESC`, params));
}));
async function addExpense(req, b) {
  const amt = r2(b.amount); if (amt <= 0) fail('Enter amount');
  return tx(async c => {
    const acc = await accountOk(c, req.t, b.account_id);
    const br = await branchOf(req);
    const date = dOr(b.date, todayBD());
    const e = (await c.query(`INSERT INTO expenses(tenant_id,branch_id,date,category_id,employee_id,amount,account_id,note,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.t, br, date, intOrNull(b.category_id), intOrNull(b.employee_id), amt, acc.id, s(b.note), req.u.id])).rows[0];
    const cat = e.category_id ? (await c.query('SELECT name FROM expense_categories WHERE id=$1', [e.category_id])).rows[0] : null;
    await addTxn(c, { t: req.t, account_id: acc.id, branch_id: br, date, direction: 'out', amount: amt, type: b.employee_id ? 'salary' : 'expense', ref_type: 'expense', ref_id: e.id, party: cat ? cat.name : '', note: s(b.note), user_id: req.u.id });
    return e;
  });
}
T.post('/expenses', tenantAuth('expenses'), wrap(async (req, res) => res.json(await addExpense(req, req.body))));
T.delete('/expenses/:id', tenantAuth('expenses'), wrap(async (req, res) => {
  await tx(async c => {
    await c.query(`DELETE FROM account_txns WHERE tenant_id=$1 AND ref_type='expense' AND ref_id=$2`, [req.t, req.params.id]);
    await c.query('DELETE FROM expenses WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  });
  res.json({ ok: true });
}));
T.post('/employees/:id/salary', tenantAuth('employees'), wrap(async (req, res) => {
  const emp = await one('SELECT * FROM employees WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  if (!emp) fail('Not found', 404);
  let cat = await one(`SELECT id FROM expense_categories WHERE tenant_id=$1 AND (name ILIKE '%salary%' OR name ILIKE '%বেতন%') LIMIT 1`, [req.t]);
  if (!cat) cat = await one('INSERT INTO expense_categories(tenant_id,name) VALUES($1,$2) RETURNING id', [req.t, 'বেতন / Salary']);
  const e = await addExpense(req, { ...req.body, category_id: cat.id, employee_id: emp.id, note: `${emp.name} — ${s(req.body.note) || 'Salary'}` });
  res.json(e);
}));
T.get('/employees/:id/payments', tenantAuth('employees'), wrap(async (req, res) => {
  res.json(await all(`SELECT e.*, a.name account FROM expenses e LEFT JOIN accounts a ON a.id=e.account_id WHERE e.employee_id=$1 AND e.tenant_id=$2 ORDER BY e.date DESC`, [req.params.id, req.t]));
}));

// ---------- cashbook ----------
T.get('/cashbook', tenantAuth('cashbook'), wrap(async (req, res) => {
  const date = dOr(req.query.date, todayBD());
  const bf = branchFilter(req);
  const accs = await all('SELECT * FROM accounts WHERE tenant_id=$1 AND active ORDER BY id', [req.t]);
  const bcond = bf ? 'AND branch_id=' + parseInt(bf, 10) : '';
  const out = [];
  for (const a of accs) {
    const before = await one(`SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM account_txns WHERE account_id=$1 AND date<$2 ${bcond}`, [a.id, date]);
    const day = await one(`SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount END),0) inn, COALESCE(sum(CASE WHEN direction='out' THEN amount END),0) outt FROM account_txns WHERE account_id=$1 AND date=$2 ${bcond}`, [a.id, date]);
    const opening = r2((bf ? 0 : a.opening_balance) + before.v);
    out.push({ id: a.id, name: a.name, type: a.type, opening, in: day.inn, out: day.outt, closing: r2(opening + day.inn - day.outt) });
  }
  const params = [req.t, date]; if (bf) params.push(bf);
  const rows = await all(`SELECT x.*, a.name account, a.type account_type, u.name user_name FROM account_txns x JOIN accounts a ON a.id=x.account_id LEFT JOIN users u ON u.id=x.user_id
    WHERE x.tenant_id=$1 AND x.date=$2 ${bf ? 'AND x.branch_id=$3' : ''} ORDER BY x.id`, params);
  const byType = {};
  rows.forEach(r => { const k = r.type + ':' + r.direction; byType[k] = r2((byType[k] || 0) + r.amount); });
  const closings = await all(`SELECT cc.*, a.name account, u.name user_name FROM cash_closings cc LEFT JOIN accounts a ON a.id=cc.account_id LEFT JOIN users u ON u.id=cc.user_id WHERE cc.tenant_id=$1 AND cc.date=$2 ORDER BY cc.id`, [req.t, date]);
  res.json({ date, accounts: out, rows, byType, closings });
}));
T.post('/cashbook/close', tenantAuth('cashbook'), wrap(async (req, res) => {
  const b = req.body; const date = dOr(b.date, todayBD());
  const a = await one('SELECT * FROM accounts WHERE id=$1 AND tenant_id=$2', [b.account_id, req.t]);
  if (!a) fail('Select account');
  const bal = await one(`SELECT COALESCE(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0) v FROM account_txns WHERE account_id=$1 AND date<=$2`, [a.id, date]);
  const sys = r2(a.opening_balance + bal.v), counted = r2(b.counted), diff = r2(counted - sys);
  await tx(async c => {
    await c.query(`INSERT INTO cash_closings(tenant_id,branch_id,account_id,date,system_balance,counted,difference,note,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.t, await branchOf(req), a.id, date, sys, counted, diff, s(b.note), req.u.id]);
    if (b.adjust && diff !== 0) await addTxn(c, { t: req.t, account_id: a.id, branch_id: await branchOf(req), date, direction: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), type: 'adjust', note: diff > 0 ? 'Cash excess / ক্যাশ বেশি' : 'Cash shortage / ক্যাশ কম', user_id: req.u.id });
  });
  res.json({ ok: true, system_balance: sys, counted, difference: diff });
}));

// ---------- dashboard ----------
T.get('/dashboard', tenantAuth('dashboard'), wrap(async (req, res) => {
  const d = dOr(req.query.date, todayBD());
  const bf = branchFilter(req);
  const bc = alias => (bf ? `AND ${alias}branch_id=${parseInt(bf, 10)}` : '');
  const sales = await one(`SELECT COALESCE(sum(total),0) total, count(*)::int cnt, COALESCE(sum(due),0) credit, COALESCE(sum(subtotal-discount),0) net, COALESCE(sum(cost_total),0) cost, COALESCE(sum(vat),0) vat, COALESCE(sum(delivery_charge),0) delivery FROM sales WHERE tenant_id=$1 AND date=$2 ${bc('')}`, [req.t, d]);
  const rets = await one(`SELECT COALESCE(sum(total),0) total, COALESCE(sum(cost_total),0) cost FROM sale_returns WHERE tenant_id=$1 AND date=$2 ${bc('')}`, [req.t, d]);
  const pur = await one(`SELECT COALESCE(sum(total),0) total, count(*)::int cnt FROM purchases WHERE tenant_id=$1 AND date=$2 ${bc('')}`, [req.t, d]);
  const exp = await one(`SELECT COALESCE(sum(amount),0) total FROM expenses WHERE tenant_id=$1 AND date=$2 ${bc('')}`, [req.t, d]);
  const coll = await one(`SELECT COALESCE(sum(CASE WHEN type IN ('sale','collection') THEN amount END),0) total, COALESCE(sum(CASE WHEN type='collection' THEN amount END),0) due_coll FROM account_txns WHERE tenant_id=$1 AND date=$2 AND direction='in' ${bc('')}`, [req.t, d]);
  const custDue = await one(`SELECT COALESCE(sum(b),0) total, count(*) FILTER (WHERE b>0)::int cnt FROM (SELECT party_id, sum(debit-credit) b FROM party_ledger WHERE tenant_id=$1 AND party_type='customer' GROUP BY party_id) z WHERE b>0`, [req.t]);
  const supDue = await one(`SELECT COALESCE(sum(b),0) total FROM (SELECT party_id, sum(credit-debit) b FROM party_ledger WHERE tenant_id=$1 AND party_type='supplier' GROUP BY party_id) z WHERE b>0`, [req.t]);
  const accounts = await all(`SELECT a.id,a.name,a.type, ${ACC_BAL} balance FROM accounts a WHERE tenant_id=$1 AND active ORDER BY id`, [req.t]);
  const low = await one(`SELECT count(*)::int c FROM products p WHERE p.tenant_id=$1 AND p.active AND p.reorder_level>0 AND COALESCE((SELECT sum(qty) FROM stock WHERE product_id=p.id ${bf ? 'AND branch_id=' + parseInt(bf, 10) : ''}),0) <= p.reorder_level`, [req.t]);
  const trend = await all(`SELECT g::date::text date, COALESCE((SELECT sum(total) FROM sales WHERE tenant_id=$1 AND date=g::date ${bc('')}),0) sales,
      COALESCE((SELECT sum(amount) FROM expenses WHERE tenant_id=$1 AND date=g::date ${bc('')}),0) expenses
    FROM generate_series($2::date - 6, $2::date, '1 day') g`, [req.t, d]);
  const top = await all(`SELECT si.name, sum(si.qty) qty, si.unit, sum(si.total) total FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.tenant_id=$1 AND s.date=$2 ${bc('s.')} GROUP BY si.name, si.unit ORDER BY sum(si.total) DESC LIMIT 5`, [req.t, d]);
  const recent = await all(`SELECT id,invoice_no,customer_name,total,due,created_at FROM sales WHERE tenant_id=$1 ${bc('')} ORDER BY id DESC LIMIT 6`, [req.t]);
  const month = await one(`SELECT COALESCE(sum(total),0) sales, COALESCE(sum(subtotal-discount-cost_total),0) gp FROM sales WHERE tenant_id=$1 AND date_trunc('month',date)=date_trunc('month',$2::date) ${bc('')}`, [req.t, d]);
  const monthExp = await one(`SELECT COALESCE(sum(amount),0) v FROM expenses WHERE tenant_id=$1 AND date_trunc('month',date)=date_trunc('month',$2::date) ${bc('')}`, [req.t, d]);
  const monthRet = await one(`SELECT COALESCE(sum(total-cost_total),0) v FROM sale_returns WHERE tenant_id=$1 AND date_trunc('month',date)=date_trunc('month',$2::date) ${bc('')}`, [req.t, d]);
  month.gp = r2(month.gp - monthRet.v);
  const gross = r2(sales.net - sales.cost - (rets.total - rets.cost));
  res.json({
    date: d,
    sales: sales.total, invoices: sales.cnt, credit_sales: sales.credit, returns: rets.total,
    purchase: pur.total, expenses: exp.total, collection: coll.total, due_collection: coll.due_coll,
    customer_due: custDue.total, due_customers: custDue.cnt, supplier_due: supDue.total,
    gross_profit: gross, net_profit: r2(gross + sales.delivery - exp.total),
    month_sales: month.sales, month_profit: r2(month.gp - monthExp.v), low_stock: low.c,
    accounts, trend, top, recent,
  });
}));

// ---------- reports ----------
function range(req) { return [dOr(req.query.from, todayBD().slice(0, 8) + '01'), dOr(req.query.to, todayBD())]; }
T.get('/reports/profit', tenantAuth('profit'), wrap(async (req, res) => {
  const [from, to] = range(req); const bf = branchFilter(req);
  const bc = bf ? `AND branch_id=${parseInt(bf, 10)}` : '';
  const s1 = await one(`SELECT COALESCE(sum(subtotal),0) gross_sales, COALESCE(sum(discount),0) discount, COALESCE(sum(vat),0) vat, COALESCE(sum(delivery_charge),0) delivery, COALESCE(sum(cost_total),0) cost, COALESCE(sum(total),0) total, count(*)::int cnt FROM sales WHERE tenant_id=$1 AND date BETWEEN $2 AND $3 ${bc}`, [req.t, from, to]);
  const rt = await one(`SELECT COALESCE(sum(total),0) total, COALESCE(sum(cost_total),0) cost FROM sale_returns WHERE tenant_id=$1 AND date BETWEEN $2 AND $3 ${bc}`, [req.t, from, to]);
  const ex = await all(`SELECT COALESCE(ec.name,'Others') category, sum(e.amount) amount FROM expenses e LEFT JOIN expense_categories ec ON ec.id=e.category_id WHERE e.tenant_id=$1 AND e.date BETWEEN $2 AND $3 ${bf ? 'AND e.branch_id=' + parseInt(bf, 10) : ''} GROUP BY 1 ORDER BY 2 DESC`, [req.t, from, to]);
  const damage = await one(`SELECT COALESCE(sum(-qty*cost),0) v FROM stock_moves WHERE tenant_id=$1 AND type='damage' AND date BETWEEN $2 AND $3 ${bc}`, [req.t, from, to]);
  const netSales = r2(s1.gross_sales - s1.discount - rt.total);
  const cogs = r2(s1.cost - rt.cost);
  const gross = r2(netSales - cogs);
  const expTotal = r2(ex.reduce((a, x) => a + x.amount, 0));
  res.json({ from, to, invoices: s1.cnt, gross_sales: s1.gross_sales, discount: s1.discount, returns: rt.total, net_sales: netSales, cogs, gross_profit: gross,
    delivery_income: s1.delivery, vat_collected: s1.vat, expenses: ex, expense_total: expTotal, damage_loss: r2(damage.v), net_profit: r2(gross + s1.delivery - expTotal - damage.v) });
}));
T.get('/reports/sales', tenantAuth('reports'), wrap(async (req, res) => {
  const [from, to] = range(req); const by = s(req.query.by) || 'day'; const bf = branchFilter(req);
  const bc = bf ? `AND s.branch_id=${parseInt(bf, 10)}` : '';
  let sql;
  if (by === 'product') sql = `SELECT si.name label, si.unit, sum(si.qty) qty, sum(si.total) total, sum(si.total - si.cost*si.base_qty) profit FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.tenant_id=$1 AND s.date BETWEEN $2 AND $3 ${bc} GROUP BY si.name, si.unit ORDER BY total DESC`;
  else if (by === 'customer') sql = `SELECT s.customer_name label, s.customer_phone phone, count(*)::int cnt, sum(s.total) total, sum(s.due) due FROM sales s WHERE s.tenant_id=$1 AND s.date BETWEEN $2 AND $3 ${bc} GROUP BY 1,2 ORDER BY total DESC`;
  else if (by === 'user') sql = `SELECT COALESCE(u.name,'-') label, count(*)::int cnt, sum(s.total) total, sum(s.paid) paid, sum(s.due) due FROM sales s LEFT JOIN users u ON u.id=s.user_id WHERE s.tenant_id=$1 AND s.date BETWEEN $2 AND $3 ${bc} GROUP BY 1 ORDER BY total DESC`;
  else if (by === 'category') sql = `SELECT COALESCE(c.name,'-') label, sum(si.total) total, sum(si.total - si.cost*si.base_qty) profit FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE s.tenant_id=$1 AND s.date BETWEEN $2 AND $3 ${bc} GROUP BY 1 ORDER BY total DESC`;
  else sql = `SELECT s.date::text label, count(*)::int cnt, sum(s.total) total, sum(s.paid) paid, sum(s.due) due, sum(s.vat) vat, sum(s.subtotal-s.discount-s.cost_total) profit FROM sales s WHERE s.tenant_id=$1 AND s.date BETWEEN $2 AND $3 ${bc} GROUP BY s.date ORDER BY s.date`;
  res.json({ from, to, by, rows: await all(sql, [req.t, from, to]) });
}));
T.get('/reports/purchases', tenantAuth('reports'), wrap(async (req, res) => {
  const [from, to] = range(req);
  const by = s(req.query.by) || 'supplier';
  const sql = by === 'product'
    ? `SELECT pi.name label, pi.unit, sum(pi.qty) qty, sum(pi.total) total FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id WHERE p.tenant_id=$1 AND p.date BETWEEN $2 AND $3 GROUP BY 1,2 ORDER BY total DESC`
    : `SELECT COALESCE(sp.name,'-') label, count(*)::int cnt, sum(p.total) total, sum(p.paid) paid, sum(p.due) due FROM purchases p LEFT JOIN suppliers sp ON sp.id=p.supplier_id WHERE p.tenant_id=$1 AND p.date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY total DESC`;
  res.json({ from, to, by, rows: await all(sql, [req.t, from, to]) });
}));
T.get('/reports/vat', tenantAuth('reports'), wrap(async (req, res) => {
  const [from, to] = range(req);
  const rows = await all(`SELECT date::text, count(*)::int cnt, sum(subtotal-discount) taxable, sum(vat) vat, sum(total) total FROM sales WHERE tenant_id=$1 AND date BETWEEN $2 AND $3 GROUP BY date ORDER BY date`, [req.t, from, to]);
  const inv = await all(`SELECT invoice_no, date, customer_name, subtotal-discount taxable, vat, total FROM sales WHERE tenant_id=$1 AND date BETWEEN $2 AND $3 AND vat>0 ORDER BY id`, [req.t, from, to]);
  res.json({ from, to, rows, invoices: inv });
}));
T.get('/reports/collections', tenantAuth('reports'), wrap(async (req, res) => {
  const [from, to] = range(req);
  const rows = await all(`SELECT x.date::text, x.type, x.party, x.amount, x.note, a.name account, u.name user_name FROM account_txns x JOIN accounts a ON a.id=x.account_id LEFT JOIN users u ON u.id=x.user_id
    WHERE x.tenant_id=$1 AND x.direction='in' AND x.type IN ('sale','collection') AND x.date BETWEEN $2 AND $3 ORDER BY x.date, x.id`, [req.t, from, to]);
  const byAcc = await all(`SELECT a.name account, sum(x.amount) total FROM account_txns x JOIN accounts a ON a.id=x.account_id WHERE x.tenant_id=$1 AND x.direction='in' AND x.type IN ('sale','collection') AND x.date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 2 DESC`, [req.t, from, to]);
  res.json({ from, to, rows, byAcc });
}));
T.get('/reports/stock-value', tenantAuth('reports'), wrap(async (req, res) => {
  const bf = branchFilter(req);
  const rows = await all(`SELECT p.id, p.name, p.kind, p.size, p.base_unit, p.sqft_per_pcs, p.pcs_per_box, p.purchase_price, p.retail_price, c.name category,
      COALESCE((SELECT sum(qty) FROM stock WHERE product_id=p.id ${bf ? 'AND branch_id=' + parseInt(bf, 10) : ''}),0) qty
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.tenant_id=$1 AND p.active ORDER BY c.name NULLS LAST, p.name`, [req.t]);
  rows.forEach(r => { r.cost_value = r2(r.qty * r.purchase_price); r.sale_value = r2(r.qty * r.retail_price); });
  res.json(rows);
}));
T.get('/reports/expenses', tenantAuth('reports'), wrap(async (req, res) => {
  const [from, to] = range(req);
  res.json({ from, to, rows: await all(`SELECT COALESCE(ec.name,'Others') label, count(*)::int cnt, sum(e.amount) total FROM expenses e LEFT JOIN expense_categories ec ON ec.id=e.category_id WHERE e.tenant_id=$1 AND e.date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 3 DESC`, [req.t, from, to]) });
}));
T.get('/activity', tenantAuth('users'), wrap(async (req, res) => res.json(await all('SELECT * FROM activity_log WHERE tenant_id=$1 ORDER BY id DESC LIMIT 300', [req.t]))));

// ---------- users & roles ----------
T.get('/users', tenantAuth('users'), wrap(async (req, res) => {
  res.json(await all(`SELECT u.id,u.name,u.username,u.phone,u.role_id,u.branch_id,u.active,u.last_login,r.name role_name,r.is_owner,b.name branch FROM users u LEFT JOIN roles r ON r.id=u.role_id LEFT JOIN branches b ON b.id=u.branch_id WHERE u.tenant_id=$1 ORDER BY u.id`, [req.t]));
}));
T.post('/users', tenantAuth('users'), wrap(async (req, res) => {
  const b = req.body;
  if (!s(b.name) || !s(b.username) || s(b.password).length < 6) fail('Name, username and password (6+) are required');
  if (await one('SELECT id FROM users WHERE tenant_id=$1 AND username=$2', [req.t, s(b.username)])) fail('Username already exists');
  const role = await one('SELECT id,is_owner FROM roles WHERE id=$1 AND tenant_id=$2', [b.role_id, req.t]);
  if (!role) fail('Select a role');
  if (role.is_owner && !req.u.is_owner) fail('Only owner can create owner users');
  await q('INSERT INTO users(tenant_id,role_id,branch_id,name,username,phone,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [req.t, role.id, intOrNull(b.branch_id), s(b.name), s(b.username), s(b.phone), bcrypt.hashSync(s(b.password), 10)]);
  res.json({ ok: true });
}));
T.put('/users/:id', tenantAuth('users'), wrap(async (req, res) => {
  const b = req.body;
  const u = await one('SELECT u.*, r.is_owner FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.tenant_id=$2', [req.params.id, req.t]);
  if (!u) fail('Not found', 404);
  if (u.is_owner && !req.u.is_owner) fail('Only owner can edit owner users');
  if (u.id === req.u.id && b.active === false) fail('You cannot disable yourself');
  if (s(b.username) && s(b.username) !== u.username && await one('SELECT id FROM users WHERE tenant_id=$1 AND username=$2', [req.t, s(b.username)])) fail('Username already exists');
  const role = b.role_id ? await one('SELECT id,is_owner FROM roles WHERE id=$1 AND tenant_id=$2', [b.role_id, req.t]) : null;
  if (u.is_owner && role && !role.is_owner) {
    const owners = await one(`SELECT count(*)::int c FROM users u JOIN roles r ON r.id=u.role_id WHERE u.tenant_id=$1 AND r.is_owner AND u.active`, [req.t]);
    if (owners.c <= 1) fail('At least one active owner is required');
  }
  await q(`UPDATE users SET name=COALESCE($3,name), username=COALESCE($4,username), phone=COALESCE($5,phone), role_id=COALESCE($6,role_id), branch_id=$7, active=COALESCE($8,active) WHERE id=$1 AND tenant_id=$2`,
    [u.id, req.t, nullIfEmpty(b.name), nullIfEmpty(b.username), b.phone === undefined ? null : s(b.phone), role ? role.id : null, intOrNull(b.branch_id), b.active === undefined ? null : !!b.active]);
  if (s(b.password)) {
    if (s(b.password).length < 6) fail('Password 6+ characters');
    await q('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, bcrypt.hashSync(s(b.password), 10)]);
    await q(`DELETE FROM sessions WHERE kind='tenant' AND user_id=$1`, [u.id]);
  }
  if (b.active === false) await q(`DELETE FROM sessions WHERE kind='tenant' AND user_id=$1`, [u.id]);
  res.json({ ok: true });
}));
T.get('/roles', tenantAuth(), wrap(async (req, res) => res.json(await all('SELECT * FROM roles WHERE tenant_id=$1 ORDER BY id', [req.t]))));
T.post('/roles', tenantAuth('users'), wrap(async (req, res) => {
  if (!s(req.body.name)) fail('Role name required');
  const perms = (req.body.perms || []).filter(p => PERMS.includes(p));
  res.json(await one('INSERT INTO roles(tenant_id,name,perms) VALUES($1,$2,$3) RETURNING *', [req.t, s(req.body.name), JSON.stringify(perms)]));
}));
T.put('/roles/:id', tenantAuth('users'), wrap(async (req, res) => {
  const r = await one('SELECT * FROM roles WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  if (!r) fail('Not found', 404);
  const perms = r.is_owner ? PERMS : (req.body.perms || []).filter(p => PERMS.includes(p));
  await q('UPDATE roles SET name=$2, perms=$3 WHERE id=$1', [r.id, s(req.body.name) || r.name, JSON.stringify(perms)]);
  res.json({ ok: true });
}));
T.delete('/roles/:id', tenantAuth('users'), wrap(async (req, res) => {
  const r = await one('SELECT * FROM roles WHERE id=$1 AND tenant_id=$2', [req.params.id, req.t]);
  if (!r) fail('Not found', 404);
  if (r.is_owner) fail('Owner role cannot be deleted');
  const used = await one('SELECT count(*)::int c FROM users WHERE role_id=$1', [r.id]);
  if (used.c) fail('This role is assigned to users');
  await q('DELETE FROM roles WHERE id=$1', [r.id]);
  res.json({ ok: true });
}));

// ---------- shop settings ----------
T.get('/settings', tenantAuth(), wrap(async (req, res) => {
  const t = await one('SELECT id,name,slug,owner_name,phone,email,address,business_type,plan_expires,sms_balance FROM tenants WHERE id=$1', [req.t]);
  res.json({ ...t, settings: req.tenant.settings });
}));
T.put('/settings', tenantAuth('settings'), wrap(async (req, res) => {
  const b = req.body;
  if (b.name !== undefined && !s(b.name)) fail('Shop name required');
  const cur = await one('SELECT settings FROM tenants WHERE id=$1', [req.t]);
  const merged = Object.assign({}, cur.settings || {});
  Object.keys(b.settings || {}).forEach(k => { if (k in DEFAULT_TENANT_SETTINGS) merged[k] = b.settings[k]; });
  await q(`UPDATE tenants SET name=COALESCE($2,name), owner_name=COALESCE($3,owner_name), email=COALESCE($4,email), address=COALESCE($5,address), business_type=COALESCE($6,business_type), settings=$7 WHERE id=$1`,
    [req.t, nullIfEmpty(b.name), nullIfEmpty(b.owner_name), b.email === undefined ? null : s(b.email), b.address === undefined ? null : s(b.address), nullIfEmpty(b.business_type), JSON.stringify(merged)]);
  res.json({ ok: true });
}));

// ---------- billing ----------
T.get('/billing', tenantAuth(), wrap(async (req, res) => {
  const st = await getSettings();
  const reqs = await all('SELECT * FROM payment_requests WHERE tenant_id=$1 ORDER BY id DESC', [req.t]);
  res.json({ plan_expires: req.tenant.plan_expires, expired: req.tenant.expired, today: todayBD(), plans: st.plans, payment_methods: st.payment_methods,
    instructions_bn: st.payment_instructions_bn, instructions_en: st.payment_instructions_en, requests: reqs, support_phone: st.support_phone });
}));
T.post('/billing/request', tenantAuth(), wrap(async (req, res) => {
  if (!req.u.is_owner) fail('Only shop owner can renew the subscription');
  const st = await getSettings();
  const plan = (st.plans || []).find(p => parseInt(p.months, 10) === parseInt(req.body.months, 10));
  if (!plan) fail('Select a package');
  const trx = s(req.body.trx_id).toUpperCase();
  if (trx.length < 6) fail('Enter a valid Transaction ID');
  if (await one('SELECT id FROM payment_requests WHERE upper(trx_id)=$1', [trx])) fail('This Transaction ID was already submitted');
  await q('INSERT INTO payment_requests(tenant_id,months,amount,method,trx_id,sender) VALUES($1,$2,$3,$4,$5,$6)', [req.t, plan.months, plan.price, s(req.body.method), trx, s(req.body.sender)]);
  res.json({ ok: true });
}));

// ---------- SMS ----------
T.post('/sms/send', tenantAuth('sms'), wrap(async (req, res) => {
  const r = await sendSms(req.t, req.body.to, s(req.body.message));
  if (!r.ok) fail(r.error);
  res.json(r);
}));
T.post('/sms/due-reminders', tenantAuth('sms'), wrap(async (req, res) => {
  const ids = (req.body.customer_ids || []).map(x => parseInt(x, 10)).filter(Boolean);
  const tpl = s(req.body.template) || req.tenant.settings.sms_due_template;
  let sent = 0; const errors = [];
  for (const id of ids) {
    const c = await one(`SELECT c.*, ${CUST_BAL} balance FROM customers c WHERE id=$1 AND tenant_id=$2`, [id, req.t]);
    if (!c || c.balance <= 0 || !c.phone) continue;
    const msg = tpl.replace(/\{name\}/g, c.name).replace(/\{shop\}/g, req.tenant.name).replace(/\{due\}/g, r2(c.balance)).replace(/\{phone\}/g, req.tenant.phone || '');
    const r = await sendSms(req.t, c.phone, msg);
    if (r.ok) sent++; else { errors.push(`${c.name}: ${r.error}`); if (/balance|enabled/.test(r.error)) break; }
  }
  res.json({ ok: true, sent, errors });
}));
T.get('/sms/logs', tenantAuth('sms'), wrap(async (req, res) => res.json(await all('SELECT * FROM sms_logs WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [req.t]))));

// ---------- backup export ----------
const TENANT_TABLES = ['branches', 'roles', 'accounts', 'categories', 'brands', 'expense_categories', 'products', 'product_units', 'stock', 'stock_moves', 'customers', 'suppliers',
  'party_ledger', 'account_txns', 'sales', 'sale_items', 'sale_returns', 'purchases', 'purchase_items', 'quotations', 'expenses', 'employees', 'cash_closings', 'counters'];
async function exportTenant(tid) {
  const out = { exported_at: new Date().toISOString(), tenant: await one('SELECT * FROM tenants WHERE id=$1', [tid]) };
  out.users = await all('SELECT id,name,username,phone,role_id,branch_id,active FROM users WHERE tenant_id=$1', [tid]);
  for (const tb of TENANT_TABLES) out[tb] = await all(`SELECT * FROM ${tb} WHERE tenant_id=$1`, [tid]);
  return out;
}
T.get('/backup/export', tenantAuth('settings'), wrap(async (req, res) => {
  const data = await exportTenant(req.t);
  res.setHeader('Content-Disposition', `attachment; filename="${req.tenant.slug}-backup-${todayBD()}.json"`);
  res.json(data);
}));

// ---------- automatic daily backups ----------
async function runBackup() {
  fs.mkdirSync(CFG.BACKUP_DIR, { recursive: true });
  const tenants = await all('SELECT id FROM tenants ORDER BY id');
  const data = { created_at: new Date().toISOString(), platform_settings: await all('SELECT * FROM platform_settings'), tenants: [] };
  for (const t of tenants) data.tenants.push(await exportTenant(t.id));
  const file = `backup-${todayBD()}.json`;
  fs.writeFileSync(path.join(CFG.BACKUP_DIR, file), JSON.stringify(data));
  const keep = CFG.BACKUP_KEEP_DAYS || 14;
  fs.readdirSync(CFG.BACKUP_DIR).filter(f => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(keep).forEach(f => fs.unlinkSync(path.join(CFG.BACKUP_DIR, f)));
  return file;
}
let lastBackupDay = null;
setInterval(async () => {
  try {
    const hourBD = new Date(Date.now() + 6 * 3600e3).getUTCHours();
    if (hourBD === 3 && lastBackupDay !== todayBD()) { lastBackupDay = todayBD(); await runBackup(); console.log('Daily backup done'); }
    await q('DELETE FROM sessions WHERE expires_at < now()');
  } catch (e) { console.error('Scheduler error', e.message); }
}, 10 * 60 * 1000);

// ============================================================
//  STATIC + ERRORS
// ============================================================
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/c/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'catalog.html')));
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File too large' });
  console.error(err);
  res.status(500).json({ error: 'Server error: ' + err.message });
});

(async () => {
  for (let i = 1; i <= 10; i++) {
    try { await migrate(); break; }
    catch (e) { console.error(`DB not ready (try ${i}/10):`, e.message); if (i === 10) process.exit(1); await new Promise(r => setTimeout(r, 3000)); }
  }
  app.listen(CFG.PORT, () => console.log(`Baybex Tile ERP running on port ${CFG.PORT}`));
})();

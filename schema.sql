-- Baybex Tile, Sanitary & Hardware — PostgreSQL schema
-- Runs automatically on every boot (idempotent). No manual migration needed.

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB
);

CREATE TABLE IF NOT EXISTS super_admins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Super Admin',
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  business_type TEXT DEFAULT 'tile',
  status TEXT DEFAULT 'active',          -- active | suspended
  plan_expires DATE,
  sms_balance INT DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  months INT NOT NULL DEFAULT 1,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  method TEXT,
  trx_id TEXT,
  sender TEXT,
  status TEXT DEFAULT 'pending',          -- pending | approved | rejected
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                     -- tenant | admin
  user_id INT NOT NULL,
  tenant_id INT,
  impersonated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT, body TEXT, active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- tenant data ----------
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, address TEXT, phone TEXT,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  perms JSONB DEFAULT '[]'::jsonb,
  is_owner BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE SET NULL,
  branch_id INT REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, username)
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'cash',               -- cash | bkash | nagad | rocket | bank | other
  number TEXT,
  opening_balance NUMERIC(14,2) DEFAULT 0,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, active BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, active BOOLEAN DEFAULT true
);
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT DEFAULT 'general',            -- tile | sanitary | hardware | general
  name TEXT NOT NULL,
  name_bn TEXT,
  sku TEXT,
  barcode TEXT,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  brand_id INT REFERENCES brands(id) ON DELETE SET NULL,
  size TEXT,
  base_unit TEXT NOT NULL DEFAULT 'pcs',  -- stock & prices are kept in this unit (tile = sqft)
  sqft_per_pcs NUMERIC(12,4),
  pcs_per_box NUMERIC(12,4),
  purchase_price NUMERIC(14,4) DEFAULT 0, -- average cost per base unit
  retail_price NUMERIC(14,4) DEFAULT 0,   -- per base unit
  wholesale_price NUMERIC(14,4) DEFAULT 0,
  vat_percent NUMERIC(6,2) DEFAULT 0,
  reorder_level NUMERIC(14,3) DEFAULT 0,
  sale_unit TEXT,
  purchase_unit TEXT,
  description TEXT,
  image TEXT,
  show_in_catalog BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_units (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  factor NUMERIC(14,6) NOT NULL DEFAULT 1, -- 1 of this unit = factor base units
  retail_price NUMERIC(14,4),               -- optional override per this unit
  wholesale_price NUMERIC(14,4)
);

CREATE TABLE IF NOT EXISTS stock (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  batch TEXT NOT NULL DEFAULT '',
  shade TEXT NOT NULL DEFAULT '',
  qty NUMERIC(16,4) NOT NULL DEFAULT 0,
  UNIQUE (product_id, branch_id, batch, shade)
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INT,
  batch TEXT DEFAULT '', shade TEXT DEFAULT '',
  qty NUMERIC(16,4) NOT NULL,             -- + in / - out (base unit)
  type TEXT NOT NULL,                     -- opening|purchase|sale|sale_return|adjust|damage|transfer_in|transfer_out
  ref_type TEXT, ref_id INT,
  cost NUMERIC(14,4) DEFAULT 0,
  note TEXT,
  user_id INT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, phone TEXT, address TEXT,
  type TEXT DEFAULT 'retail',             -- retail | wholesale | contractor
  credit_limit NUMERIC(14,2) DEFAULT 0,
  due_days INT DEFAULT 30,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL, company TEXT, phone TEXT, address TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- customer: debit = customer owes more, credit = customer paid
-- supplier: credit = we owe more,       debit = we paid
CREATE TABLE IF NOT EXISTS party_ledger (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL,               -- customer | supplier
  party_id INT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ref_type TEXT, ref_id INT, ref_no TEXT,
  debit NUMERIC(14,2) DEFAULT 0,
  credit NUMERIC(14,2) DEFAULT 0,
  note TEXT,
  user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_txns (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  branch_id INT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT NOT NULL,                -- in | out
  amount NUMERIC(14,2) NOT NULL,
  type TEXT NOT NULL,                     -- sale|collection|purchase|supplier_payment|expense|refund|transfer|deposit|withdraw|salary|adjust
  ref_type TEXT, ref_id INT,
  party TEXT,
  note TEXT,
  user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INT,
  invoice_no TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT, customer_phone TEXT, customer_address TEXT,
  sale_type TEXT DEFAULT 'retail',        -- retail | wholesale
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  vat NUMERIC(14,2) DEFAULT 0,
  delivery_charge NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  paid NUMERIC(14,2) DEFAULT 0,
  due NUMERIC(14,2) DEFAULT 0,
  returned NUMERIC(14,2) DEFAULT 0,
  cost_total NUMERIC(14,2) DEFAULT 0,
  previous_due NUMERIC(14,2) DEFAULT 0,
  note TEXT,
  delivery_status TEXT DEFAULT 'none',    -- none | pending | dispatched | delivered
  delivery_address TEXT, delivery_person TEXT, delivery_phone TEXT, delivery_date DATE,
  user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  name TEXT,
  batch TEXT DEFAULT '', shade TEXT DEFAULT '',
  unit TEXT, factor NUMERIC(14,6) DEFAULT 1,
  qty NUMERIC(14,4), rate NUMERIC(14,4),
  discount NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2),
  base_qty NUMERIC(16,4),
  returned_base_qty NUMERIC(16,4) DEFAULT 0,
  cost NUMERIC(14,4) DEFAULT 0            -- cost per base unit at time of sale
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
  branch_id INT,
  return_no TEXT,
  date DATE DEFAULT CURRENT_DATE,
  total NUMERIC(14,2) DEFAULT 0,
  cost_total NUMERIC(14,2) DEFAULT 0,
  refund NUMERIC(14,2) DEFAULT 0,
  account_id INT,
  items JSONB,
  note TEXT,
  user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INT,
  purchase_no TEXT,
  supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_invoice TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  other_cost NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  paid NUMERIC(14,2) DEFAULT 0,
  due NUMERIC(14,2) DEFAULT 0,
  note TEXT,
  user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  purchase_id INT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  name TEXT,
  batch TEXT DEFAULT '', shade TEXT DEFAULT '',
  unit TEXT, factor NUMERIC(14,6) DEFAULT 1,
  qty NUMERIC(14,4), rate NUMERIC(14,4),
  total NUMERIC(14,2),
  base_qty NUMERIC(16,4)
);

CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INT,
  quote_no TEXT,
  date DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT, customer_phone TEXT, customer_address TEXT,
  project_name TEXT,
  sale_type TEXT DEFAULT 'retail',
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(14,2) DEFAULT 0,
  discount NUMERIC(14,2) DEFAULT 0,
  vat NUMERIC(14,2) DEFAULT 0,
  delivery_charge NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  note TEXT,
  status TEXT DEFAULT 'open',             -- open | converted | cancelled
  sale_id INT,
  user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id INT REFERENCES expense_categories(id) ON DELETE SET NULL,
  employee_id INT,
  amount NUMERIC(14,2) NOT NULL,
  account_id INT REFERENCES accounts(id) ON DELETE SET NULL,
  note TEXT,
  user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INT,
  name TEXT NOT NULL, phone TEXT, designation TEXT, address TEXT, nid TEXT,
  salary NUMERIC(14,2) DEFAULT 0,
  join_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_closings (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INT,
  account_id INT,
  date DATE NOT NULL,
  system_balance NUMERIC(14,2), counted NUMERIC(14,2), difference NUMERIC(14,2),
  note TEXT, user_id INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS counters (
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  to_number TEXT, message TEXT, status TEXT, response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INT, user_name TEXT,
  action TEXT, detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_products_t ON products(tenant_id);
CREATE INDEX IF NOT EXISTS ix_stock_t ON stock(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS ix_moves_t ON stock_moves(tenant_id, product_id, date);
CREATE INDEX IF NOT EXISTS ix_ledger_p ON party_ledger(tenant_id, party_type, party_id);
CREATE INDEX IF NOT EXISTS ix_txn_t ON account_txns(tenant_id, date);
CREATE INDEX IF NOT EXISTS ix_sales_t ON sales(tenant_id, date);
CREATE INDEX IF NOT EXISTS ix_purch_t ON purchases(tenant_id, date);
CREATE INDEX IF NOT EXISTS ix_exp_t ON expenses(tenant_id, date);
CREATE INDEX IF NOT EXISTS ix_sess_exp ON sessions(expires_at);

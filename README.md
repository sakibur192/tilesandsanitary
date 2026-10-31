# Baybex Tile, Sanitary & Hardware Management System (SaaS)

Multi-tenant SaaS for Bangladeshi tile showrooms, sanitary shops, hardware shops and construction-material wholesalers.
**Node.js + Express + PostgreSQL (raw SQL). No `.env`, no `yml`.** One package, all features.

---

## 1. Deploy on Coolify (5 minutes)

1. **Create the database** — in your Coolify project: *+ New → Database → PostgreSQL*. Start it and copy its **Postgres URL (internal)**.
2. **Edit `config.js`** (the only config file):
   ```js
   DATABASE_URL: 'postgres://postgres:xxxx@<internal-host>:5432/postgres',
   SUPERADMIN_USERNAME: 'superadmin',
   SUPERADMIN_PASSWORD: 'choose-a-strong-one',
   ```
3. **Push to GitHub** (e.g. `sakibur192/baybex-tile`) and in Coolify add *+ New → Application → your repo*.
   - Build pack: **Nixpacks** (auto-detects Node, runs `npm start`). A `Dockerfile` is also included if you prefer the Dockerfile build pack.
   - Ports Exposes: **3000**
   - Add your domain (e.g. `tile.baybex.com`) — Coolify issues HTTPS automatically.
4. **Persistent storage (recommended):** *Storages → Add volume* → destination `/app/backups` (keeps the daily JSON backups across redeploys).
5. **Database backups (recommended):** on the PostgreSQL resource → *Backups* → enable a daily schedule (S3 optional).
6. Deploy. Tables are created automatically on first start.

| URL | Who |
|---|---|
| `https://your-domain/` | Landing page, shop signup & login |
| `https://your-domain/app` | Shop panel (owner + staff) |
| `https://your-domain/admin` | **Super Admin** (you) |
| `https://your-domain/c/<shop-id>` | Each shop's public online catalog |

First login to `/admin` with the username/password from `config.js`, then change the password under **Admins**.

---

## 2. Super Admin (everything editable)

- **Platform Settings** — software name, tagline, support phone/WhatsApp/email, brand color, trial days, free SMS on signup, signup on/off, announcement banner shown inside every shop.
- **Pricing & Payment** — package durations and prices (e.g. 1 / 6 / 12 months), bKash/Nagad/Rocket numbers and instructions.
- **Landing Page** — Bangla & English headline, sub text, feature cards.
- **Shops** — search, edit, change Shop ID, extend (+30d / +6m / +1y), suspend, add SMS credits, reset owner password, **Login as shop**, export shop data, delete shop, create shop manually.
- **Payment Requests** — shops submit bKash/Nagad TrxID → you verify → **Approve** extends the subscription automatically.
- **SMS Gateway** — any Bangladeshi HTTP SMS API (BulkSMSBD, SSL Wireless, Alpha SMS…) using `{to}` and `{message}` placeholders, with a test button and logs.
- **Backups** — daily automatic JSON backup at 3 AM BD time (14 days kept), run now, download.

Subscription rules: when a shop's plan expires it becomes **read-only** (can view data and renew, cannot add entries). Suspended shops cannot log in.

---

## 3. Shop features

**Bangladesh-first:** Bangla + English (switch any time), BDT ৳, Bangla digits ১,০০,০০০ (lakh grouping), DD-MM-YYYY, Cash / bKash / Nagad / Bank, BD mobile validation, Bangla/English invoices, SMS + WhatsApp.

| Module | What it does |
|---|---|
| **POS & Billing** | Product grid + barcode scan, retail/wholesale price switch, box/pcs/sqft/kg/bag units, batch & shade pick, discount (৳/%), VAT %, delivery charge, split payment (cash + bKash…), previous due shown, credit-limit warning, A4 / 80mm POS print, delivery challan, WhatsApp share |
| **বাকির হিসাব (Customer Due)** | Customer ledger, previous/opening due, partial payment, advance, due discount/waive, money receipt, statement print, overdue list, credit limit, SMS & WhatsApp reminders, daily collection report |
| **বাকি ও পাওনা (Supplier Due)** | Purchase on credit, partial payment, supplier ledger & voucher |
| **Tile features** | Sqft/pcs/box auto conversion, size→sqft calculator, stock shown as "boxes + pcs (sqft)", 5%/10% wastage, room-wise floor & wall estimate → quotation or sale, shade & batch stock, broken tile records |
| **Hardware units** | Base unit + any conversions (dozen, packet, carton, bag, ton, meter…), separate prices per unit, purchase unit vs selling unit |
| **Inventory** | Branch-wise stock, adjustments, damage/broken, branch transfer, low-stock alert, stock history, CSV/Excel import, barcode labels |
| **Purchases** | Multi-item, batch/shade, discount + transport/labour cost spread into product cost (weighted average costing) |
| **Sales Return** | Partial returns, restock or mark broken, refund or adjust due |
| **Quotation / Project Estimate** | Save, print, edit, convert to sale |
| **Delivery** | Pending / dispatched / delivered, delivery person, challan |
| **দৈনিক ক্যাশ হিসাব (Cashbook)** | Opening, all money in/out by type, per account (cash/bKash/Nagad/bank), closing, day-close cash count with shortage/excess |
| **Accounts** | Balances, transfers, owner deposit/withdrawal, statements |
| **লাভ-ক্ষতি (Profit & Loss)** | Today's sales, purchase, expenses, collection, credit sales, total customer/supplier due, gross & net profit; full P&L with COGS, returns, damage loss |
| **Reports** | Sales (day/product/category/customer/salesman), purchases, VAT, collections, expenses, stock value, due lists — print & CSV |
| **Employees** | Staff list, salary & advance payments |
| **Multi-level login** | Owner, Manager, Salesman, Accountant, Store Keeper (+ custom roles) with 24 permission switches, branch-bound users, activity log |
| **Multi-branch** | Separate stock per showroom/godown |
| **Online Catalog** | Public product page with WhatsApp order button |
| **Backup** | Download full JSON + Excel exports |

Staff login: mobile/username + password (+ Shop ID if the username exists in more than one shop).

---

## 4. Files

```
config.js        ← the only settings file (DB URL, port, first super admin)
server.js        ← whole backend (auth, SaaS, all APIs, backups)
schema.sql       ← database schema (auto-applied on every start)
public/          ← landing, shop app, super admin, catalog (plain HTML/CSS/JS)
Dockerfile       ← optional, for Coolify "Dockerfile" build pack
```

Run locally: `npm install && npm start` → http://localhost:3000

---
© Baybex — baybex.com — 01750006696

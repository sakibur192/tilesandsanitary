// ============================================================
//  Baybex Tile, Sanitary & Hardware — configuration
//  No .env / no yml: edit these values directly before deploy.
//  Everything else (price, trial, bKash number, SMS gateway,
//  landing page text...) is editable from the Super Admin panel.
// ============================================================
module.exports = {
  // Port the app listens on (Coolify: set "Ports Exposes" = 3000)
  PORT: 3000,

  // PostgreSQL connection string.
  // Coolify: create a PostgreSQL resource, copy its "Postgres URL (internal)" here.
  DATABASE_URL: 'postgres://postgres:6qbFiZriLOuPHRwxSo4KES8Ucl2yI0jtB8THwav6Mfd8k75yRy62zQnSoPftXLiw@201.18.212.48:5445/postgres',

  // Set true if your Postgres requires SSL (managed cloud DBs). Coolify internal = false.
  DB_SSL: false,

  // First super admin account (created only if no super admin exists).
  // Change the password from the Super Admin panel after first login.
  SUPERADMIN_USERNAME: 'superadmin',
  SUPERADMIN_PASSWORD: 'Baybex@2026',

  // Login session lifetime in days
  SESSION_DAYS: 30,

  // Folder (inside the container) where automatic daily JSON backups are written.
  // Mount this as a persistent volume in Coolify (e.g. /app/backups) to keep them.
  BACKUP_DIR: __dirname + '/backups',
  BACKUP_KEEP_DAYS: 14,
};

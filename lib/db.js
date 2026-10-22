import pg from "pg";

const { Pool } = pg;

let pool = null;
let schemaReady = null;

function isConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!isConfigured()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) {
    const error = new Error("Accounts are not configured. Add DATABASE_URL to the server environment.");
    error.status = 503;
    throw error;
  }
  return activePool.query(text, params);
}

async function runSchema() {
  await query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      document_type TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'original',
      output_language TEXT,
      transcript TEXT,
      content TEXT NOT NULL,
      model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS documents_user_id_created_at_idx ON documents (user_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)');
}

async function ensureSchema() {
  if (!isConfigured()) return;
  if (!schemaReady) schemaReady = runSchema();
  return schemaReady;
}

export { ensureSchema, isConfigured, query };

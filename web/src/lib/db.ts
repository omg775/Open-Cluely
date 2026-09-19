import "server-only";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

declare global {
  // Reused across hot reloads and serverless invocations in the same instance.
  var __opencluelyPool: Pool | undefined;
  var __opencluelySchema: Promise<void> | undefined;
}

function createPool(): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  return new Pool({
    connectionString,
    max: 3,
    // Managed providers (Neon, Supabase, RDS) present publicly trusted
    // certificates, so remote connections verify them.
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
  });
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  anthropic_key_encrypted TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistant_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  utterance_count INTEGER NOT NULL DEFAULT 0,
  answer_count INTEGER NOT NULL DEFAULT 0,
  model TEXT
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS launch_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS assistant_sessions_user_started_idx
  ON assistant_sessions (user_id, started_at DESC);
`;

export function getPool(): Pool {
  if (!globalThis.__opencluelyPool) {
    globalThis.__opencluelyPool = createPool();
  }
  return globalThis.__opencluelyPool;
}

export function ensureSchema(): Promise<void> {
  if (!globalThis.__opencluelySchema) {
    globalThis.__opencluelySchema = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error: unknown) => {
        globalThis.__opencluelySchema = undefined;
        throw error;
      });
  }
  return globalThis.__opencluelySchema;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

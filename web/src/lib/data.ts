import "server-only";
import { query, queryOne } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";

export const MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 — fastest, default" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5 — deeper reasoning, slower" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
};

export type SettingsRow = {
  model: string;
};

export type DocumentRow = {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: Date;
};

export type AssistantSessionRow = {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number;
  utterance_count: number;
  answer_count: number;
  model: string | null;
};

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    "SELECT id::text, email, password_hash FROM users WHERE email = $1",
    [email.toLowerCase()]
  );
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
  const user = await queryOne<UserRow>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     RETURNING id::text, email, password_hash`,
    [email.toLowerCase(), passwordHash]
  );
  if (!user) {
    throw new Error("Failed to create user");
  }
  await query("INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.id]);
  return user;
}

export async function getSettings(userId: string): Promise<{ model: string }> {
  const row = await queryOne<SettingsRow>("SELECT model FROM user_settings WHERE user_id = $1", [
    userId,
  ]);

  if (!row) {
    await query("INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
    return { model: "claude-sonnet-4-5" };
  }

  return { model: row.model };
}

export async function saveModel(userId: string, model: string): Promise<void> {
  await query(
    `INSERT INTO user_settings (user_id, model, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET model = EXCLUDED.model, updated_at = now()`,
    [userId, model]
  );
}


export async function listDocuments(userId: string): Promise<DocumentRow[]> {
  return query<DocumentRow>(
    `SELECT id::text, filename, size_bytes, created_at FROM documents
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
}

export async function addDocument(
  userId: string,
  filename: string,
  content: string
): Promise<void> {
  await query(
    "INSERT INTO documents (user_id, filename, size_bytes, content) VALUES ($1, $2, $3, $4)",
    [userId, filename, Buffer.byteLength(content, "utf8"), content]
  );
}

export async function deleteDocument(userId: string, documentId: string): Promise<void> {
  await query("DELETE FROM documents WHERE user_id = $1 AND id = $2", [userId, documentId]);
}

export async function getDocumentContents(userId: string): Promise<{ filename: string; content: string }[]> {
  return query<{ filename: string; content: string }>(
    "SELECT filename, content FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    [userId]
  );
}

export async function listSessions(userId: string, limit = 25): Promise<AssistantSessionRow[]> {
  return query<AssistantSessionRow>(
    `SELECT id::text, started_at, ended_at, duration_seconds, utterance_count, answer_count, model
     FROM assistant_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export async function sessionTotals(userId: string): Promise<{
  sessions: number;
  minutes: number;
  answers: number;
}> {
  const row = await queryOne<{ sessions: string; seconds: string; answers: string }>(
    `SELECT count(*)::text AS sessions,
            coalesce(sum(duration_seconds), 0)::text AS seconds,
            coalesce(sum(answer_count), 0)::text AS answers
     FROM assistant_sessions WHERE user_id = $1`,
    [userId]
  );

  return {
    sessions: Number(row?.sessions ?? 0),
    minutes: Math.round(Number(row?.seconds ?? 0) / 60),
    answers: Number(row?.answers ?? 0),
  };
}

export async function startAssistantSession(userId: string, model: string | null): Promise<string> {
  const row = await queryOne<{ id: string }>(
    "INSERT INTO assistant_sessions (user_id, model) VALUES ($1, $2) RETURNING id::text",
    [userId, model]
  );
  if (!row) {
    throw new Error("Failed to create assistant session");
  }
  return row.id;
}

export async function updateAssistantSession(
  userId: string,
  sessionId: string,
  update: { durationSeconds: number; utteranceCount: number; answerCount: number; ended: boolean }
): Promise<void> {
  await query(
    `UPDATE assistant_sessions
     SET duration_seconds = $3, utterance_count = $4, answer_count = $5,
         ended_at = CASE WHEN $6 THEN now() ELSE ended_at END
     WHERE user_id = $1 AND id = $2`,
    [
      userId,
      sessionId,
      update.durationSeconds,
      update.utteranceCount,
      update.answerCount,
      update.ended,
    ]
  );
}

export async function countRequestsToday(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT count(*)::text AS count FROM assistant_requests WHERE user_id = $1 AND created_at > now() - interval '1 day'",
    [userId]
  );
  return Number(row?.count ?? 0);
}

export async function recordRequest(userId: string): Promise<void> {
  await query("INSERT INTO assistant_requests (user_id) VALUES ($1)", [userId]);
}

export async function createLaunchToken(userId: string, ttlSeconds = 120): Promise<string> {
  const token = generateToken(24);
  await query(
    "INSERT INTO launch_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' seconds')::interval)",
    [hashToken(token), userId, String(ttlSeconds)]
  );
  return token;
}

export async function consumeLaunchToken(token: string): Promise<{ userId: string; email: string } | null> {
  const row = await queryOne<{ user_id: string; email: string }>(
    `UPDATE launch_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id::text, (SELECT email FROM users WHERE users.id = launch_tokens.user_id) AS email`,
    [hashToken(token)]
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}

export async function createDeviceToken(userId: string, label: string): Promise<string> {
  const token = generateToken(32);
  await query("INSERT INTO device_tokens (user_id, token_hash, label) VALUES ($1, $2, $3)", [
    userId,
    hashToken(token),
    label,
  ]);
  return token;
}

export async function resolveDeviceToken(token: string): Promise<{ userId: string; email: string } | null> {
  const row = await queryOne<{ user_id: string; email: string }>(
    `UPDATE device_tokens SET last_used_at = now()
     WHERE token_hash = $1
     RETURNING user_id::text, (SELECT email FROM users WHERE users.id = device_tokens.user_id) AS email`,
    [hashToken(token)]
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}

export async function listDeviceTokens(userId: string): Promise<{ id: string; label: string | null; created_at: Date; last_used_at: Date | null }[]> {
  return query<{ id: string; label: string | null; created_at: Date; last_used_at: Date | null }>(
    "SELECT id::text, label, created_at, last_used_at FROM device_tokens WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
}

export async function revokeDeviceToken(userId: string, id: string): Promise<void> {
  await query("DELETE FROM device_tokens WHERE user_id = $1 AND id = $2", [userId, id]);
}

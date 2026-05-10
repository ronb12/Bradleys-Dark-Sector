import { neon } from "@neondatabase/serverless";

let sqlClient;
let schemaReady;

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export async function ensureSchema(sql) {
  if (!sql) return;
  schemaReady ||= (async () => {
    try {
      await sql`
        create table if not exists dark_sector_scores (
          id bigserial primary key,
          player_name text not null,
          score integer not null,
          wave integer not null default 1,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create index if not exists dark_sector_scores_score_idx
        on dark_sector_scores (score desc, created_at asc)
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|duplicate key value/i.test(message)) throw error;
    }
  })();
  await schemaReady;
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

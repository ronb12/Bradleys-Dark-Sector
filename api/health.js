import { ensureSchema, getSql, sendJson } from "./_lib/db.js";

export default async function handler(_req, res) {
  try {
    const sql = getSql();
    if (!sql) {
      sendJson(res, 503, { ok: false, neon: false, error: "DATABASE_URL is not configured." });
      return;
    }
    await ensureSchema(sql);
    const rows = await sql`select count(*)::int as count from dark_sector_scores`;
    sendJson(res, 200, {
      ok: true,
      vercel: true,
      neon: true,
      leaderboardEntries: rows[0]?.count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      neon: true,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}


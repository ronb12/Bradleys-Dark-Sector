import { ensureSchema, getSql, sendJson } from "./_lib/db.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function topScores(sql) {
  const rows = await sql`
    select player_name, score, wave, created_at
    from dark_sector_scores
    order by score desc, created_at asc
    limit 10
  `;
  return rows.map((row, index) => ({
    rank: index + 1,
    playerName: row.player_name,
    score: row.score,
    wave: row.wave,
    createdAt: row.created_at
  }));
}

export default async function handler(req, res) {
  try {
    const sql = getSql();
    if (!sql) {
      sendJson(res, 503, { ok: false, error: "DATABASE_URL is not configured." });
      return;
    }
    await ensureSchema(sql);

    if (req.method === "GET") {
      sendJson(res, 200, { ok: true, scores: await topScores(sql) });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    const body = await readBody(req);
    const playerName = String(body.playerName || "").trim().slice(0, 40);
    const score = Number(body.score || 0);
    const wave = Number(body.wave || 1);
    if (!playerName || !Number.isFinite(score) || score < 0 || !Number.isFinite(wave) || wave < 1) {
      sendJson(res, 400, { ok: false, error: "Valid player name, score, and wave are required." });
      return;
    }

    await sql`
      insert into dark_sector_scores (player_name, score, wave)
      values (${playerName}, ${Math.round(score)}, ${Math.round(wave)})
    `;
    sendJson(res, 200, { ok: true, scores: await topScores(sql) });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

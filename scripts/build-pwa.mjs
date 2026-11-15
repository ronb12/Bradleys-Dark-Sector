import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
async function listFiles(dir, root = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...await listFiles(full, root));
    else if (entry.isFile()) paths.push("/" + path.relative(root, full).split(path.sep).join("/"));
  }
  return paths;
}

const paths = (await listFiles(dist)).filter((p) =>
  !p.endsWith(".map") && p !== "/index.html" && p !== "/sw.js" && p !== "/pwa-precache.json"
).sort();
const version = createHash("sha256").update(paths.join("\n")).digest("hex").slice(0, 12);
const template = await readFile(path.resolve("public/sw.js"), "utf8");
await writeFile(path.join(dist, "sw.js"), template.replaceAll("__DS_CACHE_VERSION__", version));
await writeFile(path.join(dist, "pwa-precache.json"), JSON.stringify(paths, null, 2) + "\n");
console.log(`PWA assets ready: ${paths.length} paths, cache version ${version}`);

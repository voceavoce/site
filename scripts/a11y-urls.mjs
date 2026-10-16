// Elenco di pagine campione per pa11y-ci: home nelle 3 lingue + le prime 3 schede in _site/brani/.
// Uso: node scripts/a11y-urls.mjs [base-url] [cartella-output]  -> scrive node_modules/.cache/pa11yci.json
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function sampleUrls(base = "http://localhost:8080", site = "_site") {
  const paths = ["/", "/en/", "/es/"];
  const dir = path.join(site, "brani");
  if (existsSync(dir)) {
    const schede = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "index.html")))
      .map((d) => d.name)
      .sort()
      .slice(0, 3);
    for (const s of schede) paths.push(`/brani/${s}/`);
  }
  return paths.map((p) => base.replace(/\/$/, "") + p);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const urls = sampleUrls(process.argv[2], process.argv[3]);
  const config = {
    defaults: {
      runners: ["axe"],
      standard: "WCAG2AA",
      timeout: 60000,
      chromeLaunchConfig: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
    urls,
  };
  mkdirSync("node_modules/.cache", { recursive: true });
  writeFileSync("node_modules/.cache/pa11yci.json", JSON.stringify(config, null, 2) + "\n");
  console.log(`pa11y: ${urls.length} pagine\n  ` + urls.join("\n  "));
}

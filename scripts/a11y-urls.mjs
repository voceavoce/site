// Elenco di pagine campione per pa11y-ci: home e ricerca nelle 3 lingue, un indice (/autori/) + le prime 3 schede in _site/brani/.
// Uso: node scripts/a11y-urls.mjs [base-url] [cartella-output]  -> scrive node_modules/.cache/pa11yci.json
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function sampleUrls(base = "http://localhost:8080", site = "_site") {
  const paths = ["/", "/en/", "/es/", "/cerca/", "/en/search/", "/es/buscar/", "/autori/"];
  const dir = path.join(site, "brani");
  if (existsSync(dir)) {
    const schede = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "index.html")))
      .map((d) => d.name)
      .sort()
      .slice(0, 3);
    for (const s of schede) paths.push(`/brani/${s}/`);
  }
  // Player di studio con dati di prova (assente nella build di produzione)
  if (existsSync(path.join(site, "player/_prova/index.html"))) paths.push("/player/_prova/");
  return paths.map((p) => base.replace(/\/$/, "") + p);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const urls = sampleUrls(process.argv[2], process.argv[3]);
  const config = {
    defaults: {
      runners: ["axe"],
      // frame-tested: l'iframe di YouTube (youtube-nocookie.com) e' cross-origin, axe non puo' entrarci
      // e lo segnala come "non testato": non e' un difetto del sito.
      ignore: ["frame-tested"],
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

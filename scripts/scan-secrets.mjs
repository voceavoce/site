// Cerca segreti nei file tracciati da git (token, chiavi private, chiavi cloud). Uso: node scripts/scan-secrets.mjs
// Esce con 1 se trova qualcosa. Non stampa mai il valore trovato, solo file, riga e tipo.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REGOLE = [
  ["chiave privata", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["token GitHub", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ["chiave AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["chiave Google API", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["token Slack", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["chiave sk-", /\bsk-[A-Za-z0-9_-]{24,}/],
  ["credenziale in URL", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{4,}@[^\s/]+/i],
  // chiave = "valore lungo" con nomi tipici; i segnaposto (<...>, ${...}, xxx, ...) non contano
  ["segreto assegnato", /\b(secret|token|passw(or)?d|api[_-]?key|access[_-]?key)[A-Za-z_]*\s*[:=]\s*["']([A-Za-z0-9/+_=-]{16,})["']/i],
  ["R2 access key hex", /\bR2_(SECRET_ACCESS_KEY|ACCESS_KEY_ID)\s*=\s*[0-9a-f]{32,64}\s*$/m],
];

const SEGNAPOSTO = /(x{4,}|\*{3,}|example|esempio|fittiz|placeholder|changeme|your[_-]|<[^>]+>|\$\{)/i;

/** Ritorna [{file, riga, regola}] per ogni riga sospetta di un testo. */
export function scanText(file, text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [regola, re] of REGOLE) {
      const m = re.exec(line);
      if (m && !SEGNAPOSTO.test(m[0])) out.push({ file, riga: i + 1, regola });
    }
  });
  return out;
}

export function scanRepo(root) {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const out = [];
  for (const f of files) {
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|wasm|pdf|opus|mp3|wav|zip)$/i.test(f)) continue;
    let buf;
    try {
      buf = readFileSync(path.join(root, f));
    } catch {
      continue;
    }
    if (buf.includes(0)) continue; // binario
    out.push(...scanText(f, buf.toString("utf8")));
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const trovati = scanRepo(root);
  if (trovati.length) {
    console.error(`Anti-segreti: ${trovati.length} sospetti`);
    for (const t of trovati) console.error(`  - ${t.file}:${t.riga} (${t.regola})`);
    process.exit(1);
  }
  console.log("Anti-segreti: OK");
}

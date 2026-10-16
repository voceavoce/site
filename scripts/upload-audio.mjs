#!/usr/bin/env node
// Carica a mano gli audio di studio da VOCEAVOCE_AUDIO_DIR su Cloudflare R2 (rclone).
// Gli audio non entrano MAI nel repo e non passano dalla CI. Vedi docs/player.md.
//
//   node scripts/upload-audio.mjs [--slug X] [--dry-run]   copia (copy: non cancella mai nulla)
//   node scripts/upload-audio.mjs --sync [--slug X]        sincronizza (CANCELLA su R2 cio' che non c'e' in locale)
//   node scripts/upload-audio.mjs --help

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CACHE_CONTROL = "public, max-age=31536000, immutable";
// Estensione -> Content-Type. Usato sia per il caricamento sia per la verifica e il server di sviluppo.
export const TIPI_AUDIO = {
  ".opus": "audio/ogg; codecs=opus",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
};
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const REMOTE_RE = /^[A-Za-z0-9_]+$/;
const BUCKET_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const ACCOUNT_RE = /^[a-f0-9]{32}$/i;

const AIUTO = `Uso: node scripts/upload-audio.mjs [opzioni]

Carica gli audio da VOCEAVOCE_AUDIO_DIR (o VOCEAVOCE_AUDIO_DIR/<slug>) su Cloudflare R2.

Opzioni:
  --slug <X>   carica solo la cartella di un brano (es. locus-iste-bruckner)
  --dry-run    mostra cosa verrebbe caricato, senza caricare e senza verifica HEAD
  --sync       ALLINEA il bucket alla cartella locale: CANCELLA su R2 i file che non esistono
               in locale. Mostra prima un'anteprima e chiede di digitare il nome del bucket.
  --help       questo messaggio

Configurazione: process.env, poi .env.local nella radice del repo (vedi .env.example).
Le credenziali non vengono mai stampate ne' passate come argomenti: vanno al solo processo rclone
come variabili d'ambiente. Senza R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY usa il remote
RCLONE_REMOTE gia' presente nella config di rclone.
`;

// ---------- configurazione ----------

// Parser minimo di un file .env: KEY=valore, righe # e vuote ignorate, virgolette singole/doppie,
// "export " opzionale, commento in coda dopo spazio+#. Nessuna interpolazione.
export function parseEnvFile(testo) {
  const out = {};
  for (const grezza of String(testo).split(/\r?\n/)) {
    const riga = grezza.trim();
    if (!riga || riga.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(riga);
    if (!m) continue;
    let valore = m[2].trim();
    const quotato = valore.length >= 2 && ((valore[0] === '"' && valore.endsWith('"')) || (valore[0] === "'" && valore.endsWith("'")));
    if (quotato) {
      valore = valore.slice(1, -1);
    } else {
      const commento = valore.search(/\s#/);
      if (commento >= 0) valore = valore.slice(0, commento).trim();
    }
    out[m[1]] = valore;
  }
  return out;
}

// process.env prevale su .env.local. I valori vuoti contano come non impostati.
export function caricaEnv({ repoRoot = REPO_ROOT, env = process.env } = {}) {
  const merged = {};
  const file = path.join(repoRoot, ".env.local");
  if (fs.existsSync(file)) {
    for (const [k, v] of Object.entries(parseEnvFile(fs.readFileSync(file, "utf8")))) if (v !== "") merged[k] = v;
  }
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== "") merged[k] = v;
  return merged;
}

// Costruisce la configurazione validata. Lancia Error con messaggi in italiano.
export function configura(env, { repoRoot = REPO_ROOT } = {}) {
  const dirGrezza = env.VOCEAVOCE_AUDIO_DIR;
  if (!dirGrezza) throw new Error("VOCEAVOCE_AUDIO_DIR non impostata (vedi .env.example).");
  const remote = env.RCLONE_REMOTE || "r2";
  if (!REMOTE_RE.test(remote)) throw new Error(`RCLONE_REMOTE non valido: "${remote}" (solo lettere, cifre e _).`);
  const bucket = env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET non impostato.");
  if (!BUCKET_RE.test(bucket)) throw new Error(`R2_BUCKET non valido: "${bucket}".`);

  const credenziali = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  const presenti = credenziali.filter((k) => env[k]);
  let r2 = null;
  if (presenti.length === credenziali.length) {
    if (!ACCOUNT_RE.test(env.R2_ACCOUNT_ID)) throw new Error("R2_ACCOUNT_ID non valido: attesi 32 caratteri esadecimali.");
    r2 = {
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    };
  } else if (presenti.length > 0) {
    const mancanti = credenziali.filter((k) => !env[k]);
    throw new Error(`Credenziali R2 incomplete: mancano ${mancanti.join(", ")}. Imposta tutte e tre oppure nessuna.`);
  }

  const publicBase = env.R2_PUBLIC_BASE || "";
  return {
    audioDir: path.resolve(repoRoot, dirGrezza),
    remote,
    bucket,
    publicBase,
    r2,
  };
}

// Variabili d'ambiente per il remote "al volo" (solo processo figlio, mai argomenti).
export function ambienteRemoto(cfg) {
  if (!cfg.r2) return {};
  const p = `RCLONE_CONFIG_${cfg.remote.toUpperCase()}_`;
  return {
    [`${p}TYPE`]: "s3",
    [`${p}PROVIDER`]: "Cloudflare",
    [`${p}ENDPOINT`]: `https://${cfg.r2.accountId}.r2.cloudflarestorage.com`,
    [`${p}REGION`]: "auto",
    [`${p}ACL`]: "private",
    [`${p}ACCESS_KEY_ID`]: cfg.r2.accessKeyId,
    [`${p}SECRET_ACCESS_KEY`]: cfg.r2.secretAccessKey,
  };
}

// ---------- argomenti ----------

export function parseArgs(argv) {
  const o = { help: false, dryRun: false, sync: false, slug: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--sync") o.sync = true;
    else if (a === "--slug") {
      o.slug = argv[++i];
      if (o.slug === undefined) throw new Error("--slug richiede un valore.");
    } else if (a.startsWith("--slug=")) o.slug = a.slice("--slug=".length);
    else throw new Error(`Opzione sconosciuta: ${a}`);
  }
  if (o.slug !== null && !SLUG_RE.test(o.slug)) {
    throw new Error(`Slug non valido: "${o.slug}" (ammessi minuscole, cifre e trattini).`);
  }
  return o;
}

// ---------- rclone ----------

// Piano dei comandi rclone: una passata per estensione, cosi' ogni tipo ha il Content-Type giusto.
// modo "copy" non cancella mai nulla. modo "sync" cancella: va usato solo dopo conferma.
export function pianoRclone({ modo, slug = null, audioDir, remote, bucket, dryRun = false, anteprima = false, tipi = TIPI_AUDIO }) {
  if (modo !== "copy" && modo !== "sync") throw new Error(`Modo rclone non ammesso: ${modo}`);
  const sorgente = slug ? path.join(audioDir, slug) : audioDir;
  const destinazione = `${remote}:${bucket}${slug ? `/${slug}` : ""}`;
  return Object.entries(tipi).map(([ext, mime]) => {
    const args = [
      modo, sorgente, destinazione,
      "--include", `*${ext}`,
      "--header-upload", `Cache-Control: ${CACHE_CONTROL}`,
      "--header-upload", `Content-Type: ${mime}`,
      "--checksum",
    ];
    if (anteprima) args.push("--dry-run", "-v");
    else {
      args.push("--progress");
      if (dryRun) args.push("--dry-run");
    }
    return { ext, args };
  });
}

function eseguiRclone(args, env, { cattura = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("rclone", args, { env, stdio: cattura ? ["ignore", "pipe", "pipe"] : "inherit" });
    let out = "";
    if (cattura) {
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
    }
    child.on("error", (err) => {
      reject(err.code === "ENOENT"
        ? new Error("rclone non trovato nel PATH. Installalo da https://rclone.org/install/ e riprova.")
        : err);
    });
    child.on("close", (code) => resolve({ code, out }));
  });
}

// ---------- verifica della cartella rispetto al repo ----------

function gitIgnorati(percorsi) {
  const r = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
    cwd: REPO_ROOT,
    input: percorsi.join("\n"),
    encoding: "utf8",
  });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git check-ignore non riuscito: ${r.stderr || r.error?.message || "errore sconosciuto"}`);
  return new Set(r.stdout.split("\n").filter(Boolean));
}

// Rifiuta se AUDIO_DIR e' dentro il repo e i file audio non sono ignorati da git.
// fileAudio: percorsi assoluti dei file audio presenti. ignorati: (percorsiRelativi) => Set di quelli ignorati.
export function verificaCartellaAudio({ audioDir, repoRoot = REPO_ROOT, fileAudio = [], ignorati = (p) => gitIgnorati(p) }) {
  const rel = path.relative(repoRoot, audioDir);
  if (rel === "") {
    return { ok: false, motivo: "VOCEAVOCE_AUDIO_DIR coincide con la radice del repo: rifiuto." };
  }
  const dentro = !(rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
  if (!dentro) return { ok: true };

  const toPosix = (p) => p.split(path.sep).join("/");
  const candidati = fileAudio.length
    ? fileAudio.map((f) => toPosix(path.relative(repoRoot, f)))
    : [toPosix(path.join(rel, "probe.opus"))];
  const ign = ignorati(candidati);
  const nonIgnorati = candidati.filter((c) => !ign.has(c));
  if (nonIgnorati.length > 0) {
    const esempi = nonIgnorati.slice(0, 5).join(", ");
    return {
      ok: false,
      motivo: `VOCEAVOCE_AUDIO_DIR e' dentro il repo e questi file NON sono ignorati da git: ${esempi}. Rifiuto per evitare commit di audio. Sposta la cartella fuori dal repo o aggiungi la regola al .gitignore.`,
    };
  }
  return { ok: true };
}

// Elenca ricorsivamente i file audio (estensioni di TIPI_AUDIO) sotto dir.
export function elencaAudio(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...elencaAudio(p));
    else if (e.isFile() && Object.hasOwn(TIPI_AUDIO, path.extname(e.name))) out.push(p);
  }
  return out;
}

// ---------- verifica HTTP degli URL pubblici ----------

export function urlPubblico(base, chiave) {
  return `${base.replace(/\/+$/, "")}/${chiave.split("/").map(encodeURIComponent).join("/")}`;
}

// Restituisce l'elenco dei problemi (vuoto = ok).
export function valutaRisposta({ status, contentType = "", cacheControl = "", acceptRanges = "" }, mime) {
  const problemi = [];
  if (status !== 200) problemi.push(`HTTP ${status}`);
  const tipoAtteso = mime.split(";")[0].trim().toLowerCase();
  const tipo = contentType.split(";")[0].trim().toLowerCase();
  if (tipo !== tipoAtteso) problemi.push(`content-type "${contentType}" invece di "${tipoAtteso}"`);
  if (!cacheControl.includes("max-age=31536000")) problemi.push(`cache-control "${cacheControl}"`);
  if (acceptRanges !== "bytes") problemi.push(`accept-ranges "${acceptRanges}" (serve "bytes" per Safari)`);
  return problemi;
}

async function verificaUrl(base, chiave) {
  const url = urlPubblico(base, chiave);
  const mime = TIPI_AUDIO[path.extname(chiave)];
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    const dati = {
      status: r.status,
      contentType: r.headers.get("content-type") || "",
      cacheControl: r.headers.get("cache-control") || "",
      acceptRanges: r.headers.get("accept-ranges") || "",
    };
    return { chiave, url, ...dati, problemi: valutaRisposta(dati, mime) };
  } catch (err) {
    return { chiave, url, status: 0, problemi: [`richiesta fallita: ${err.message}`] };
  }
}

// ---------- conferma interattiva ----------

async function chiediConfermaBucket(bucket) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const risposta = await rl.question(`Per confermare la CANCELLAZIONE su R2 scrivi il nome esatto del bucket (${bucket}): `);
    return risposta.trim() === bucket;
  } finally {
    rl.close();
  }
}

// ---------- main ----------

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`Errore: ${err.message}\n`);
    console.error(AIUTO);
    return 2;
  }
  if (opts.help) {
    console.log(AIUTO);
    return 0;
  }

  const env = caricaEnv();
  let cfg;
  try {
    cfg = configura(env);
  } catch (err) {
    console.error(`Errore di configurazione: ${err.message}`);
    return 1;
  }

  const fileAudio = elencaAudio(cfg.audioDir);
  const verifica = verificaCartellaAudio({ audioDir: cfg.audioDir, fileAudio, ignorati: (p) => gitIgnorati(p) });
  if (!verifica.ok) {
    console.error(`Rifiuto: ${verifica.motivo}`);
    return 1;
  }
  const cartella = opts.slug ? path.join(cfg.audioDir, opts.slug) : cfg.audioDir;
  if (!fs.existsSync(cartella)) {
    console.error(`Cartella locale inesistente: ${cartella}`);
    return 1;
  }
  const locali = elencaAudio(cartella).map((f) => path.relative(cfg.audioDir, f).split(path.sep).join("/"));
  if (locali.length === 0) {
    console.error(`Nessun file audio in ${cartella}: niente da caricare.`);
    return 1;
  }
  if (!opts.dryRun && !cfg.publicBase) {
    console.error("R2_PUBLIC_BASE non impostato: senza URL pubblico non posso verificare il caricamento (HEAD). Imposta la variabile o usa --dry-run.");
    return 1;
  }

  const ambiente = { ...process.env, ...ambienteRemoto(cfg) };
  const base = { audioDir: cfg.audioDir, remote: cfg.remote, bucket: cfg.bucket, slug: opts.slug };
  console.log(`Sorgente: ${cartella}`);
  console.log(`Destinazione: ${cfg.remote}:${cfg.bucket}${opts.slug ? `/${opts.slug}` : ""}`);
  console.log(`File audio locali: ${locali.length}${cfg.r2 ? " (remote creato al volo dalle variabili R2_*)" : ""}`);

  if (opts.sync) {
    // Anteprima obbligatoria: mostra cosa verrebbe cancellato.
    let cancellazioni = 0;
    for (const { args } of pianoRclone({ ...base, modo: "sync", dryRun: true, anteprima: true })) {
      const { code, out } = await eseguiRclone(args, ambiente, { cattura: true });
      if (code !== 0) {
        console.error(`rclone (anteprima) terminato con codice ${code}:\n${out.split("\n").slice(-10).join("\n")}`);
        return 1;
      }
      for (const riga of out.split("\n")) {
        if (/delet/i.test(riga)) {
          cancellazioni++;
          console.log(`  [da cancellare] ${riga.trim()}`);
        }
      }
    }
    console.log(`\nSYNC: su R2 verrebbero CANCELLATI ${cancellazioni} file che non esistono in locale.`);
    if (opts.dryRun) return 0;
    if (!process.stdin.isTTY) {
      console.error("--sync richiede un terminale interattivo per la conferma. Annullato.");
      return 1;
    }
    if (!(await chiediConfermaBucket(cfg.bucket))) {
      console.log("Conferma non corrispondente: annullato, nessuna modifica.");
      return 1;
    }
  }

  const modo = opts.sync ? "sync" : "copy";
  for (const { args } of pianoRclone({ ...base, modo, dryRun: opts.dryRun })) {
    console.log(`\n$ rclone ${args.join(" ")}`);
    const { code } = await eseguiRclone(args, ambiente);
    if (code !== 0) {
      console.error(`rclone terminato con codice ${code}: nessuna verifica HEAD.`);
      return 1;
    }
  }

  if (opts.dryRun) {
    console.log("\nDry-run completato: nulla e' stato caricato ne' cancellato.");
    return 0;
  }

  console.log(`\nVerifica HEAD su ${cfg.publicBase} (${locali.length} file)...`);
  const esiti = [];
  for (let i = 0; i < locali.length; i += 8) {
    esiti.push(...(await Promise.all(locali.slice(i, i + 8).map((c) => verificaUrl(cfg.publicBase, c)))));
  }
  const errori = [];
  for (const e of esiti) {
    const ok = e.problemi.length === 0;
    console.log(`${ok ? "OK  " : "ERR "} ${e.status} ${e.chiave}  type="${e.contentType ?? ""}" cache="${e.cacheControl ?? ""}" ranges="${e.acceptRanges ?? ""}"`);
    if (!ok) errori.push(e);
  }
  if (errori.length > 0) {
    console.error(`\nErrori (${errori.length}):`);
    for (const e of errori) console.error(`  - ${e.chiave}: ${e.problemi.join("; ")}`);
    return 1;
  }
  console.log(`\nCaricamento verificato: ${esiti.length} file OK.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  parseEnvFile, caricaEnv, configura, ambienteRemoto, parseArgs, pianoRclone,
  verificaCartellaAudio, elencaAudio, urlPubblico, valutaRisposta, TIPI_AUDIO, CACHE_CONTROL,
} from "../scripts/upload-audio.mjs";
import { parseRange, risolviPercorso, creaServer } from "../scripts/serve-audio.mjs";

const REPO = "/repo/finto";
const SEGRETO = "SEGRETO-NON-STAMPARE-9f3a";
const CFG_AL_VOLO = {
  audioDir: "/fuori/audio", remote: "r2", bucket: "voceavoce-audio", publicBase: "https://audio.example",
  r2: { accountId: "a".repeat(32), accessKeyId: "AKID-TEST", secretAccessKey: SEGRETO },
};

test("parseEnvFile: commenti, virgolette, export, commento in coda", () => {
  const e = parseEnvFile([
    "# commento", "", "A=1", "export B='due due'", 'C="tre # non commento"', "D=quattro # commento", "E=", "  F = sei  ",
  ].join("\r\n"));
  assert.deepEqual(e, { A: "1", B: "due due", C: "tre # non commento", D: "quattro", E: "", F: "sei" });
});

test("caricaEnv: process.env prevale su .env.local e i vuoti non contano", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upl-env-"));
  try {
    fs.writeFileSync(path.join(dir, ".env.local"), "X=file\nY=file\nZ=\n");
    const m = caricaEnv({ repoRoot: dir, env: { Y: "shell", Z: "", W: undefined } });
    assert.equal(m.X, "file");
    assert.equal(m.Y, "shell");
    assert.equal(m.Z, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("configura: credenziali parziali rifiutate; account non valido rifiutato", () => {
  const base = { VOCEAVOCE_AUDIO_DIR: "x", R2_BUCKET: "voceavoce-audio" };
  assert.throws(() => configura({ ...base, R2_ACCOUNT_ID: "a".repeat(32) }, { repoRoot: REPO }), /Credenziali R2 incomplete/);
  assert.throws(() => configura({ ...base, R2_ACCOUNT_ID: "zz", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" }, { repoRoot: REPO }), /R2_ACCOUNT_ID non valido/);
  assert.throws(() => configura({ R2_BUCKET: "voceavoce-audio" }, { repoRoot: REPO }), /VOCEAVOCE_AUDIO_DIR/);
  assert.throws(() => configura({ VOCEAVOCE_AUDIO_DIR: "x", RCLONE_REMOTE: "a-b", R2_BUCKET: "voceavoce-audio" }, { repoRoot: REPO }), /RCLONE_REMOTE non valido/);
});

test("configura: AUDIO_DIR relativa risolta sulla radice del repo; senza credenziali niente remote al volo", () => {
  const cfg = configura({ VOCEAVOCE_AUDIO_DIR: "../aivideocreator/runtime/audio_sito", R2_BUCKET: "voceavoce-audio" }, { repoRoot: REPO });
  assert.equal(cfg.audioDir, path.resolve(REPO, "../aivideocreator/runtime/audio_sito"));
  assert.equal(cfg.r2, null);
  assert.deepEqual(ambienteRemoto(cfg), {});
});

test("ambienteRemoto: le credenziali stanno solo nell'ambiente del processo", () => {
  const amb = ambienteRemoto(CFG_AL_VOLO);
  assert.equal(amb.RCLONE_CONFIG_R2_TYPE, "s3");
  assert.equal(amb.RCLONE_CONFIG_R2_PROVIDER, "Cloudflare");
  assert.equal(amb.RCLONE_CONFIG_R2_ACL, "private");
  assert.equal(amb.RCLONE_CONFIG_R2_ENDPOINT, `https://${"a".repeat(32)}.r2.cloudflarestorage.com`);
  assert.equal(amb.RCLONE_CONFIG_R2_SECRET_ACCESS_KEY, SEGRETO);
});

test("pianoRclone: la modalita' di default non usa mai sync ne' cancellazioni", () => {
  for (const dryRun of [false, true]) {
    const piano = pianoRclone({ modo: "copy", audioDir: CFG_AL_VOLO.audioDir, remote: "r2", bucket: "voceavoce-audio", dryRun });
    assert.equal(piano.length, Object.keys(TIPI_AUDIO).length);
    for (const { args } of piano) {
      assert.equal(args[0], "copy");
      assert.ok(!args.includes("sync"));
      assert.ok(!args.some((a) => a.startsWith("--delete") || a === "--delete-excluded"));
      assert.equal(args.includes("--dry-run"), dryRun);
    }
  }
});

test("pianoRclone: sync solo se richiesto; slug limita sorgente e destinazione", () => {
  const piano = pianoRclone({ modo: "sync", slug: "locus-iste-bruckner", audioDir: "/a", remote: "r2", bucket: "voceavoce-audio" });
  assert.ok(piano.every(({ args }) => args[0] === "sync"));
  assert.equal(piano[0].args[1], path.join("/a", "locus-iste-bruckner"));
  assert.equal(piano[0].args[2], "r2:voceavoce-audio/locus-iste-bruckner");
  const copy = pianoRclone({ modo: "copy", audioDir: "/a", remote: "r2", bucket: "b" });
  assert.equal(copy[0].args[2], "r2:b");
  assert.throws(() => pianoRclone({ modo: "delete", audioDir: "/a", remote: "r2", bucket: "b" }));
});

test("pianoRclone: Content-Type e Cache-Control corretti per tipo, nessun segreto negli argomenti", () => {
  const piano = pianoRclone({ modo: "copy", audioDir: "/a", remote: "r2", bucket: "b" });
  const per = (ext) => piano.find((p) => p.ext === ext).args;
  const opus = per(".opus");
  assert.deepEqual(opus.slice(opus.indexOf("--include"), opus.indexOf("--include") + 2), ["--include", "*.opus"]);
  assert.ok(opus.includes("Content-Type: audio/ogg; codecs=opus"));
  assert.ok(per(".mp3").includes("Content-Type: audio/mpeg"));
  assert.ok(opus.includes(`Cache-Control: ${CACHE_CONTROL}`));
  assert.equal(CACHE_CONTROL, "public, max-age=31536000, immutable");
  const tutti = piano.flatMap((p) => p.args).join(" ");
  assert.ok(!tutti.includes(SEGRETO));
  assert.ok(!tutti.includes("AKID-TEST"));
  assert.ok(!tutti.includes("a".repeat(32)));
});

test("parseArgs: opzioni valide, slug e opzioni sconosciute", () => {
  assert.deepEqual(parseArgs([]), { help: false, dryRun: false, sync: false, slug: null });
  assert.deepEqual(parseArgs(["--slug", "locus-iste-bruckner", "--dry-run"]), { help: false, dryRun: true, sync: false, slug: "locus-iste-bruckner" });
  assert.equal(parseArgs(["--sync", "--slug=ave-verum"]).sync, true);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.throws(() => parseArgs(["--slug", "../etc"]), /Slug non valido/);
  assert.throws(() => parseArgs(["--slug"]), /richiede un valore/);
  assert.throws(() => parseArgs(["--cancella-tutto"]), /Opzione sconosciuta/);
});

test("verificaCartellaAudio: fuori dal repo va sempre bene, senza interrogare git", () => {
  let chiamate = 0;
  const r = verificaCartellaAudio({ audioDir: "/altrove/audio", repoRoot: REPO, fileAudio: ["/altrove/audio/a.opus"], ignorati: () => { chiamate++; return new Set(); } });
  assert.equal(r.ok, true);
  assert.equal(chiamate, 0);
});

test("verificaCartellaAudio: dentro il repo rifiuta se i file non sono ignorati, accetta se lo sono", () => {
  const audioDir = path.join(REPO, "runtime", "audio");
  const file = [path.join(audioDir, "x", "v1", "soprano.opus")];
  const nonIgnorato = verificaCartellaAudio({ audioDir, repoRoot: REPO, fileAudio: file, ignorati: () => new Set() });
  assert.equal(nonIgnorato.ok, false);
  assert.match(nonIgnorato.motivo, /NON sono ignorati/);
  const ignorato = verificaCartellaAudio({ audioDir, repoRoot: REPO, fileAudio: file, ignorati: (p) => new Set(p) });
  assert.equal(ignorato.ok, true);
});

test("verificaCartellaAudio: senza file controlla un file di prova; radice del repo sempre rifiutata", () => {
  const audioDir = path.join(REPO, "audio");
  const visti = [];
  const r = verificaCartellaAudio({ audioDir, repoRoot: REPO, fileAudio: [], ignorati: (p) => { visti.push(...p); return new Set(p); } });
  assert.equal(r.ok, true);
  assert.deepEqual(visti, ["audio/probe.opus"]);
  assert.equal(verificaCartellaAudio({ audioDir: REPO, repoRoot: REPO, fileAudio: [], ignorati: () => new Set([""]) }).ok, false);
});

test("elencaAudio: solo estensioni audio, ricorsivo; urlPubblico codifica i segmenti", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upl-el-"));
  try {
    fs.mkdirSync(path.join(dir, "prova", "v 1"), { recursive: true });
    fs.writeFileSync(path.join(dir, "prova", "v 1", "soprano.opus"), "x");
    fs.writeFileSync(path.join(dir, "prova", "note.txt"), "x");
    const trovati = elencaAudio(dir).map((f) => path.relative(dir, f));
    assert.deepEqual(trovati, [path.join("prova", "v 1", "soprano.opus")]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(urlPubblico("https://audio.example/", "prova/v 1/soprano.opus"), "https://audio.example/prova/v%201/soprano.opus");
});

test("valutaRisposta: content-type, cache-control e accept-ranges", () => {
  const ok = { status: 200, contentType: "audio/ogg; codecs=opus", cacheControl: CACHE_CONTROL, acceptRanges: "bytes" };
  assert.deepEqual(valutaRisposta(ok, TIPI_AUDIO[".opus"]), []);
  assert.equal(valutaRisposta({ ...ok, status: 404 }, TIPI_AUDIO[".opus"]).length, 1);
  assert.ok(valutaRisposta({ ...ok, contentType: "application/octet-stream" }, TIPI_AUDIO[".opus"])[0].includes("content-type"));
  assert.ok(valutaRisposta({ ...ok, acceptRanges: "" }, TIPI_AUDIO[".opus"]).some((p) => p.includes("accept-ranges")));
});

test("parseRange: intervalli singoli, suffisso, clamp, non soddisfacibili, ignorati", () => {
  assert.equal(parseRange(undefined, 10), null);
  assert.deepEqual(parseRange("bytes=0-3", 10), { start: 0, end: 3 });
  assert.deepEqual(parseRange("bytes=5-", 10), { start: 5, end: 9 });
  assert.deepEqual(parseRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange("bytes=0-999", 10), { start: 0, end: 9 });
  assert.equal(parseRange("bytes=10-", 10), "unsatisfiable");
  assert.equal(parseRange("bytes=-0", 10), "unsatisfiable");
  assert.equal(parseRange("bytes=0-3", 0), "unsatisfiable");
  assert.equal(parseRange("bytes=0-1,3-4", 10), null);
  assert.equal(parseRange("items=0-1", 10), null);
  assert.equal(parseRange("bytes=5-2", 10), null);
});

test("risolviPercorso: file normali dentro la root; traversal e file nascosti bloccati", () => {
  const root = "/srv/audio";
  assert.deepEqual(risolviPercorso(root, "/locus-iste/v1/soprano.opus?x=1"), { ok: true, file: path.resolve(root, "locus-iste", "v1", "soprano.opus") });
  assert.equal(risolviPercorso(root, "/../etc/passwd").stato, 403);
  assert.equal(risolviPercorso(root, "/%2e%2e/etc/passwd").stato, 403);
  assert.equal(risolviPercorso(root, "/a/..%2F..%2Fetc").stato, 403);
  assert.equal(risolviPercorso(root, "/a%5C..%5Cb").stato, 403);
  assert.equal(risolviPercorso(root, "/a%00b").stato, 403);
  assert.equal(risolviPercorso(root, "/.env.local").stato, 404);
  assert.equal(risolviPercorso(root, "/x/.git/config").stato, 404);
  assert.equal(risolviPercorso(root, "/%E0%A4%A").stato, 400);
});

test("server: HEAD, Range 206, 416, 403 su traversal, 405, CORS solo per le origini consentite", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upl-srv-"));
  fs.mkdirSync(path.join(dir, "prova", "v1"), { recursive: true });
  fs.writeFileSync(path.join(dir, "prova", "v1", "soprano.opus"), "0123456789");
  const server = creaServer({ root: dir });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const head = await fetch(`${base}/prova/v1/soprano.opus`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-type"), "audio/ogg; codecs=opus");
    assert.equal(head.headers.get("accept-ranges"), "bytes");
    assert.equal(head.headers.get("content-length"), "10");

    const part = await fetch(`${base}/prova/v1/soprano.opus`, { headers: { Range: "bytes=0-3" } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), "bytes 0-3/10");
    assert.equal(await part.text(), "0123");

    const fuori = await fetch(`${base}/prova/v1/soprano.opus`, { headers: { Range: "bytes=50-" } });
    assert.equal(fuori.status, 416);

    // fetch normalizza i ".." prima di inviare: il percorso grezzo va mandato con http.request.
    const trav = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port: server.address().port, path: "/%2e%2e/%2e%2e/etc/passwd" }, (r) => {
        r.resume();
        resolve(r.statusCode);
      }).on("error", reject);
    });
    assert.equal(trav, 403);

    const post = await fetch(`${base}/prova/v1/soprano.opus`, { method: "POST" });
    assert.equal(post.status, 405);

    const ok = await fetch(`${base}/prova/v1/soprano.opus`, { headers: { Origin: "http://localhost:8080" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:8080");
    const no = await fetch(`${base}/prova/v1/soprano.opus`, { headers: { Origin: "https://evil.example" } });
    assert.equal(no.headers.get("access-control-allow-origin"), null);

    const pre = await fetch(`${base}/prova/v1/soprano.opus`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:8080", "Access-Control-Request-Method": "GET" } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), "http://127.0.0.1:8080");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

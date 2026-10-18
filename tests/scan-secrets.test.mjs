import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanText, scanRepo } from "../scripts/scan-secrets.mjs";

const regole = (t) => scanText("f", t).map((x) => x.regola);

test("anti-segreti: riconosce i formati noti", () => {
  assert.deepEqual(regole("-----BEGIN RSA PRIVATE KEY-----"), ["chiave privata"]);
  assert.deepEqual(regole("t = ghp_" + "a".repeat(36)), ["token GitHub"]);
  assert.deepEqual(regole("k = AKIA" + "A".repeat(16)), ["chiave AWS"]);
  assert.deepEqual(regole("https://utente:password1234@db.interno.it/x"), ["credenziale in URL"]);
  assert.deepEqual(regole('const apiKey = "abcdEFGH12345678abcd"'), ["segreto assegnato"]);
  assert.deepEqual(regole("R2_SECRET_ACCESS_KEY=" + "ab12".repeat(16)), ["R2 access key hex"]);
});

test("anti-segreti: ignora segnaposto e testo normale", () => {
  assert.deepEqual(regole("R2_SECRET_ACCESS_KEY=<Secret Access Key del token>"), []);
  assert.deepEqual(regole('token = "${{ secrets.TOKEN_DI_PROVA_LUNGO }}"'), []);
  assert.deepEqual(regole('password: "xxxxxxxxxxxxxxxxxxxx"'), []);
  assert.deepEqual(regole("Il token CSS e' un colore; https://voceavoce.com/it/"), []);
});

test("anti-segreti: segnala file e riga senza mostrare il valore", () => {
  const r = scanText("a/b.txt", "ok\n-----BEGIN PRIVATE KEY-----");
  assert.deepEqual(r, [{ file: "a/b.txt", riga: 2, regola: "chiave privata" }]);
});

test("anti-segreti: il repo non contiene segreti", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  assert.deepEqual(scanRepo(root), []);
});

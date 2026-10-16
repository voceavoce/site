import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.goto("http://127.0.0.1:8080/player/locus-iste-bruckner/?debug");
await p.waitForFunction(() => window.__study && !document.querySelector("[data-play]").disabled, null, { timeout: 90000 });
const out = {};
const st = () => p.evaluate(() => ({ playing: window.__study.engine.playing, label: document.querySelector("[data-play-label]").textContent, pressed: document.querySelector("[data-play]").getAttribute("aria-pressed") }));
await p.evaluate(() => document.activeElement.blur());
await p.keyboard.press("Space"); await p.waitForTimeout(600); out.spazio1 = await st();
await p.keyboard.press("Space"); await p.waitForTimeout(400); out.spazio2 = await st();
// spazio con focus su un range: non deve alterare il trasporto (il range tiene il tasto)
await p.focus("[data-speed]"); await p.keyboard.press("Space"); await p.waitForTimeout(300); out.spazioSuRange = await st();
// frecce sul range velocita' e sul seek e sul volume
await p.focus("[data-speed]"); await p.keyboard.press("ArrowLeft"); out.frecciaVelocita = await p.evaluate(() => [document.querySelector("[data-speed]").value, document.querySelector("[data-speed-out]").textContent, document.querySelector("[data-speed]").getAttribute("aria-valuetext"), window.__study.engine.rate]);
await p.focus("[data-seek]"); const before = await p.evaluate(() => window.__study.engine.position()); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
out.frecciaSeek = await p.evaluate((b0) => [b0, window.__study.engine.position(), document.querySelector("[data-seek]").getAttribute("aria-valuetext")], before);
await p.focus("[data-track=basso] [data-volume]"); await p.keyboard.press("ArrowLeft");
out.frecciaVolume = await p.evaluate(() => [document.querySelector("[data-track=basso] [data-volume]").value, document.querySelector("[data-track=basso] [data-volume-out]").textContent, document.querySelector("[data-track=basso] [data-volume]").getAttribute("aria-valuetext"), window.__study.engine.getGainValue("basso")]);
// muta / solo da tastiera
await p.focus("[data-track=alto] [data-mute]"); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
out.muta = await p.evaluate(() => { const b = document.querySelector("[data-track=alto] [data-mute]"); return { name: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed"), gain: window.__study.engine.getGainValue("alto"), visibleText: b.textContent.trim() }; });
await p.waitForTimeout(100);
await p.focus("[data-track=tenore] [data-solo]"); await p.keyboard.press("Space"); await p.waitForTimeout(300);
out.solo = await p.evaluate(() => { const b = document.querySelector("[data-track=tenore] [data-solo]"); return { name: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed"), gains: Object.fromEntries(["soprano","alto","tenore","basso"].map(k => [k, +window.__study.engine.getGainValue(k).toFixed(2)])), playing: window.__study.engine.playing }; });
// accessibilita': nomi, aria-live
out.a11y = await p.evaluate(() => {
  const nameOf = (e) => e.getAttribute("aria-label") || e.textContent.trim();
  const btns = [...document.querySelectorAll("button, input[type=range], select")].map(e => ({ tag: e.tagName.toLowerCase() + (e.dataset ? "[" + Object.keys(e.dataset).filter(k => /^(mute|solo|volume|play|seek|speed|zoom|loop|myvoice)/.test(k)).join(",") + "]" : ""), nome: (e.getAttribute("aria-label") || (e.labels && e.labels[0] && e.labels[0].textContent.trim()) || e.textContent.trim() || "").slice(0, 50), pressed: e.getAttribute("aria-pressed"), disabled: e.disabled }));
  const live = document.querySelector("[data-status]"); const alert = document.querySelector("[data-error]");
  return { senzaNome: btns.filter(b => !b.nome).map(b => b.tag), pressedButtons: btns.filter(b => b.pressed !== null).length, status: { role: live.getAttribute("role"), live: live.getAttribute("aria-live"), testo: live.textContent }, errorRole: alert.getAttribute("role"), campione: btns.filter(b => /mute|solo|play/.test(b.tag)).slice(0, 8) };
});
// annuncio loop
await p.evaluate(() => { document.querySelector("[data-loop-from]").value = "4"; document.querySelector("[data-loop-to]").value = "6"; document.querySelector("[data-loop-from]").dispatchEvent(new Event("change", { bubbles: true })); });
await p.click(".study__side [data-loop-toggle]"); await p.waitForTimeout(200);
out.annuncioLoop = await p.evaluate(() => document.querySelector("[data-status]").textContent);
// focus ring visibile
await p.focus("[data-play]"); out.focusOutline = await p.evaluate(() => { const c = getComputedStyle(document.activeElement); return [c.outlineStyle, c.outlineWidth]; });
out.errori = [];
console.log(JSON.stringify(out, null, 1));
await b.close();

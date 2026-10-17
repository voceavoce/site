// Player di studio: collega engine, mixer, loop e partitura alla pagina /player/<slug>/.
import { setAudioBase } from "./config.js";
import { isOn } from "./features.js";
import { StudyEngine } from "./engine.js";
import { bindMixer } from "./mixer.js";
import { bindLoop } from "./loop.js";
import { createScore } from "./score.js";
import { measureIndexAt, timeOfMeasure, indexOfScoreMeasure, formatClock } from "./timeline.js";

const $ = (sel, root = document) => root.querySelector(sel);
const dataEl = $("#study-data");
if (dataEl) main(JSON.parse(dataEl.textContent)).catch((e) => console.error(e));

async function main(data) {
  const { manifest, sync, labels: L } = data;
  setAudioBase(data.audioBase);

  const root = $("[data-study]");
  const live = $("[data-status]");
  const alertBox = $("[data-error]");
  const say = (msg) => { live.textContent = msg; };
  const fail = (msg) => { alertBox.textContent = msg; alertBox.hidden = false; };
  const el = {
    play: $("[data-play]"), seek: $("[data-seek]"), time: $("[data-time]"), total: $("[data-total]"),
    speed: $("[data-speed]"), speedOut: $("[data-speed-out]"),
  };
  const controls = [...document.querySelectorAll("[data-needs-audio]")];
  const setReady = (on) => controls.forEach((c) => { c.disabled = !on; });
  setReady(false);
  el.total.textContent = formatClock(manifest.durata_sec ?? sync.fine);
  el.seek.max = String(manifest.durata_sec ?? sync.fine);

  const engine = new StudyEngine();
  let score = null;
  let currentIdx = -1;

  // --- partitura (in parallelo con l'audio; un suo errore non ferma il player)
  const scorePromise = createScore({
    container: $("[data-score]"),
    xmlUrl: data.scoreUrl,
    voiceLabels: manifest.tracce.filter((t) => t.tipo !== "accompagnamento").map((t) => t.voce),
    onMeasureTap: (m) => {
      if (loop?.tapMeasure(m, Math.max(0, currentIdx))) return;
      const i = indexOfScoreMeasure(sync, m, Math.max(0, currentIdx));
      if (i >= 0 && engine.tracks.size) { engine.seek(timeOfMeasure(sync, i)); update(); }
    },
    onError: (e) => fail(L.errScore),
  }).then((s) => { score = s; $("[data-zoom-in]").disabled = $("[data-zoom-out]").disabled = false; if (mine >= 0) score.setMyVoice(mine, voiceKeys.length); update(); }, (e) => { console.error(e); fail(L.errScore); });

  // Partitura su carta bianca di default; "Inverti colori" la scurisce (scelta ricordata, se il browser lo permette).
  const scoreBox = $("[data-score]"), invertBtn = $("[data-score-invert]");
  const setInverted = (on, save) => {
    scoreBox.classList.toggle("is-inverted", on);
    invertBtn.setAttribute("aria-pressed", String(on));
    if (save) { try { localStorage.setItem("va-score-inverted", on ? "1" : "0"); } catch { /* storage non disponibile */ } }
  };
  try { setInverted(localStorage.getItem("va-score-inverted") === "1", false); } catch { /* resta su carta bianca */ }
  invertBtn.addEventListener("click", () => setInverted(invertBtn.getAttribute("aria-pressed") !== "true", true));

  // Opzioni della partitura (ricordate nel browser): cursore (si/no e colore) e fascia sulla battuta corrente.
  // Di default il cursore e' acceso e la fascia sulla battuta spenta.
  const optCursor = $("[data-opt-cursor]"), optColor = $("[data-opt-cursor-color]"), optMeasure = $("[data-opt-measure]");
  const OPT_KEY = "va-score-opts";
  const opts = { cursor: true, cursorColor: "#f2a900", measure: false };
  try {
    const s = JSON.parse(localStorage.getItem(OPT_KEY) || "{}");
    if (typeof s.cursor === "boolean") opts.cursor = s.cursor;
    if (typeof s.measure === "boolean") opts.measure = s.measure;
    if (/^#[0-9a-f]{6}$/i.test(s.cursorColor || "")) opts.cursorColor = s.cursorColor;
  } catch { /* opzioni di default */ }
  const applyOpts = (save) => {
    scoreBox.classList.toggle("no-cursor", !opts.cursor);
    scoreBox.classList.toggle("show-measure", opts.measure);
    scoreBox.style.setProperty("--cursor-color", opts.cursorColor);
    optCursor.checked = opts.cursor;
    optColor.value = opts.cursorColor;
    optColor.disabled = !opts.cursor;
    optMeasure.checked = opts.measure;
    if (save) { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch { /* storage non disponibile */ } }
  };
  optCursor.addEventListener("change", () => { opts.cursor = optCursor.checked; applyOpts(true); });
  optColor.addEventListener("input", () => { opts.cursorColor = optColor.value; applyOpts(true); });
  optMeasure.addEventListener("change", () => { opts.measure = optMeasure.checked; applyOpts(true); });
  applyOpts(false);

  $("[data-zoom-in]").addEventListener("click", () => { const z = score?.setZoom(1); if (z) say(L.zoom.replace("{z}", z)); });
  $("[data-zoom-out]").addEventListener("click", () => { const z = score?.setZoom(-1); if (z) say(L.zoom.replace("{z}", z)); });

  // --- mixer e loop
  let mixer = null, loop = null;
  if (isOn("mixer")) mixer = bindMixer($("[data-mixer]"), manifest.tracce, (g) => engine.setGains(g));

  // La propria voce: fascia gialla sul suo rigo, come nei video. Parte quando si sceglie la voce o si preme il pulsante.
  const voiceKeys = manifest.tracce.filter((t) => t.tipo !== "accompagnamento").map((t) => t.chiave);
  const mySelect = $("[data-myvoice-select]");
  let mine = -1;
  const showMine = () => { mine = voiceKeys.indexOf(mySelect.value); score?.setMyVoice(mine, voiceKeys.length); };
  if (mySelect) { mySelect.addEventListener("change", showMine); $("[data-myvoice]")?.addEventListener("click", showMine); }
  if (isOn("loop")) {
    loop = bindLoop({ root: $("[data-loop]"), sync, announce: say, labels: L.loop, onChange: (r) => { if (engine.ctx) engine.setLoop(r); } });
  } else document.querySelectorAll("[data-feature=loop]").forEach((n) => { n.hidden = true; });
  if (!isOn("mixer")) document.querySelectorAll("[data-feature=mixer]").forEach((n) => { n.hidden = true; });
  if (!isOn("tempo")) document.querySelectorAll("[data-feature=tempo]").forEach((n) => { n.hidden = true; });

  // --- trasporto
  function update() {
    // Tempo UDIBILE (motore meno latenza dello stretcher e dell'uscita): evidenziazione, orologio, cursore e scroll
    // seguono quello che si sente. position() resta per la fine del brano (evento "ended") e per seek e loop.
    if (engine.tracks.size) engine.position();
    const pos = engine.tracks.size ? engine.audiblePosition() : 0;
    el.time.textContent = formatClock(pos);
    if (!dragging) el.seek.value = String(pos);
    el.seek.setAttribute("aria-valuetext", `${formatClock(pos)} / ${formatClock(engine.duration || manifest.durata_sec)}`);
    const i = measureIndexAt(sync, pos);
    if (score && sync.battute.length) {
      // Cursore: frazione di tempo nella battuta; per l'ultima, la durata e' quella della precedente (dopo c'e' solo
      // la coda di silenzio, che non si disegna). Prima della prima battuta (lead-in) sta all'inizio.
      const b = sync.battute, k = Math.max(0, i);
      const t1 = k + 1 < b.length ? b[k + 1].t : b[k].t + (k > 0 ? b[k].t - b[k - 1].t : sync.fine - b[k].t);
      score.moveCursor(b[k].m, i < 0 ? 0 : (pos - b[k].t) / Math.max(1e-6, t1 - b[k].t));
    }
    if (i !== currentIdx) {
      currentIdx = i;
      score?.highlight(i >= 0 ? sync.battute[i].m : -1);
      el.seek.dataset.measure = i >= 0 ? sync.battute[i].numero : "";
    }
  }
  let raf = 0, dragging = false;
  const loopTick = () => { update(); raf = engine.playing ? requestAnimationFrame(loopTick) : 0; };
  const setPlayLabel = () => {
    const playing = engine.playing;
    el.play.setAttribute("aria-pressed", String(playing));
    el.play.querySelector("[data-play-label]").textContent = playing ? L.pause : L.play;
    el.play.classList.toggle("is-playing", playing);
  };
  async function toggle() {
    if (el.play.disabled) return;
    if (engine.playing) engine.pause(); else await engine.play();
    setPlayLabel();
    if (!raf) raf = requestAnimationFrame(loopTick);
    update();
  }
  el.play.addEventListener("click", toggle);
  engine.addEventListener("ended", () => { setPlayLabel(); update(); say(L.ended); });
  el.seek.addEventListener("pointerdown", () => { dragging = true; });
  el.seek.addEventListener("pointerup", () => { dragging = false; });
  el.seek.addEventListener("input", () => { engine.seek(+el.seek.value); const was = dragging; dragging = true; update(); dragging = was; });
  el.seek.addEventListener("change", () => { dragging = false; });
  el.speed.addEventListener("input", () => {
    const pct = +el.speed.value;
    engine.setRate(pct / 100);
    el.speedOut.textContent = `${pct}%`;
    el.speed.setAttribute("aria-valuetext", `${pct}%`);
  });
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.("input, select, textarea, button, a, summary, [contenteditable]")) return; // il campo tiene la barra spaziatrice
    e.preventDefault();
    toggle();
  });

  if (new URLSearchParams(location.search).has("debug")) window.__study = { engine, get score() { return score; }, get loop() { return loop; }, get mixer() { return mixer; }, sync };

  // --- audio
  say(L.loading.replace("{n}", 0).replace("{total}", manifest.tracce.length));
  try {
    await engine.init();
    engine.addEventListener("warning", () => say(L.noStretch));
    await engine.load(manifest.tracce, (n, total) => say(L.loading.replace("{n}", n).replace("{total}", total)));
  } catch (e) {
    console.error(e);
    fail(({ network: L.errNetwork, decode: L.errDecode, unsupported: L.errUnsupported }[e.kind]) || L.errNetwork);
    say("");
    return;
  }
  setReady(true);
  if (!engine.stretchOk) { el.speed.disabled = true; say(L.noStretch); }
  el.seek.max = String(engine.duration);
  el.total.textContent = formatClock(engine.duration);
  mixer?.render();
  if (engine.stretchOk) say(L.ready);
  await scorePromise;
  update();
}

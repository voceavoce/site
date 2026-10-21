// Player di studio: collega engine, mixer, loop e partitura alla pagina /player/<slug>/.
import { setAudioBase } from "./config.js";
import { isOn } from "./features.js";
import { StudyEngine, StudyError } from "./engine.js";
import { bindMixer } from "./mixer.js";
import { bindLoop } from "./loop.js";
import { createScore } from "./score.js";
import { measureIndexAt, timeOfMeasure, indexOfScoreMeasure, formatClock, startForPlay } from "./timeline.js";
import { frazioneInBattuta, opzioniPartitura } from "./cursore.js";
import { percentuale, pienoAlPlay } from "./schermo.js";
import { mailSegnalazione } from "./segnalazione.js";
import { creaSuono } from "./suono.js";

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
  // «Segnala un errore nello spartito»: la issue si apre gia' con la battuta in cui si e' arrivati
  const report = $("[data-report]");
  if (report) {
    const aggiorna = () => {
      const d = report.dataset;
      report.href = mailSegnalazione({ email: d.email, titolo: d.titolo, pagina: d.pagina, lingua: d.lingua, battuta: el.seek.dataset.measure });
    };
    for (const ev of ["pointerdown", "focus", "click"]) report.addEventListener(ev, aggiorna);
  }
  const controls = [...document.querySelectorAll("[data-needs-audio]")];
  const setReady = (on) => controls.forEach((c) => { c.disabled = !on; });
  setReady(false);
  el.total.textContent = formatClock(manifest.durata_sec ?? sync.fine);
  el.seek.max = String(manifest.durata_sec ?? sync.fine);

  const engine = new StudyEngine();
  // Modalita' strumenti (note.json + campioni): si cambia fra stem cantati e strumenti; con gli strumenti la velocita' non usa lo stretcher.
  const onMode = () => {
    el.speed.disabled = !engine.speedOk;
    const pct = Math.round(engine.rate * 100);
    el.speed.value = String(pct);
    el.speedOut.textContent = `${pct}%`;
    el.speed.setAttribute("aria-valuetext", `${pct}%`);
  };
  const suono = creaSuono({ data, engine, manifest, say, labels: L, onMode });
  let score = null;
  let currentIdx = -1;

  // --- partitura (in parallelo con l'audio; un suo errore non ferma il player)
  const scorePromise = createScore({
    container: $("[data-score]"),
    xmlUrl: data.scoreUrl,
    voiceLabels: manifest.tracce.filter((t) => t.tipo !== "accompagnamento").map((t) => t.voce),
    onMeasureTap: (m) => {
      if (loop?.tapMeasure(m, Math.max(0, currentIdx))) {
        // scelto un passaggio: la testina va al suo inizio (anche in riproduzione), cosi' si sente e si vede dove si ripete
        const r = loop.range;
        if (r && engine.tracks.size) { engine.seek(r.start); update(); }
        return;
      }
      const i = indexOfScoreMeasure(sync, m, Math.max(0, currentIdx));
      if (i >= 0 && engine.tracks.size) { engine.seek(timeOfMeasure(sync, i)); update(); }
    },
    onError: (e) => fail(L.errScore),
  }).then((s) => { score = s; $("[data-zoom-in]").disabled = $("[data-zoom-out]").disabled = false; if (mine >= 0) score.setMyVoice(mine, voiceKeys.length); update(); }, (e) => { console.error(e); fail(L.errScore); });

  // Opzioni della partitura (pulsante "Opzioni" -> riquadro), ricordate nel browser. Di default: partitura su carta
  // bianca, fascia gialla sulla propria parte e cursore accesi, fascia sulla battuta corrente spenta.
  const scoreBox = $("[data-score]");
  const optBtn = $("[data-score-options-toggle]"), optBox = $("[data-score-options]");
  // I pulsanti «Opzioni» e «Ripeti» aprono e chiudono ciascuno il proprio riquadro sopra la partitura.
  for (const [btn, box] of [[optBtn, optBox], [$("[data-loop-open]"), $("[data-loop]")]]) {
    btn.addEventListener("click", () => {
      const open = box.hidden;
      box.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
  }
  const optMyPart = $("[data-opt-mypart]"), optCursor = $("[data-opt-cursor]"), optColor = $("[data-opt-cursor-color]");
  const optMeasure = $("[data-opt-measure]"), optInvert = $("[data-opt-invert]"), optFsPlay = $("[data-opt-fullscreen-play]");
  const OPT_KEY = "va-score-opts";
  let saved = null;
  try { saved = localStorage.getItem(OPT_KEY); } catch { /* storage non disponibile */ }
  const opts = opzioniPartitura(saved);
  const applyOpts = (save) => {
    scoreBox.classList.toggle("no-myband", !opts.myPart);
    scoreBox.classList.toggle("no-cursor", !opts.cursor);
    scoreBox.classList.toggle("show-measure", opts.measure);
    scoreBox.classList.toggle("is-inverted", opts.invert);
    scoreBox.style.setProperty("--cursor-color", opts.cursorColor);
    optMyPart.checked = opts.myPart;
    optCursor.checked = opts.cursor;
    optColor.value = opts.cursorColor;
    optColor.disabled = !opts.cursor;
    optMeasure.checked = opts.measure;
    optInvert.checked = opts.invert;
    optFsPlay.checked = opts.fullscreenPlay;
    if (save) { try { localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch { /* storage non disponibile */ } }
  };
  optMyPart.addEventListener("change", () => { opts.myPart = optMyPart.checked; applyOpts(true); });
  optCursor.addEventListener("change", () => { opts.cursor = optCursor.checked; applyOpts(true); });
  optColor.addEventListener("input", () => { opts.cursorColor = optColor.value; applyOpts(true); });
  optMeasure.addEventListener("change", () => { opts.measure = optMeasure.checked; applyOpts(true); });
  optInvert.addEventListener("change", () => { opts.invert = optInvert.checked; applyOpts(true); });
  optFsPlay.addEventListener("change", () => { opts.fullscreenPlay = optFsPlay.checked; applyOpts(true); });
  applyOpts(false);

  $("[data-zoom-in]").addEventListener("click", () => { const z = score?.setZoom(1); if (z) say(L.zoom.replace("{z}", z)); });
  $("[data-zoom-out]").addEventListener("click", () => { const z = score?.setZoom(-1); if (z) say(L.zoom.replace("{z}", z)); });

  // --- partitura a schermo intero: la classe su <html> la porta sopra la pagina (funziona anche su iPhone, dove
  // l'API Fullscreen non c'e'); dove l'API esiste la si usa in piu' per nascondere anche la barra del browser.
  const fsOpen = $("[data-fs-open]"), fsClose = $("[data-fs-close]");
  const htmlEl = document.documentElement;
  const immersive = () => htmlEl.classList.contains("study-immersive");
  const setImmersive = (on) => {
    if (on === immersive()) return;
    htmlEl.classList.toggle("study-immersive", on);
    fsOpen.setAttribute("aria-expanded", String(on));
    fsClose.hidden = !on;
    if (on) {
      try { htmlEl.requestFullscreen?.({ navigationUI: "hide" })?.catch(() => {}); } catch { /* non supportato */ }
      fsClose.focus();
    } else {
      try { if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {}); } catch { /* gia' uscito */ }
      fsOpen.focus();
    }
    say(on ? L.fsOn : L.fsOff);
  };
  fsOpen.addEventListener("click", () => setImmersive(!immersive()));
  fsClose.addEventListener("click", () => setImmersive(false));
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && immersive()) setImmersive(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && immersive()) setImmersive(false); });
  const telefono = () => ({ stretto: matchMedia("(max-width: 40rem)").matches, tocco: matchMedia("(pointer: coarse)").matches });

  // --- mixer e loop
  let mixer = null, loop = null;
  if (isOn("mixer")) mixer = bindMixer($("[data-mixer]"), manifest.tracce, (g) => engine.setGains(g));

  // La propria voce: fascia gialla sul suo rigo, come nei video. Parte quando si sceglie la voce o si preme il pulsante.
  const voiceKeys = manifest.tracce.filter((t) => t.tipo !== "accompagnamento").map((t) => t.chiave);
  const mySelect = $("[data-myvoice-select]");
  let mine = mySelect ? voiceKeys.indexOf(mySelect.value) : -1; // la voce gia' scelta nel menu all'apertura
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
    if (score && sync.battute.length) score.moveCursor(sync.battute[Math.max(0, i)].m, frazioneInBattuta(sync, i, pos));
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
    if (engine.playing) engine.pause();
    else {
      if (pienoAlPlay({ ...telefono(), opzione: opts.fullscreenPlay, attivo: immersive() })) setImmersive(true);
      // con un ripeti acceso e la testina fuori dal passaggio si parte dall'inizio del passaggio, non dal brano
      const da = startForPlay(loop?.range, engine.position());
      if (da !== engine.position()) { engine.seek(da); update(); }
      await engine.play();
    }
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

  // --- audio, con il pannello di caricamento (barra di avanzamento) finche' non e' pronto
  const loader = $("[data-loader]"), bar = $("[data-loader-bar]"), pct = $("[data-loader-pct]"), lcount = $("[data-loader-count]");
  const showProgress = (f, n, total) => {
    const p = percentuale(f, 3); // la barra si muove subito: l'utente vede che sta lavorando
    bar.value = p;
    bar.setAttribute("aria-valuetext", p + "%");
    pct.textContent = p + "%";
    lcount.textContent = L.loading.replace("{n}", n).replace("{total}", total);
  };
  const closeLoader = () => { loader.classList.add("is-done"); setTimeout(() => { loader.hidden = true; }, 300); };
  let fatte = 0;
  let fallbackAttivo = false;
  loader.hidden = false;
  showProgress(0, 0, manifest.tracce.length);
  say(L.loading.replace("{n}", 0).replace("{total}", manifest.tracce.length));
  try {
    await engine.init();
    engine.addEventListener("warning", () => say(L.noStretch));
    if (data.senzaAudio) throw new StudyError("noaudio", "brano senza stem: solo strumenti");
    await engine.load(
      manifest.tracce,
      (n, total) => { fatte = n; say(L.loading.replace("{n}", n).replace("{total}", total)); },
      (f) => showProgress(f, fatte, manifest.tracce.length),
    );
  } catch (e) {
    if (e.kind !== "noaudio") console.error(e);
    // Ultimo anello della catena Opus -> MP3 -> strumenti: se nemmeno l'MP3 si scarica o decodifica, si suonano le note.
    if (e.kind === "unsupported" || !(await suono.fallback())) {
      closeLoader();
      fail(({ network: L.errNetwork, decode: L.errDecode, unsupported: L.errUnsupported }[e.kind]) || L.errNetwork);
      say("");
      return;
    }
    fallbackAttivo = true;
  }
  showProgress(1, manifest.tracce.length, manifest.tracce.length);
  closeLoader();
  setReady(true);
  if (!engine.speedOk) { el.speed.disabled = true; say(L.noStretch); }
  else onMode();
  suono.mostra();
  el.seek.max = String(engine.duration);
  el.total.textContent = formatClock(engine.duration);
  mixer?.render();
  if (fallbackAttivo) say(data.senzaAudio ? L.noAudioYet : L.fallbackInstr);
  else if (engine.stretchOk) say(L.ready);
  await scorePromise;
  update();
}

// Partitura: Verovio (toolkit WASM, caricato SOLO in questa pagina) rende il MusicXML in SVG.
// Adattamento mobile: la larghezza della pagina di Verovio segue il contenitore, zoom a passi, pagine a scorrimento
// verticale. La battuta corrente ha la classe `is-current` sul <g class="measure"> (indice m del sync).
import { abbreviaParti } from "./musicxml.js";
import { puntiPerBattuta, completaBattute, xAlCursore, rigoDellaVoce, battutaAlPunto } from "./cursore.js";

const VEROVIO = new URL("../../vendor/verovio/", import.meta.url);
const px2units = 2.6458; // 1 px CSS = 0,2646 mm = 2,6458 unita' di Verovio a scala 100

export const ZOOM_STEPS = [25, 30, 35, 40, 50, 60, 75, 100];

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export async function createScore({ container, xmlUrl, voiceLabels = [], onMeasureTap, onError }) {
  const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
    import(new URL("verovio-module.mjs", VEROVIO).href),
    import(new URL("verovio.mjs", VEROVIO).href),
  ]);
  const [mod, xml] = await Promise.all([
    createVerovioModule(),
    fetch(xmlUrl).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),
  ]);
  const tk = new VerovioToolkit(mod);
  if (!tk.loadData(abbreviaParti(xml, voiceLabels))) throw new Error("MusicXML non leggibile da Verovio");

  // Zoom iniziale: note ben leggibili senza dover premere A+. Piu' alto sugli schermi larghi (partitura a tutta
  // larghezza), piu' basso sui telefoni. Con A- / A+ si cambia.
  const w0 = container.clientWidth;
  let zoom = w0 >= 800 ? 100 : w0 >= 560 ? 75 : 60;
  let measures = [];
  let current = -1;
  let lastWidth = 0;
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("class", "measure-bg");

  // Cursore (barra verticale che scorre sul sistema, come nei video) e fascia gialla della propria voce.
  // Sono <div> posizionati in coordinate del contenitore (scorrimento compreso), ricalcolati a ogni layout().
  const cursor = document.createElement("div");
  cursor.className = "score-cursor";
  cursor.hidden = true;
  cursor.setAttribute("aria-hidden", "true");
  const bands = [];
  let caselle = [];    // per battuta, dove sta nel contenitore: serve a scegliere la battuta dal punto toccato
  let geo = [];        // per battuta: { q0, q1, p: [{ q, x }], xEnd, top, bottom }
  let lastCursor = null;
  let myStaff = -1;

  function layout() {
    const width = Math.max(240, container.clientWidth);
    lastWidth = width;
    tk.setOptions({
      scale: zoom,
      pageWidth: Math.round((width * px2units * 100) / zoom),
      pageHeight: 60000,
      adjustPageHeight: true,
      breaks: "auto",
      header: "none",
      footer: "none",
      pageMarginLeft: 30, pageMarginRight: 30, pageMarginTop: 40, pageMarginBottom: 40,
      svgViewBox: true,
      svgAdditionalAttribute: [],
    });
    tk.redoLayout();
    const pages = [];
    for (let p = 1; p <= tk.getPageCount(); p++) pages.push(tk.renderToSVG(p));
    container.innerHTML = pages.join("");
    for (const svg of container.querySelectorAll(":scope > svg")) {
      svg.removeAttribute("height"); // l'altezza viene dal viewBox: nessun taglio quando cambia la larghezza
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", container.dataset.label || "");
    }
    for (const inner of container.querySelectorAll("svg svg")) { inner.setAttribute("width", "100%"); inner.setAttribute("height", "100%"); }
    measures = [...container.querySelectorAll("g.measure")];
    container.append(cursor);
    buildGeometry();
    drawBands();
    const keep = current;
    current = -1;
    highlight(keep, false);
    if (lastCursor) moveCursor(lastCursor.m, lastCursor.f);
  }

  // Coordinate di un elemento nel contenitore (px CSS, scorrimento compreso).
  function inContainer(el) {
    const c = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    const ox = c.left + container.clientLeft - container.scrollLeft, oy = c.top + container.clientTop - container.scrollTop;
    return { l: r.left - ox, r: r.right - ox, t: r.top - oy, b: r.bottom - oy };
  }

  // Estensione orizzontale di una battuta = quella delle linee del suo rigo, NON il rettangolo del gruppo: quello include
  // i versi del testo, i trattini dei melismi e le legature, che sconfinano nelle battute vicine (battute sovrapposte).
  function estensione(g) {
    const linee = [...(g.querySelector(":scope > g.staff")?.querySelectorAll(":scope > path") ?? [])].map(inContainer).filter((r) => r.r - r.l > 1);
    if (!linee.length) { const b = inContainer(g); return { l: b.l, r: b.r }; }
    return { l: Math.min(...linee.map((r) => r.l)), r: Math.max(...linee.map((r) => r.r)) };
  }

  // Posizione orizzontale di ogni nota/pausa dalla mappa dei tempi di Verovio (la matematica e' in cursore.js).
  function buildGeometry() {
    let tm = [];
    try { tm = tk.renderToTimemap({ includeMeasures: true, includeRests: true }) || []; } catch { tm = []; }
    const indice = new Map(measures.map((g, i) => [g.id, i]));
    const xDi = (id) => {
      const el = container.querySelector(`[id="${CSS.escape(String(id))}"]`);
      if (!el) return null;
      const r = inContainer(el.querySelector(".notehead") || el);
      return (r.l + r.r) / 2;
    };
    caselle = [];
    measures.forEach((g, i) => {
      const sys = g.closest("g.system");
      if (!sys) return;
      const b = estensione(g), sb = inContainer(sys);
      caselle.push({ i, sistema: sys, l: b.l, r: b.r, t: sb.t, b: sb.b });
    });
    geo = completaBattute(puntiPerBattuta(tm, (id) => indice.get(id), xDi), (i) => {
      const sys = measures[i]?.closest("g.system");
      if (!sys) return null;
      const sb = inContainer(sys);
      return { sistema: sys, top: sb.t, bottom: sb.b, right: estensione(measures[i]).r };
    });
  }

  // Posizione del cursore: `f` (0..1) e' la frazione di tempo trascorsa nella battuta `m`.
  function moveCursor(m, f) {
    lastCursor = { m, f };
    const g = geo[m], x = xAlCursore(g, f, reducedMotion());
    if (x === null) { cursor.hidden = true; return; }
    cursor.style.transform = `translate(${x - 2}px, ${g.top}px)`;
    cursor.style.height = `${g.bottom - g.top}px`;
    cursor.hidden = false;
  }

  // Fascia gialla sul rigo della propria voce, su ogni sistema (idx = posizione della voce dall'alto).
  function drawBands() {
    for (const b of bands) b.remove();
    bands.length = 0;
    if (myStaff < 0) return;
    for (const sys of container.querySelectorAll("svg g.system")) {
      const staves = [...sys.querySelectorAll("g.measure > g.staff")]
        .filter((s) => [...s.parentElement.children].filter((n) => n.matches("g.staff")).indexOf(s) === myStaff);
      if (!staves.length) continue;
      const rs = staves.map(inContainer), sb = inContainer(sys);
      const foglio = inContainer(container.querySelector("svg"));
      sb.l = Math.max(sb.l, foglio.l); sb.r = Math.min(sb.r, foglio.r); // la fascia non esce mai dal foglio (niente scroll laterale)
      const top = Math.min(...rs.map((r) => r.t)) - 4, bottom = Math.max(...rs.map((r) => r.b)) + 4;
      const band = document.createElement("div");
      band.className = "score-voice-band";
      band.setAttribute("aria-hidden", "true");
      Object.assign(band.style, { left: `${sb.l}px`, top: `${top}px`, width: `${sb.r - sb.l}px`, height: `${bottom - top}px` });
      container.append(band);
      bands.push(band);
    }
  }

  function highlight(m, follow = true) {
    if (m === current) return;
    measures[current]?.classList.remove("is-current");
    bg.remove();
    current = m;
    const el = measures[m];
    if (!el) return;
    el.classList.add("is-current");
    const b = el.getBBox();
    const pad = 80;
    bg.setAttribute("x", b.x - pad / 4);
    bg.setAttribute("y", b.y - pad / 4);
    bg.setAttribute("width", b.width + pad / 2);
    bg.setAttribute("height", b.height + pad / 2);
    el.insertBefore(bg, el.firstChild);
    if (follow) reveal(el);
  }

  // Scroll morbido dentro il contenitore (mai della pagina): la battuta resta nel terzo centrale.
  function reveal(el) {
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const margin = c.height * 0.12;
    if (r.top >= c.top + margin && r.bottom <= c.bottom - margin) return;
    const target = container.scrollTop + (r.top - c.top) - c.height * 0.25;
    container.scrollTo({ top: Math.max(0, target), behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // Il tocco sceglie la battuta dalla POSIZIONE sul sistema, non dal segno colpito: tra le note e sul testo non c'e'
  // niente da colpire. I clic sintetici (tastiera, dispatchEvent: detail 0, senza coordinate) usano il segno colpito.
  container.addEventListener("click", (e) => {
    let m = -1;
    if (e.detail > 0) {
      const c = container.getBoundingClientRect();
      m = battutaAlPunto(caselle, e.clientX - c.left - container.clientLeft + container.scrollLeft, e.clientY - c.top - container.clientTop + container.scrollTop);
    } else {
      const g = e.target.closest?.("g.measure");
      m = g ? measures.indexOf(g) : -1;
    }
    if (m >= 0) onMeasureTap?.(m);
  });

  let timer = 0;
  new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - lastWidth) < 8) return; // l'altezza cambia con la barra del browser: ignora
    clearTimeout(timer);
    timer = setTimeout(() => { try { layout(); } catch (e) { onError?.(e); } }, 200);
  }).observe(container);

  layout();
  return {
    highlight,
    moveCursor,
    // Evidenzia il rigo della voce `idx` (dall'alto), solo se i righi della partitura sono tanti quante le voci
    // (`voices`): altrimenti non si sa quale rigo e' quale e non si evidenzia niente. idx < 0 toglie la fascia.
    setMyVoice(idx, voices) {
      const staves = measures[0]?.querySelectorAll(":scope > g.staff").length ?? 0;
      myStaff = rigoDellaVoce(idx, voices, staves);
      drawBands();
    },
    get measureCount() { return measures.length; },
    get caselle() { return caselle.map(({ i, l, r, t, b }) => ({ i, l, r, t, b })); }, // per i test: dove il codice crede che stia ogni battuta
    get zoom() { return zoom; },
    setZoom(delta) {
      const i = Math.min(ZOOM_STEPS.length - 1, Math.max(0, ZOOM_STEPS.indexOf(zoom) + delta));
      const next = ZOOM_STEPS[i < 0 ? 0 : i];
      if (next === zoom) return zoom;
      zoom = next;
      layout();
      return zoom;
    },
  };
}

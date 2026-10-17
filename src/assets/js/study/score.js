// Partitura: Verovio (toolkit WASM, caricato SOLO in questa pagina) rende il MusicXML in SVG.
// Adattamento mobile: la larghezza della pagina di Verovio segue il contenitore, zoom a passi, pagine a scorrimento
// verticale. La battuta corrente ha la classe `is-current` sul <g class="measure"> (indice m del sync).
const VEROVIO = new URL("../../vendor/verovio/", import.meta.url);
const px2units = 2.6458; // 1 px CSS = 0,2646 mm = 2,6458 unita' di Verovio a scala 100

export const ZOOM_STEPS = [25, 30, 35, 40, 50, 60, 75, 100];

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Le etichette dei righi nei file sono spesso inutili: abbreviazioni uguali per tutte le voci ("Ch"), nome dello
// strumento di sintesi ("ARIA Player"), nomi nascosti. Le sostituisco con la sigla della voce (S, A, T, B, S1...):
// quella del manifest, se le voci sono tante quante le parti (stesso ordine dall'alto); se no l'iniziale del nome della
// parte, ma solo quando le abbreviazioni non sono gia' tutte diverse. Vale sia sul primo rigo sia dai successivi.
// Lo stesso segno di tempo (♩ = 120) puo' essere scritto piu' volte nella stessa battuta e in ogni parte: Verovio li
// disegna tutti uno sopra l'altro. Ne tengo uno per battuta, sulla prima parte che lo ha. Ritorna quanti ne ha tolti.
function senzaTempiRipetuti(doc) {
  const visti = new Set();
  let tolti = 0;
  for (const parte of doc.querySelectorAll("part")) {
    for (const m of parte.querySelectorAll(":scope > measure")) {
      for (const d of m.querySelectorAll(":scope > direction")) {
        const met = d.querySelector("metronome");
        if (!met) continue;
        const chiave = `${m.getAttribute("number")}|${met.textContent.replace(/\s+/g, " ").trim()}`;
        if (visti.has(chiave)) {
          // via solo il segno visibile; l'eventuale <sound tempo> resta (non si disegna)
          const tipo = d.querySelector("direction-type");
          if (d.querySelectorAll("direction-type").length > 1 || d.querySelector("sound")) tipo?.remove(); else d.remove();
          tolti++;
        } else visti.add(chiave);
      }
    }
  }
  return tolti;
}

export function abbreviaParti(xml, voci = []) {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return xml;
    const tolti = senzaTempiRipetuti(doc);
    const parti = [...doc.querySelectorAll("score-part")];
    if (parti.length < 2) return tolti ? new XMLSerializer().serializeToString(doc) : xml;
    let sigle;
    if (voci.length === parti.length) sigle = voci.map(String);
    else {
      const ab = parti.map((p) => p.querySelector("part-abbreviation")?.textContent.trim() ?? "");
      if (ab.every(Boolean) && new Set(ab).size === ab.length) return tolti ? new XMLSerializer().serializeToString(doc) : xml;
      sigle = parti.map((p) => {
        const m = p.querySelector("part-name")?.textContent.trim().match(/^(\p{L})\p{L}*\s*(\d+)?/u);
        return m ? m[1].toUpperCase() + (m[2] || "") : null;
      });
    }
    parti.forEach((p, i) => {
      if (!sigle[i]) return;
      let nome = p.querySelector("part-name");
      if (!nome) { nome = doc.createElement("part-name"); p.prepend(nome); }
      let ab = p.querySelector("part-abbreviation");
      if (!ab) { ab = doc.createElement("part-abbreviation"); nome.after(ab); }
      nome.textContent = ab.textContent = sigle[i];
      nome.removeAttribute("print-object"); // anche il primo rigo, dove il file nasconde il nome
    });
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return xml;
  }
}

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
  let geo = [];        // per battuta: { q0, q1, p: [{ q, x }], xEnd, top, bottom }
  let lastCursor = null;
  let myStaff = -1;
  let myCount = 0;

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

  // Posizione orizzontale di ogni nota/pausa dalla mappa dei tempi di Verovio (qstamp = quarti dall'inizio).
  function buildGeometry() {
    geo = [];
    let tm = [];
    try { tm = tk.renderToTimemap({ includeMeasures: true, includeRests: true }) || []; } catch { tm = []; }
    const indexOf = new Map(measures.map((g, i) => [g.id, i]));
    let cur = -1;
    for (const e of tm) {
      if (e.measureOn !== undefined && indexOf.has(e.measureOn)) {
        cur = indexOf.get(e.measureOn);
        geo[cur] ||= { q0: e.qstamp, p: [] };
      }
      if (cur < 0) continue;
      for (const id of [...(e.on || []), ...(e.restsOn || [])]) {
        const el = container.querySelector(`[id="${id}"]`);
        if (!el) continue;
        const r = inContainer(el.querySelector(".notehead") || el);
        geo[cur].p.push({ q: e.qstamp, x: (r.l + r.r) / 2 });
      }
    }
    for (let i = 0; i < measures.length; i++) {
      const g = geo[i];
      if (!g) continue;
      // note su piu' righi allo stesso istante: una sola posizione (la media)
      const byQ = new Map();
      for (const pt of g.p) (byQ.get(pt.q) || byQ.set(pt.q, []).get(pt.q)).push(pt.x);
      g.p = [...byQ].map(([q, xs]) => ({ q, x: xs.reduce((a, b) => a + b, 0) / xs.length })).sort((a, b) => a.q - b.q);
      const sys = measures[i].closest("g.system"), box = inContainer(measures[i]), sb = inContainer(sys);
      g.top = sb.t; g.bottom = sb.b;
      const next = geo[i + 1], same = next?.p.length && measures[i + 1].closest("g.system") === sys;
      g.q1 = next ? next.q0 : g.q0 + (i > 0 && geo[i - 1] ? g.q0 - geo[i - 1].q0 : 4);
      g.xEnd = same ? next.p[0].x : box.r;
    }
  }

  // Posizione del cursore: `f` (0..1) e' la frazione di tempo trascorsa nella battuta `m`.
  function moveCursor(m, f) {
    lastCursor = { m, f };
    const g = geo[m];
    if (!g || !g.p.length) { cursor.hidden = true; return; }
    const q = g.q0 + Math.min(1, Math.max(0, f)) * (g.q1 - g.q0);
    const P = [...g.p, { q: g.q1, x: g.xEnd }];
    let x = P[0].x;
    for (let k = 0; k < P.length - 1; k++) {
      const a = P[k], b = P[k + 1];
      if (q < a.q) break;
      if (q >= b.q) { x = b.x; continue; }   // segmento gia' percorso
      x = reducedMotion() || b.q <= a.q ? a.x : a.x + (b.x - a.x) * ((q - a.q) / (b.q - a.q));
      break;
    }
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

  container.addEventListener("click", (e) => {
    const g = e.target.closest?.("g.measure");
    if (!g) return;
    const m = measures.indexOf(g);
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
      myStaff = idx >= 0 && staves === voices && idx < staves ? idx : -1;
      myCount = voices;
      drawBands();
    },
    get measureCount() { return measures.length; },
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

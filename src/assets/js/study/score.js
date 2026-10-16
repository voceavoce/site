// Partitura: Verovio (toolkit WASM, caricato SOLO in questa pagina) rende il MusicXML in SVG.
// Adattamento mobile: la larghezza della pagina di Verovio segue il contenitore, zoom a passi, pagine a scorrimento
// verticale. La battuta corrente ha la classe `is-current` sul <g class="measure"> (indice m del sync).
const VEROVIO = new URL("../../vendor/verovio/", import.meta.url);
const px2units = 2.6458; // 1 px CSS = 0,2646 mm = 2,6458 unita' di Verovio a scala 100

export const ZOOM_STEPS = [25, 30, 35, 40, 50, 60, 75, 100];

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export async function createScore({ container, xmlUrl, onMeasureTap, onError }) {
  const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
    import(new URL("verovio-module.mjs", VEROVIO).href),
    import(new URL("verovio.mjs", VEROVIO).href),
  ]);
  const [mod, xml] = await Promise.all([
    createVerovioModule(),
    fetch(xmlUrl).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),
  ]);
  const tk = new VerovioToolkit(mod);
  if (!tk.loadData(xml)) throw new Error("MusicXML non leggibile da Verovio");

  let zoom = 50;
  let measures = [];
  let current = -1;
  let lastWidth = 0;
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("class", "measure-bg");

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
    const keep = current;
    current = -1;
    highlight(keep, false);
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

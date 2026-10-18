// Loop di battute. Le funzioni pure stanno in timeline.js (loopBounds); qui lo stato e la UI.
import { loopBounds, measureLabels, indexOfScoreMeasure } from "./timeline.js";

/**
 * @param {object} o
 * @param {HTMLElement} o.root     contiene select[data-loop-from], select[data-loop-to], [data-loop-toggle] (uno o piu')
 * @param {object} o.sync          sync.json
 * @param {(range:{start:number,end:number,from:number,to:number}|null)=>void} o.onChange  loop attivo o null
 * @param {(msg:string)=>void} [o.announce]
 */
export function bindLoop({ root, sync, onChange, announce = () => {}, labels = {} }) {
  const from = root.querySelector("[data-loop-from]");
  const to = root.querySelector("[data-loop-to]");
  const toggles = [...document.querySelectorAll("[data-loop-toggle]")];
  const pick = document.querySelector("[data-loop-pick]");
  const names = measureLabels(sync);
  let active = false;
  let picking = false; // modalita' «scegli sulla partitura»
  let pending = false; // il prossimo tocco imposta la fine

  for (const sel of [from, to]) {
    sel.replaceChildren(...names.map((n, i) => Object.assign(document.createElement("option"), { value: String(i), textContent: n })));
  }
  from.value = "0";
  to.value = String(names.length - 1);

  const range = () => loopBounds(sync, +from.value, +to.value);

  function emit() {
    const r = range();
    onChange(active && r ? r : null);
    for (const b of toggles) b.setAttribute("aria-pressed", String(active));
    const testo = r ? `${names[r.from]}–${names[r.to]}` : "";
    for (const s of document.querySelectorAll("[data-loop-range]")) {
      // nel pulsante della barra il passaggio si vede solo a ripeti acceso; in quello del riquadro sempre
      s.textContent = !s.closest("[data-loop-open]") || active ? testo : "";
    }
    for (const o of document.querySelectorAll("[data-loop-open]")) o.classList.toggle("is-on", active);
    if (pick) pick.setAttribute("aria-pressed", String(picking));
  }
  function setRange(a, b) {
    const r = loopBounds(sync, a, b);
    from.value = String(r.from);
    to.value = String(r.to);
  }
  function setActive(on) {
    active = !!on;
    emit();
    const r = range();
    if (labels.on) announce(active ? labels.on.replace("{a}", names[r.from]).replace("{b}", names[r.to]) : labels.off);
  }

  from.addEventListener("change", () => { if (+from.value > +to.value) to.value = from.value; emit(); });
  to.addEventListener("change", () => { if (+to.value < +from.value) from.value = to.value; emit(); });
  for (const b of toggles) b.addEventListener("click", () => setActive(!active));
  if (pick) pick.addEventListener("click", () => { picking = !picking; pending = false; emit(); announce(picking ? labels.pickOn : labels.pickOff); });

  return {
    get picking() { return picking; },
    get active() { return active; },
    /** Limiti del passaggio se il ripeti e' acceso, altrimenti null. */
    get range() { return active ? range() : null; },
    setActive,
    /** Tocco su una battuta di partitura (indice `m`). Ritorna true se e' stato consumato dalla scelta del loop. */
    tapMeasure(m, nearIndex) {
      if (!picking) return false;
      const i = indexOfScoreMeasure(sync, m, nearIndex);
      if (i < 0) return true;
      if (!pending) { setRange(i, i); pending = true; } else { setRange(+from.value, i); pending = false; }
      active = true;
      emit();
      announce(labels.range ? labels.range.replace("{a}", names[+from.value]).replace("{b}", names[+to.value]) : "");
      return true;
    },
  };
}

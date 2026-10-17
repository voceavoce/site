// Mixer: stato per traccia (volume, mute, solo) e preset. Le funzioni pure sono testate; la UI e' in bindMixer().

export const MY_VOICE_OTHERS = 0.3;

/** Stato iniziale: tutte le tracce a volume pieno e non mute. L'unico stato di silenzio e' `mute`. */
export function initialMixerState(tracks) {
  return Object.fromEntries(tracks.map((t) => [t.chiave, { volume: 1, mute: false }]));
}

/** Guadagno effettivo di ogni traccia: 0 se e' mute, altrimenti il suo volume. */
export function effectiveGains(state) {
  return Object.fromEntries(Object.entries(state).map(([id, s]) => [id, s.mute ? 0 : clamp01(s.volume)]));
}

/** Preset «La mia voce»: la voce scelta al 100%, le altre al 30%; azzera i mute. */
export function myVoiceState(state, id) {
  return Object.fromEntries(
    Object.keys(state).map((k) => [k, { volume: k === id ? 1 : MY_VOICE_OTHERS, mute: false }]),
  );
}

/** Vero se `id` e' l'unica traccia non mute (e ce n'e' piu' di una): e' lo stato che «Solo» produce. */
export function isSolo(state, id) {
  const ids = Object.keys(state);
  return ids.length > 1 && id in state && ids.every((k) => state[k].mute === (k !== id));
}

/**
 * «Solo»: mette in mute tutte le altre voci e riaccende `id`, cosi' si vede in chiaro cosa suona (per fare un duetto
 * basta togliere il mute a un'altra voce). Se `id` e' gia' l'unica che suona, il secondo tocco rimette tutte in
 * ascolto. I volumi non cambiano. Con una traccia sola, o un `id` sconosciuto, non fa niente.
 */
export function soloState(state, id) {
  if (!(id in state) || Object.keys(state).length < 2) return state;
  const tutte = isSolo(state, id);
  return Object.fromEntries(Object.entries(state).map(([k, s]) => [k, { ...s, mute: tutte ? false : k !== id }]));
}

export function clamp01(x) {
  return Math.min(1, Math.max(0, Number.isFinite(+x) ? +x : 0));
}

/**
 * Collega la UI. `root` contiene [data-track] con: input[data-volume], button[data-mute], button[data-solo],
 * output[data-volume-out]; opzionali select[data-myvoice-select] e button[data-myvoice].
 */
export function bindMixer(root, tracks, onGains) {
  let state = initialMixerState(tracks);
  const rows = new Map([...root.querySelectorAll("[data-track]")].map((r) => [r.dataset.track, r]));

  function render() {
    for (const [id, row] of rows) {
      const s = state[id];
      if (!s) continue;
      const vol = row.querySelector("[data-volume]");
      vol.value = String(Math.round(s.volume * 100));
      vol.setAttribute("aria-valuetext", `${Math.round(s.volume * 100)}%`);
      const out = row.querySelector("[data-volume-out]");
      if (out) out.textContent = `${Math.round(s.volume * 100)}%`;
      row.querySelector("[data-mute]").setAttribute("aria-pressed", String(s.mute));
      row.querySelector("[data-solo]").setAttribute("aria-pressed", String(isSolo(state, id)));
      row.classList.toggle("is-silent", effectiveGains(state)[id] === 0);
    }
    onGains(effectiveGains(state));
  }

  root.addEventListener("input", (e) => {
    const v = e.target.closest?.("[data-volume]");
    if (!v) return;
    state[v.closest("[data-track]").dataset.track].volume = clamp01(v.value / 100);
    render();
  });
  root.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-mute],[data-solo],[data-myvoice]");
    if (!btn) return;
    if (btn.hasAttribute("data-myvoice")) {
      const sel = root.querySelector("[data-myvoice-select]");
      state = myVoiceState(state, sel ? sel.value : tracks[0].chiave);
    } else {
      const id = btn.closest("[data-track]").dataset.track;
      if (btn.hasAttribute("data-solo")) state = soloState(state, id);
      else if (state[id]) state[id].mute = !state[id].mute;
    }
    render();
  });
  render();
  return { get state() { return state; }, render };
}

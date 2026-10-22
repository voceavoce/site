// Pannello di ANTEPRIMA del brano (T-924): solo per le cartelle content/player/_anteprima-<slug>, che in produzione non esistono.
// Mostra il dossier scritto da job_anteprima_brano (AIVideoCreator): tempo, opzioni, sezioni, segnalazioni sulla partitura;
// dà il testo da copiare per Gemini e il blocco di risposta da incollare in chat. Tutto con textContent: i dati non sono HTML.
import { bpmDaVelocita, velocitaPerBpm, indiceBattuta, righeOpzioni, testoRisposta } from "./anteprima-lib.js";

const h = (tag, attrs = {}, ...figli) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const f of figli.flat()) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
};

async function copia(testo, stato) {
  try {
    await navigator.clipboard.writeText(testo);
  } catch {
    const t = h("textarea", { "aria-hidden": "true", style: "position:fixed;opacity:0" });
    t.value = testo;
    document.body.append(t);
    t.select();
    try { document.execCommand("copy"); } catch { /* niente appunti: il testo resta selezionabile nel riquadro */ }
    t.remove();
  }
  stato.textContent = "Copiato.";
  setTimeout(() => { stato.textContent = ""; }, 2500);
}

function sezione(titolo, ...contenuto) {
  const lunga = titolo.startsWith("Segnalazioni") ? " anteprima__sez--lunga" : "";
  return h("section", { class: `anteprima__sez${lunga}` }, h("h3", {}, titolo), ...contenuto);
}

export async function creaAnteprima({ url, sync, vai, speed, engine, senzaAudio = false }) {
  const corpo = document.querySelector("[data-anteprima-body]");
  if (!corpo) return null;
  let dossier;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    dossier = await r.json();
  } catch (e) {
    corpo.replaceChildren(h("p", { class: "study__hint", role: "alert" }, `Dossier non leggibile: ${e.message}`));
    return null;
  }
  const t = dossier.tempo ?? {};
  // soli strumenti: nessun allungamento audio, quindi lo slider copre da un quarto a tre volte il tempo di prova, al decimo di punto:
  // qualunque BPM scritto nel campo si ascolta ESATTO, senza rigenerare l'anteprima (utente 2026-10-22).
  const massimo = senzaAudio ? 300 : 100;
  const minimo = senzaAudio ? 25 : 50;
  const passo = senzaAudio ? 0.1 : 5;
  if (senzaAudio && engine) { engine.maxRate = massimo / 100; engine.minRate = minimo / 100; }
  // prova (utente 2026-10-22: «a orecchio e' palese lo sfasamento»): il pianoforte si stacca prima della nota successiva
  if (senzaAudio && engine) { engine.stacco = 0; engine.allinea = true; if (engine.synth) { engine.synth.stacco = 0; engine.synth.allinea = true; } }
  if (senzaAudio && speed) { speed.min = String(minimo); speed.max = String(massimo); speed.step = String(passo); }
  // questa pagina serve solo a decidere il tempo: il mixer qui non serve (resta nel player vero); il pannello Suono va in fondo (utente 2026-10-22)
  document.querySelectorAll("[data-mixer]").forEach((n) => { n.hidden = true; });
  const pannello = document.querySelector("[data-anteprima]");
  const suono = document.querySelector("[data-sound]");
  if (pannello && suono) { pannello.after(suono); suono.classList.add("anteprima__suono"); }
  const segnate = {};
  const stato = h("p", { class: "anteprima__stato", role: "status", "aria-live": "polite" });
  const live = h("p", { class: "anteprima__live" });
  const tempoCampo = h("input", { id: "ant-tempo", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "per esempio 66" });
  const note = h("textarea", { id: "ant-note", rows: "4", placeholder: "Che cosa non torna: voci, note, ritmo, parole, fermate…" });
  const msgTempo = h("p", { class: "study__hint", "aria-live": "polite" });
  const uscita = h("textarea", { id: "ant-uscita", rows: "10", readonly: true, "aria-label": "Blocco di risposta da incollare in chat" });

  const pct = () => (speed ? Number(speed.value) : 100);
  const aggiorna = () => {
    const p = pct();
    live.textContent = Number.isFinite(t.prova) ? `Velocità del player ${p}% = ${bpmDaVelocita(t.prova, p)} BPM (tempo di prova ${t.prova})` : `Velocità del player ${p}%`;
    uscita.value = testoRisposta({ dossier, tempo: tempoCampo.value, note: note.value, segnate, velocitaPct: p });
  };
  speed?.addEventListener("input", aggiorna);
  tempoCampo.addEventListener("input", aggiorna);
  note.addEventListener("input", aggiorna);

  const provaTempo = () => {
    const bpm = Number(String(tempoCampo.value).replace(",", "."));
    const v = velocitaPerBpm(t.prova, bpm, massimo, minimo, passo);
    if (!v) { msgTempo.textContent = "Scrivi un numero di BPM."; return; }
    if (speed) { speed.value = String(v.pct); speed.dispatchEvent(new Event("input", { bubbles: true })); }
    msgTempo.textContent = v.fuori
      ? `Lo slider va dal ${minimo}% al ${massimo}% del tempo di prova (${t.prova}): per ${bpm} BPM rigenera l'anteprima con --tempo ${bpm}. Ora è al ${v.pct}%.`
      : `Suona a ${bpm} BPM (${v.pct}% del tempo di prova ${t.prova}).`;
    aggiorna();
  };

  const tabella = h("table", { class: "anteprima__tab" },
    h("caption", {}, "Durata a tempi diversi (senza corone)"),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "BPM"), h("th", { scope: "col" }, "Durata"))),
    h("tbody", {}, (t.tabella ?? []).map((r) => h("tr", {}, h("td", {}, r.bpm), h("td", {}, `${Math.floor(r.durata_sec / 60)}:${String(Math.round(r.durata_sec % 60)).padStart(2, "0")}`)))));

  const anomalie = dossier.anomalie?.mostrate ?? [];
  const lista = anomalie.length
    ? h("ul", { class: "anteprima__anom" }, anomalie.map((a, i) => {
        const idx = indiceBattuta(sync, a.battuta);
        const sel = h("select", { id: `ant-an-${i}`, "aria-label": `Esito della segnalazione alla battuta ${a.battuta}`, onchange: (e) => { if (e.target.value) segnate[i] = e.target.value; else delete segnate[i]; aggiorna(); } },
          h("option", { value: "" }, "— scegli —"), h("option", { value: "vera" }, "Sì, è un errore: da correggere"), h("option", { value: "ignora" }, "No, va bene così: ignora"));
        return h("li", {}, h("p", { class: "anteprima__an-testo" }, h("strong", {}, `b. ${a.battuta}`), ` · ${a.parte} · ${a.categoria} (${a.gravita}): ${a.descrizione}`),
          h("div", { class: "anteprima__an-azioni" },
            h("button", { type: "button", class: "tool tool--text", disabled: idx < 0, onclick: () => vai?.(idx) }, "Vai alla battuta"),
            h("label", { for: `ant-an-${i}` }, "È un errore nello spartito? "), sel));
      }))
    : h("p", { class: "study__hint" }, "Nessuna segnalazione sulla partitura.");
  const avvisi = (dossier.anomalie?.avvisi ?? []).map((a) => h("p", { class: "study__hint" }, a));

  const opzioni = h("dl", { class: "anteprima__opz" }, righeOpzioni(dossier.opzioni).flatMap((r) => [h("dt", {}, r.chiave), h("dd", {}, r.valore)]));
  const sezioni = dossier.sezioni?.righe ? h("pre", { class: "anteprima__pre" }, dossier.sezioni.righe.join("\n")) : h("p", { class: "study__hint" }, dossier.sezioni?.errore ?? "Nessuna proposta di sezione.");
  const prompt = h("textarea", { id: "ant-prompt", rows: "6", readonly: true, "aria-label": "Testo da copiare per Gemini" });
  prompt.value = dossier.prompt_gemini ?? "";

  corpo.replaceChildren(
    h("p", {}, h("strong", {}, dossier.brano?.titolo ?? "?"), ` · rank ${dossier.brano?.rank ?? "?"} · ${t.battute} battute, metro ${t.metro} · tempo di prova ${t.prova ?? "—"} (contratto ${t.contratto ?? "—"}, ${t.origine ?? "senza origine"}) · ${Math.floor(t.durata_prova_sec / 60)}:${String(Math.round(t.durata_prova_sec % 60)).padStart(2, "0")}`),
    sezione("Tempo", live, tabella,
      h("label", { class: "sound-pick__opt" }, h("input", { type: "checkbox", checked: true, onchange: (e) => { if (engine) { engine.allinea = e.target.checked; if (engine.synth) engine.synth.allinea = e.target.checked; } } }),
        " Allinea gli attacchi del pianoforte (prova: ferma e riparti dopo averlo cambiato)"),
      h("label", { class: "sound-pick__opt" }, h("input", { type: "checkbox", onchange: (e) => { if (engine) { engine.diagnostico = e.target.checked; if (engine.synth) engine.synth.diagnostico = e.target.checked; } } }),
        " Suono secco di prova (solo per sentire i tempi; ferma e riparti dopo averlo cambiato)"),
      h("div", { class: "field" }, h("label", { for: "ant-tempo" }, "Tempo che vuoi provare o decidere (BPM)"), tempoCampo),
      h("button", { type: "button", class: "tool tool--text", onclick: provaTempo }, "Prova questo tempo"), msgTempo),
    sezione("Sezioni proposte", sezioni),
    sezione("Scelte già nel contratto", opzioni),
    sezione("Segnalazioni sulla partitura",
      h("p", { class: "study__hint" }, "Il programma ha trovato dei punti sospetti. Per ognuno premi «Vai alla battuta», guarda e ascolta, poi rispondi: «Sì, è un errore» = lo correggo nello spartito prima di fare il video; «No, va bene così» = lo ignoro."),
      ...avvisi, lista),
    sezione("Per Gemini", prompt, h("button", { type: "button", class: "tool tool--text", onclick: () => copia(prompt.value, stato) }, "Copia il testo per Gemini")),
    sezione("Osservazioni", h("div", { class: "field" }, h("label", { for: "ant-note" }, "Che cosa hai visto o sentito"), note)),
    sezione("Risposta per Claude", h("p", { class: "study__hint" }, "Incolla questo blocco nella chat: la pagina non scrive nel repo."), uscita,
      h("button", { type: "button", class: "tool tool--text", onclick: () => copia(uscita.value, stato) }, "Copia la risposta")),
    stato,
  );
  aggiorna();
  return { dossier };
}

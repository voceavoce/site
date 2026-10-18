// «Segnala un errore nello spartito»: apre il modulo (una finestra di dialogo) al posto dell'email e lo invia al Worker
// workers/segnala. Se il modulo non c'e' (Worker non configurato) o qualcosa non va, resta l'email gia' scritta.
import { payloadSegnalazione } from "./study/segnalazione.js";

const dialog = document.querySelector("[data-report-dialog]");
const links = [...document.querySelectorAll("[data-report][data-modulo]")];

if (dialog && links.length && typeof dialog.showModal === "function") {
  const form = dialog.querySelector("[data-report-form]");
  const campi = dialog.querySelector("[data-report-fields]");
  const stato = dialog.querySelector("[data-report-status]");
  const invia = dialog.querySelector("[data-report-send]");
  const annulla = dialog.querySelector("[data-report-cancel]");
  const etichettaAnnulla = annulla.textContent;
  const etichettaInvia = invia.textContent;
  let origine = null;

  const mostraErrore = () => {
    stato.textContent = "";
    const [prima, dopo] = dialog.dataset.error.split(dialog.dataset.email);
    const mail = Object.assign(document.createElement("a"), { href: `mailto:${dialog.dataset.email}`, textContent: dialog.dataset.email });
    stato.append(prima ?? "", mail, dopo ?? "");
  };

  const apri = (link) => {
    origine = link;
    form.reset();
    campi.hidden = false;
    invia.hidden = false;
    invia.disabled = false;
    invia.textContent = etichettaInvia;
    annulla.textContent = etichettaAnnulla;
    stato.textContent = "";
    dialog.querySelector("[data-report-title]").textContent = link.dataset.titolo || "";
    const battuta = document.querySelector("[data-seek]")?.dataset.measure || "";
    dialog.querySelector("[data-report-bar]").hidden = !battuta;
    dialog.querySelector("[data-report-bar-n]").textContent = battuta;
    dialog.showModal();
    form.elements.cosa.focus();
  };

  for (const link of links) {
    link.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // aperture in altra scheda: resta l'email
      e.preventDefault();
      apri(link);
    });
  }
  annulla.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => origine?.focus?.());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dati = payloadSegnalazione({
      titolo: origine?.dataset.titolo, pagina: origine?.dataset.pagina, lingua: origine?.dataset.lingua,
      battuta: document.querySelector("[data-seek]")?.dataset.measure,
      cosa: form.elements.cosa.value, contatto: form.elements.contatto.value, sito: form.elements.sito.value,
    });
    if (dati.cosa.length < 3) { stato.textContent = dialog.dataset.short; form.elements.cosa.focus(); return; }
    invia.disabled = true;
    invia.textContent = dialog.dataset.sending;
    stato.textContent = "";
    try {
      const r = await fetch(dialog.dataset.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dati) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error("invio");
      campi.hidden = true;
      invia.hidden = true;
      annulla.textContent = annulla.dataset.close;
      stato.textContent = dialog.dataset.thanks;
    } catch {
      invia.disabled = false;
      invia.textContent = etichettaInvia;
      mostraErrore();
    }
  });
}

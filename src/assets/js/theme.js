// Menu della lingua (details): si chiude con Esc e con un clic fuori. Senza JS resta un details nativo.
(function () {
  var menu = document.querySelector("details.lang-switch");
  if (!menu) return;
  document.addEventListener("click", function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  menu.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); }
  });
})();

// Interruttore tema chiaro/scuro. Miglioramento progressivo: senza JS vale prefers-color-scheme.
(function () {
  var root = document.documentElement;
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  var mq = window.matchMedia("(prefers-color-scheme: dark)");

  function effective() {
    var t = root.getAttribute("data-theme");
    return t === "dark" || t === "light" ? t : mq.matches ? "dark" : "light";
  }
  function sync() { btn.setAttribute("aria-pressed", String(effective() === "dark")); }

  btn.hidden = false;
  sync();
  btn.addEventListener("click", function () {
    var next = effective() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("vav_theme", next); } catch (e) { /* storage non disponibile */ }
    sync();
  });
  if (mq.addEventListener) mq.addEventListener("change", sync);
})();

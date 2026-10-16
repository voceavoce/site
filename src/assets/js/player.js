// Selettore voce e capitoli per il video incorporato (miglioramento progressivo).
(function () {
  var root = document.querySelector("[data-player]");
  var frame = root && root.querySelector("iframe");
  if (!frame) return;
  var base = "https://www.youtube-nocookie.com/embed/";
  var radios = [].slice.call(root.querySelectorAll("input[name=voce]"));
  var chapters = [].slice.call(root.querySelectorAll("[data-chapters]"));
  var picker = root.querySelector(".voice-picker");
  var links = root.querySelector("[data-links]");
  var current;

  function show(r, replace) {
    current = r;
    frame.src = base + r.getAttribute("data-id");
    frame.title = root.getAttribute("data-title").replace("{voice}", r.getAttribute("data-name"));
    chapters.forEach(function (c) { c.hidden = c.getAttribute("data-chapters") !== r.value; });
    if (replace && window.history && history.replaceState) {
      var u = new URL(location.href);
      u.searchParams.set("voce", r.value);
      history.replaceState(null, "", u);
    }
  }

  if (picker) picker.hidden = false;
  if (links) links.hidden = true;
  radios.forEach(function (r) {
    r.addEventListener("change", function () { if (r.checked) show(r, true); });
  });
  var want = new URLSearchParams(location.search).get("voce");
  var init = radios.filter(function (r) { return r.value === want; })[0] || radios.filter(function (r) { return r.checked; })[0];
  if (init) { init.checked = true; if (init !== radios[0]) show(init, false); else current = init; }
  chapters.forEach(function (c) { c.hidden = !current || c.getAttribute("data-chapters") !== current.value; });

  root.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-t]");
    if (!a || !current || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    frame.src = base + current.getAttribute("data-id") + "?start=" + a.getAttribute("data-t") + "&autoplay=1";
    frame.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
})();

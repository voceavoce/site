// Ricerca interna (B7): UI accessibile sopra l'API di Pagefind. Miglioramento progressivo:
// senza JS la pagina mostra solo la spiegazione e gli indici.
(function () {
  "use strict";
  var app = document.querySelector("[data-search-app]");
  if (!app) return;

  var T = {};
  try { T = JSON.parse(app.getAttribute("data-t") || "{}"); } catch (e) { /* stringhe mancanti: ripiego vuoto */ }
  var FILTERS = ["compositore", "linea", "voce", "stagione", "genere"];
  var TOP_COMPOSERS = 8;
  var PAGE = 20;

  var form = app.querySelector("[data-search-form]");
  var input = form.querySelector("input[name=q]");
  var box = app.querySelector("[data-search-filters]");
  var fdet = app.querySelector("[data-search-fdet]");
  var activeEl = app.querySelector("[data-search-active]");
  var resetBtn = app.querySelector("[data-search-reset]");
  var countEl = app.querySelector("[data-search-count]");
  var list = app.querySelector("[data-search-results]");
  var moreWrap = app.querySelector("[data-search-more]");
  var moreBtn = moreWrap.querySelector("button");
  var emptyEl = app.querySelector("[data-search-empty]");
  var nojs = document.querySelector("[data-search-nojs]");

  var pf = null, totals = null;
  var checks = {}; // nome filtro -> [{input, count, value}]
  var current = null; // risultati dell'ultima ricerca
  var shown = 0;
  var token = 0;
  var timer = 0;

  function fmt(s, n) { return String(s || "").replace("{n}", n); }

  // ---- Stato nell'URL ----
  function readUrl() {
    var p = new URLSearchParams(location.search);
    var st = { q: (p.get("q") || "").trim(), f: {} };
    FILTERS.forEach(function (k) { var v = p.getAll(k).filter(Boolean); if (v.length) st.f[k] = v; });
    return st;
  }
  function readUi() {
    var st = { q: input.value.trim(), f: {} };
    FILTERS.forEach(function (k) {
      var on = (checks[k] || []).filter(function (c) { return c.input.checked; }).map(function (c) { return c.value; });
      if (on.length) st.f[k] = on;
    });
    return st;
  }
  function writeUrl(st) {
    var p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    FILTERS.forEach(function (k) { (st.f[k] || []).forEach(function (v) { p.append(k, v); }); });
    var qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch (e) { /* ignora */ }
  }
  var hasFilters = function (st) { return Object.keys(st.f).length > 0; };

  // ---- Estratto: solo testo e <mark> ----
  function safeExcerpt(html) {
    var frag = document.createDocumentFragment();
    var tpl = document.createElement("template");
    tpl.innerHTML = html || "";
    Array.prototype.forEach.call(tpl.content.childNodes, function (n) {
      if (n.nodeType === 1 && n.nodeName === "MARK") {
        var m = document.createElement("mark");
        m.textContent = n.textContent;
        frag.appendChild(m);
      } else {
        frag.appendChild(document.createTextNode(n.textContent));
      }
    });
    return frag;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---- Filtri ----
  function buildFilters(avail, selected) {
    box.textContent = "";
    FILTERS.forEach(function (name) {
      var values = avail[name];
      if (!values) return;
      var names = Object.keys(values);
      if (!names.length) return;
      var fs = el("fieldset", "search-fs");
      fs.appendChild(el("legend", "", T["f_" + name] || name));
      checks[name] = [];
      var sel = selected[name] || [];
      var ordered = names.slice().sort(function (a, b) { return values[b] - values[a] || a.localeCompare(b); });
      var head = ordered, rest = [];
      if (name === "compositore" && ordered.length > TOP_COMPOSERS + 1) {
        head = ordered.slice(0, TOP_COMPOSERS);
        // eventuali compositori scelti restano in vista
        sel.forEach(function (v) { if (head.indexOf(v) < 0) head.push(v); });
        rest = ordered.filter(function (v) { return head.indexOf(v) < 0; }).sort(function (a, b) { return a.localeCompare(b); });
      }
      var wrap = el("div", "search-opts");
      head.forEach(function (v) { wrap.appendChild(option(name, v, values[v], sel)); });
      fs.appendChild(wrap);
      if (rest.length) {
        var det = el("details", "search-more");
        det.appendChild(el("summary", "", fmt(T.otherComposers, rest.length)));
        var w2 = el("div", "search-opts");
        rest.forEach(function (v) { w2.appendChild(option(name, v, values[v], sel)); });
        det.appendChild(w2);
        fs.appendChild(det);
      }
      box.appendChild(fs);
    });
  }
  var uid = 0;
  function option(name, value, count, sel) {
    var id = "f" + (++uid);
    var lab = el("label", "search-opt");
    lab.setAttribute("for", id);
    var cb = el("input");
    cb.type = "checkbox"; cb.id = id; cb.name = name; cb.value = value;
    cb.checked = sel.indexOf(value) >= 0;
    var n = el("span", "search-opt__n", "(" + count + ")");
    lab.appendChild(cb);
    lab.appendChild(el("span", "search-opt__t", value));
    lab.appendChild(n);
    checks[name].push({ input: cb, count: n, value: value });
    return lab;
  }
  function updateCounts(counts) {
    FILTERS.forEach(function (name) {
      (checks[name] || []).forEach(function (c) {
        var n = counts && counts[name] && counts[name][c.value] != null ? counts[name][c.value] : 0;
        c.count.textContent = "(" + n + ")";
      });
    });
  }

  // ---- Ricerca e risultati ----
  function pfFilters(st) {
    var out = {};
    Object.keys(st.f).forEach(function (k) { out[k] = { any: st.f[k] }; });
    return out;
  }
  function setCount(n) {
    countEl.textContent = n === 0 ? T.count0 : n === 1 ? T.count1 : fmt(T.countN, n);
  }
  function clearResults() {
    list.textContent = "";
    moreWrap.hidden = true;
    emptyEl.hidden = true;
    current = null;
    shown = 0;
  }

  async function run() {
    var st = readUi();
    writeUrl(st);
    resetBtn.hidden = !(st.q || hasFilters(st));
    var nAct = Object.keys(st.f).reduce(function (a, k) { return a + st.f[k].length; }, 0);
    activeEl.textContent = nAct ? "\u00a0(" + nAct + ")" : "";
    var my = ++token;
    if (!st.q && !hasFilters(st)) {
      clearResults();
      countEl.textContent = T.hint;
      updateCounts(totals);
      return;
    }
    var res;
    try {
      res = await pf.search(st.q || null, { filters: pfFilters(st) });
    } catch (e) { fail(); return; }
    if (my !== token) return; // risposta superata da una ricerca piu' recente
    clearResults();
    current = res.results;
    updateCounts(res.filters);
    setCount(current.length);
    emptyEl.hidden = current.length > 0;
    await showMore(false, my);
  }

  async function showMore(moveFocus, my) {
    var slice = current.slice(shown, shown + PAGE);
    var datas = await Promise.all(slice.map(function (r) { return r.data(); }));
    if (my != null && my !== token) return;
    var first = null;
    datas.forEach(function (d) {
      var li = el("li", "search-result");
      var a = el("a", "search-result__title", (d.meta && d.meta.title) || d.url);
      a.href = d.url;
      li.appendChild(a);
      var comp = d.filters && d.filters.compositore && d.filters.compositore[0];
      if (comp) li.appendChild(el("p", "search-result__by", T.by + " " + comp));
      var p = el("p", "search-result__excerpt");
      p.appendChild(safeExcerpt(d.excerpt));
      li.appendChild(p);
      list.appendChild(li);
      if (!first) first = a;
    });
    shown += slice.length;
    moreWrap.hidden = shown >= current.length;
    if (moveFocus && first) first.focus();
  }

  function fail() {
    clearResults();
    countEl.textContent = T.error;
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(run, 250); }

  async function init() {
    try {
      pf = await import("/pagefind/pagefind.js");
      await pf.options({ baseUrl: "/" });
      await pf.init();
    } catch (e) { countEl.textContent = T.error; app.hidden = false; if (nojs) nojs.hidden = true; return; }
    var initial = readUrl();
    var f = await pf.filters();
    // conteggi totali = valori noti con il loro numero di pagine
    totals = f;
    buildFilters(f, initial.f);
    // filtri nell'URL non presenti nell'indice: ignorati
    input.value = initial.q;
    if (hasFilters(initial)) fdet.open = true;
    app.hidden = false;
    if (nojs) nojs.hidden = true;
    form.addEventListener("submit", function (e) { e.preventDefault(); clearTimeout(timer); run(); });
    input.addEventListener("input", schedule);
    box.addEventListener("change", function () { clearTimeout(timer); run(); });
    moreBtn.addEventListener("click", function () { showMore(true, token); });
    resetBtn.addEventListener("click", function () {
      input.value = "";
      Object.keys(checks).forEach(function (k) { checks[k].forEach(function (c) { c.input.checked = false; }); });
      run();
      input.focus();
    });
    run();
  }
  init();
})();

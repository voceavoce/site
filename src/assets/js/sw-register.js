// Registra il service worker (installabilita' PWA + offline essenziale). Mai per l'audio: vedi sw-core.js.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
  });
}

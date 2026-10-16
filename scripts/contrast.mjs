// Verifica numerica dei contrasti AA dei token (src/assets/css/main.css). Uso: node scripts/contrast.mjs
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const themes = {
  chiaro: { bg: "#fbf9f4", surface: "#ffffff", surface2: "#f1ede2", text: "#121a2c", muted: "#4a5468", accent: "#7a4a00", accentFill: "#ffc24d", onAccent: "#121a2c", bar: "#788090", focus: "#0b4fc4" },
  scuro: { bg: "#121a2c", surface: "#1a2438", surface2: "#0d1422", text: "#eef0f5", muted: "#aab4c8", accent: "#ffc24d", accentFill: "#ffc24d", onAccent: "#121a2c", bar: "#788090", focus: "#ffd98a" },
};
// [primo piano, sfondo, soglia]  (4.5 testo, 3 componenti non testuali)
const pairs = [
  ["text", "bg", 4.5], ["text", "surface", 4.5], ["muted", "bg", 4.5], ["muted", "surface", 4.5], ["muted", "surface2", 4.5],
  ["accent", "bg", 4.5], ["accent", "surface", 4.5], ["accent", "surface2", 4.5], ["onAccent", "accentFill", 4.5],
  ["bar", "surface", 3], ["focus", "bg", 3], ["text", "surface2", 4.5],
];
let fail = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\nTema ${name}`);
  for (const [f, b, min] of pairs) {
    const r = ratio(t[f], t[b]); const ok = r >= min; if (!ok) fail++;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${f.padEnd(10)} su ${b.padEnd(10)} ${r.toFixed(2)}:1 (min ${min})`);
  }
}
process.exit(fail ? 1 : 0);

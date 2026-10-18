import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const out = {};
for (const [name, vp] of [["375x667", { width: 375, height: 667 }], ["360x640", { width: 360, height: 640 }], ["1280x800", { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 600, hasTouch: vp.width < 600, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8080/player/locus-iste-bruckner/?debug");
  await page.waitForFunction(() => window.__study && window.__study.engine.tracks.size === 4 && window.__study.score, null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const r = await page.evaluate(async () => {
    const tr = document.querySelector(".transport").getBoundingClientRect();
    const de = document.documentElement;
    const sc = document.querySelector("[data-score]");
    const res = { hScroll: de.scrollWidth > de.clientWidth, scrollW: de.scrollWidth, clientW: de.clientWidth, bodyScrollW: document.body.scrollWidth, transportH: Math.round(tr.height), transportTop: Math.round(tr.top) };
    sc.scrollIntoView({ block: "start" }); await new Promise(r => setTimeout(r, 300));
    const s = sc.getBoundingClientRect(); res.score = { top: Math.round(s.top), bottom: Math.round(s.bottom), h: Math.round(s.height), sovrapposta: s.bottom > document.querySelector(".transport").getBoundingClientRect().top + 0.5 };
    const svg = sc.querySelector("svg"); res.svgW = Math.round(svg.getBoundingClientRect().width); res.scoreW = Math.round(s.width); res.scoreHScroll = sc.scrollWidth > sc.clientWidth + 1;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await new Promise(r => setTimeout(r, 1500)); res.scrollY = Math.round(scrollY); res.docH = document.documentElement.scrollHeight;
    const last = [...document.querySelectorAll(".study > *, .study__side > *")].pop().getBoundingClientRect();
    const t2 = document.querySelector(".transport").getBoundingClientRect();
    res.fondoPagina = { ultimoBottom: Math.round(last.bottom), transportTop: Math.round(t2.top), copre: last.bottom > t2.top + 0.5 };
    // il bersaglio piu' piccolo dei controlli
    res.tapMin = Math.min(...[...document.querySelectorAll("button, input[type=range], select")].filter(e => e.offsetParent).map(e => { const b = e.getBoundingClientRect(); return Math.round(Math.min(b.width, b.height)); }));
    return res;
  });
  out[name] = r;
  await page.screenshot({ path: `${process.argv[2]}/m_${name}.png` });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();

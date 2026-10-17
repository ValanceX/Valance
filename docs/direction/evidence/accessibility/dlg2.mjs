import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage(); const ev = (f) => p.evaluate(f);
for (const n of [1, 2, 3]) {
  await p.setContent(`<body><button id=open>open</button><dialog id=d><button id=in>in</button></dialog></body>`);
  await ev(() => { window.log = []; const d = document.getElementById("d"); d.addEventListener("cancel", e => { e.preventDefault(); log.push("cancel"); }); d.addEventListener("close", () => log.push("close")); });
  await p.focus("#open"); await p.click("#open").catch(()=>{}); await ev(() => { const d = document.getElementById("d"); if (!d.open) d.showModal(); });
  for (let i = 0; i < n; i++) await p.keyboard.press("Escape");
  console.log(`Escape x${n}: open=${await ev(() => document.getElementById("d").open)} events=${JSON.stringify(await ev(() => log))}`);
}
await b.close();

import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p=await b.newPage({viewport:{width:800,height:600}});
await p.setContent(`<style>body{margin:0;overflow:hidden}#s{height:100vh;overflow:auto}#in{height:3000px}dialog{width:300px;height:100px}</style><div id=s><div id=in></div></div><dialog id=d>x</dialog>`);
await p.mouse.move(700,500); await p.mouse.wheel(0,300); await p.waitForTimeout(150); console.log('control, no modal',await p.evaluate(()=>s.scrollTop));
await p.evaluate(()=>d.showModal()); await p.mouse.wheel(0,300); await p.waitForTimeout(150); console.log('modal open: wheel over backdrop',await p.evaluate(()=>s.scrollTop));
await p.keyboard.press('PageDown'); await p.waitForTimeout(200); console.log('PageDown',await p.evaluate(()=>s.scrollTop));
await b.close();

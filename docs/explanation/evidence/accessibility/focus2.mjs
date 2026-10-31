import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage();
const ev = (f, a) => p.evaluate(f, a);
console.log("Element.moveBefore:", await ev(() => typeof Element.prototype.moveBefore));
const html = `<body><ul id=l><li id=a><input id=ia></li><li id=b><input id=ib></li><li id=c><input id=ic></li></ul></body>`;
const run = async (how) => { await p.setContent(html); return ev(async (how) => { const l = document.getElementById("l"), a = document.getElementById("a"), ia = document.getElementById("ia"); ia.focus(); ia.value = "typed"; ia.setSelectionRange(2, 4); let blurs = 0; ia.addEventListener("blur", () => blurs++); if (how === "insertBefore") l.insertBefore(a, null); else l.moveBefore(a, null); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return { stillFocused: document.activeElement === ia, active: document.activeElement.tagName, blurs, value: ia.value, sel: [ia.selectionStart, ia.selectionEnd] }; }, how); };
console.log("insertBefore (what the Web PORT uses for a move):", JSON.stringify(await run("insertBefore")));
console.log("moveBefore:", JSON.stringify(await run("moveBefore").catch(e => String(e).slice(0, 80))));
// removal of the focused node: where does focus go, after a frame
await p.setContent(`<body><button id=x>x</button><ul id=l><li id=a><input id=ia></li></ul></body>`);
console.log("focused row removed -> activeElement:", await ev(async () => { document.getElementById("ia").focus(); document.getElementById("a").remove(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.activeElement.tagName; }));
// :focus-visible, mouse vs key
await p.setContent(`<body><button id=fv>b</button><button id=g>g</button></body>`);
await p.click("#fv"); const m = await ev(() => document.getElementById("fv").matches(":focus-visible"));
await p.keyboard.press("Tab"); const k = await ev(() => [document.activeElement.id, document.activeElement.matches(":focus-visible")]);
console.log(":focus-visible after mouse click:", m, "| after Tab ->", JSON.stringify(k));
await b.close();

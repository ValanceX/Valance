import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const kind of ["auto","manual"]) {
  const p = await b.newPage(); const ev=(f,a)=>p.evaluate(f,a);
  await p.setContent(`<body><button id=i popovertarget=m>i</button><div id=m popover=${kind}><button id=in>in</button></div><p id=out>outside text</p></body>`);
  await p.click("#i"); 
  console.log(kind,"open after invoker click:", await ev(()=>document.getElementById("m").matches(":popover-open")), "focus:", await ev(()=>document.activeElement.id));
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  console.log(kind,"after Esc open:", await ev(()=>document.getElementById("m").matches(":popover-open")), "focus:", await ev(()=>document.activeElement.id||document.activeElement.tagName));
  await ev(()=>document.getElementById("m").showPopover());
  await p.click("#out"); await p.waitForTimeout(100);
  console.log(kind,"after outside click open:", await ev(()=>document.getElementById("m").matches(":popover-open")));
  await p.close();
}
await b.close();

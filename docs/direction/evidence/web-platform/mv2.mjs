import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage(); const ev=(f,a)=>p.evaluate(f,a);
const html = `<body><ul id=l><li id=a><input id=ia></li><li id=b><input id=ib></li></ul></body>`;
for (const how of ["moveBefore","insertBefore","none"]) for (const i of [1,2]) {
 await p.setContent(html); await p.focus("#ia"); await p.keyboard.type("hello");
 await ev((how)=>{ window.keys=[]; const e=document.getElementById("ia"); for (const t of ["keydown","beforeinput","input","keyup"]) e.addEventListener(t,ev=>keys.push(t)); const l=document.getElementById("l"),a=document.getElementById("a"); if(how==="moveBefore")l.moveBefore(a,null); else if(how==="insertBefore") l.insertBefore(a,null); },how);
 await p.waitForTimeout(100);
 const st = await ev(()=>{const i=document.getElementById("ia");return {act:document.activeElement.id,sel:[i.selectionStart,i.selectionEnd],value:i.value}});
 await p.keyboard.type("X"); 
 console.log(how, JSON.stringify(st), "-> after typing X value:", await ev(()=>document.getElementById("ia").value), "events", JSON.stringify(await ev(()=>keys)));
}
// moveBefore then re-assert via setSelectionRange
await p.setContent(html); await p.focus("#ia"); await p.keyboard.type("hello");
await ev(()=>{document.getElementById("l").moveBefore(document.getElementById("a"),null); const i=document.getElementById("ia"); i.setSelectionRange(3,5);});
await p.keyboard.type("X"); console.log("moveBefore+setSelectionRange(3,5)+type X:", await ev(()=>document.getElementById("ia").value));
await p.setContent(html); await p.focus("#ia"); await p.keyboard.type("hello");
await ev(()=>{document.getElementById("l").moveBefore(document.getElementById("a"),null); document.getElementById("ia").blur(); document.getElementById("ia").focus();});
await p.keyboard.type("X"); console.log("moveBefore+blur+focus+type X:", await ev(()=>document.getElementById("ia").value));
await b.close();

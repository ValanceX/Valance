import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const p=await b.newPage({viewport:{width:600,height:500}});
const fr=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
for (const [label,inner] of [['abs rows (translate/top) in relative container','abs'],['abs rows with transform translateY','tf']]){
 await p.setContent(`<style>#s{height:300px;overflow:auto}#c{position:relative;height:40000px}.r{position:absolute;left:0;right:0;height:40px}</style><div id=s><div id=c></div></div>`);
 await p.evaluate(m=>{for(let i=100;i<115;i++){const d=document.createElement('div');d.className='r';d.id='r'+i;d.textContent='row '+i; if(m==='abs')d.style.top=i*40+'px'; else {d.style.top='0';d.style.transform=`translateY(${i*40}px)`} c.appendChild(d)} s.scrollTop=4050},inner); await fr();
 const g=()=>p.evaluate(()=>({st:s.scrollTop,top:r101.getBoundingClientRect().top-s.getBoundingClientRect().top}));
 const a=await g();
 await p.evaluate(m=>{c.style.height='40200px'; for(let i=100;i<115;i++){const d=document.getElementById('r'+i); if(m==='abs')d.style.top=(i+5)*40+'px'; else d.style.transform=`translateY(${(i+5)*40}px)`}},inner); await fr();
 console.log(label,JSON.stringify(a),'->',JSON.stringify(await g()),'(anchoring would give st=4250, top -10)');
}
await b.close();

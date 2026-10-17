import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
import http from "node:http"; import fs from "node:fs"; import zlib from "node:zlib";
const types={html:"text/html",js:"text/javascript",wasm:"application/wasm"};
const server=http.createServer((q,r)=>{const u=new URL(q.url,"http://x");const n=u.pathname.slice(1);const f="out/"+n;if(!fs.existsSync(f)){r.writeHead(404);r.end();return}
 r.writeHead(200,{"content-type":types[n.split(".").pop()],"cross-origin-opener-policy":"same-origin","cross-origin-embedder-policy":"require-corp","cache-control":"no-store"});r.end(fs.readFileSync(f));}).listen(0);
const port=server.address().port;
const rss=(pid)=>{const s=fs.readFileSync(`/proc/${pid}/status`,"utf8");const g=k=>Number(s.match(new RegExp(k+":\\s+(\\d+)"))[1])*1024;return {rss:g("VmRSS"),hwm:g("VmHWM")}};
const cases=[["counter","counter.html","Count: 0"],["list1000","list.html?n=1000",null],["list10000","list.html?n=10000",null]];
const out={};
for(const [name,path,txt] of cases){ out[name]=[];
 for(let run=0;run<3;run++){
  const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--enable-precise-memory-info","--js-flags=--expose-gc"]});
  const ctx=await browser.newContext(); const page=await ctx.newPage();
  await page.addInitScript(()=>{window.__mems=[];const rec=(x)=>{try{const e=x&&x.exports||x;if(e&&e.memory instanceof WebAssembly.Memory)window.__mems.push(e.memory)}catch{}};
   const oi=WebAssembly.instantiate;WebAssembly.instantiate=async function(...a){const r=await oi.apply(this,a);rec(r.instance||r);return r};
   const os=WebAssembly.instantiateStreaming;if(os)WebAssembly.instantiateStreaming=async function(...a){const r=await os.apply(this,a);rec(r.instance);return r};
   const OM=WebAssembly.Memory;});
  const cdp=await ctx.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.enable");
  await page.goto(`http://localhost:${port}/${path}`);
  if(txt) await page.waitForFunction(t=>document.body.textContent.includes(t),txt); else await page.waitForFunction(()=>document.querySelectorAll("#root p").length>100);
  await page.waitForTimeout(500);
  const rows=await page.evaluate(()=>document.querySelectorAll("#root p").length);
  await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(200);
  const m=Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(x=>[x.name,x.value]));
  const pi=await cdp.send("Target.getTargetInfo").catch(()=>null);
  const sys=await browser.newBrowserCDPSession(); const procs=(await sys.send("SystemInfo.getProcessInfo")).processInfo;
  const ren=procs.filter(p=>p.type==="renderer"); const rs=ren.map(p=>rss(p.id));
  const wasm=await page.evaluate(()=>window.__mems.map(m=>m.buffer.byteLength));
  const uas=await page.evaluate(async()=>{ if(!performance.measureUserAgentSpecificMemory) return "unavailable"; if(!crossOriginIsolated) return "not-isolated"; try{const r=await performance.measureUserAgentSpecificMemory();return {bytes:r.bytes}}catch(e){return "err:"+e.name+" "+e.message}});
  // one interaction
  let after=null;
  out[name].push({rows,jsHeapUsed:m.JSHeapUsedSize,jsHeapTotal:m.JSHeapTotalSize,nodes:m.Nodes,rendererRSS:rs.map(r=>r.rss),rendererHWM:rs.map(r=>r.hwm),wasmMem:wasm,uas});
  await browser.close();
 }}
fs.writeFileSync("mem-results.json",JSON.stringify(out,null,1));
const mb=x=>(x/1048576).toFixed(1);
for(const [k,v] of Object.entries(out)){ const f=(g)=>{const a=v.map(g);return `${mb(Math.min(...a))}..${mb(Math.max(...a))} (med ${mb(a.sort((x,y)=>x-y)[1])})`};
 console.log(k,"rows",v[0].rows,"| JSHeapUsed MB",f(r=>r.jsHeapUsed),"| wasm MB",f(r=>r.wasmMem.reduce((a,b)=>a+b,0)),"| renderer RSS MB",f(r=>Math.max(...r.rendererRSS)),"| renderer HWM MB",f(r=>Math.max(...r.rendererHWM)),"| uas",JSON.stringify(v.map(r=>r.uas)).slice(0,160));}
server.close();

import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const root=path.resolve("wptsrv");
const srv=http.createServer((q,r)=>{ const p=path.join(root,decodeURIComponent(q.url.split("?")[0])); if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end();} r.writeHead(200,{"content-type":p.endsWith(".js")?"text/javascript":"text/html"}); r.end(fs.readFileSync(p)); }).listen(0);
const port=srv.address().port;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
console.log(await b.version());
for (const f of process.argv.slice(2)) {
  const pg=await b.newPage(); let res;
  try { await pg.goto(`http://localhost:${port}/${f}`); await pg.waitForFunction(()=>window.__wpt,null,{timeout:20000}); res=await pg.evaluate(()=>window.__wpt); } catch(e){ res={status:"HARNESS",tests:[],message:e.message.slice(0,100)}; }
  const c={}; for(const t of res.tests){const k=["PASS","FAIL","TIMEOUT","NOTRUN"][t.status]; c[k]=(c[k]||0)+1;}
  console.log(f.split("/").slice(-2).join("/").padEnd(55), JSON.stringify(c), res.message??"");
  for(const t of res.tests.filter(t=>t.status!==0).slice(0,3)) console.log("    ",["PASS","FAIL","TIMEOUT","NOTRUN"][t.status],t.name,"-",(t.message||"").slice(0,110));
  await pg.close();
}
await b.close(); srv.close();

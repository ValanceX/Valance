import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {SourceMapConsumer}=require("./V/node_modules/.pnpm/source-map-js@1.2.2/node_modules/source-map-js");
const file=process.argv[2];
const js=fs.readFileSync(file,"utf8"); const lines=js.split("\n");
const c=new SourceMapConsumer(JSON.parse(fs.readFileSync(file+".map","utf8")));
const segs=[]; c.eachMapping(m=>segs.push(m));
const by={}; let total=0;
for(let i=0;i<segs.length;i++){const m=segs[i];const n=segs[i+1];
 let len; if(n&&n.generatedLine===m.generatedLine) len=n.generatedColumn-m.generatedColumn; else len=lines[m.generatedLine-1].length-m.generatedColumn;
 let s=m.source||"(none)"; const mm=s.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/); 
 let pkg=mm?mm[1]:(s.includes("packages/")? "workspace:"+(s.match(/packages\/([^/]+)/)||[])[1]: "app:"+(s.includes("examples")?"example":"other"));
 by[pkg]=(by[pkg]||0)+len; total+=len;}
for(const [k,v] of Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,14)) console.log(k.padEnd(34),String(v).padStart(8),(100*v/total).toFixed(1)+"%");
console.log("total mapped",total,"file",js.length);

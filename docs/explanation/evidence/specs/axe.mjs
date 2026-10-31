import { JSDOM } from "jsdom"; import fs from "node:fs"; import { createRequire } from "node:module";
const require=createRequire(import.meta.url); const axeSrc=fs.readFileSync(require.resolve("axe-core/axe.min.js"),"utf8");
for (const f of process.argv.slice(2)) {
  const dom=new JSDOM(fs.readFileSync(f,"utf8"),{runScripts:"outside-only"});
  dom.window.eval(axeSrc);
  const r=await dom.window.axe.run(dom.window.document,{rules:{"color-contrast":{enabled:false}}});
  console.log("==",f,"axe",dom.window.axe.version,"violations:",r.violations.length,"incomplete:",r.incomplete.length,"passes:",r.passes.length);
  for(const v of r.violations) console.log(" V",v.id,"|",v.tags.filter(t=>/wcag|ACT|best/.test(t)).join(","),"|",v.nodes.map(n=>n.html.slice(0,50)).join(" ; "));
  for(const v of r.incomplete) console.log(" ?",v.id,v.nodes.length);
}

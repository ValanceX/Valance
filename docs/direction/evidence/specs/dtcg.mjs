import Ajv from "ajv"; import addFormats from "ajv-formats";
const R="https://raw.githubusercontent.com/design-tokens/community-group/main";
const BASE="https://www.designtokens.org/schemas/2025.10/";
const get=async u=>{const r=await fetch(u); if(!r.ok) throw new Error(u+" "+r.status); return r.json();};
const schemas=new Map(); const queue=["format.json"];
while(queue.length){ const p=queue.pop(); if(schemas.has(p)) continue; const s=await get(`${R}/schemas/src/2025.10/${p}`); schemas.set(p,s);
  const refs=JSON.stringify(s).match(/"\$ref":"https:\/\/www\.designtokens\.org\/schemas\/2025\.10\/[^"#]*/g)||[];
  for(const r of refs) queue.push(r.split("2025.10/")[1]); }
console.log("schemas fetched:",schemas.size);
const ajv=new Ajv({strict:false,allErrors:false}); addFormats(ajv);
for(const [p,s] of schemas) ajv.addSchema(s,BASE+p);
const validate=ajv.getSchema(BASE+"format.json");
const man=await get(`${R}/test-suite/tests/2025.10/format/manifest.json`);
let ok=0,bad=[]; for(const t of man.tests){ const doc=await get(`${R}/test-suite/tests/2025.10/format/${t.input}`); const v=validate(doc); const want=t.type==="PositiveEvaluationTest"; if(v===want) ok++; else bad.push(t.id+" ("+t.type+")"); }
console.log("test-suite format tests:",man.tests.length,"agree:",ok,"disagree:",bad.length, bad.slice(0,5));
// our sample tokens
const sample={color:{$type:"color",accent:{$value:{colorSpace:"oklch",components:[0.62,0.19,255]}}, bad:{$value:"#zzz"}},space:{$type:"dimension",s2:{$value:{value:0.5,unit:"rem"}}, old:{$value:"0.5rem"}}};
for (const k of ["color","space"]) { const d={[k]:sample[k]}; console.log(k, validate(d), validate.errors?.slice(0,2).map(e=>e.instancePath+" "+e.message)); }
const probes={ explicitBadColor:{a:{$type:"color",$value:"#zzz"}}, explicitGoodColor:{a:{$type:"color",$value:{colorSpace:"srgb",components:[1,0,0]}}}, oldStringDimension:{a:{$type:"dimension",$value:"0.5rem"}}, newDimension:{a:{$type:"dimension",$value:{value:0.5,unit:"rem"}}}, badUnit:{a:{$type:"dimension",$value:{value:1,unit:"em"}}}, unknownType:{a:{$type:"nope",$value:1}}, badRef:{a:{$type:"color",$value:"{b"}} , goodRef:{b:{$type:"color",$value:{colorSpace:"srgb",components:[1,0,0]}},a:{$type:"color",$value:"{b}"}}};
for(const [k,d] of Object.entries(probes)) console.log(k.padEnd(20), validate(d), validate.errors?.[0]?.instancePath, validate.errors?.[0]?.message);

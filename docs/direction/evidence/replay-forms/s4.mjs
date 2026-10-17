import { scan, repair, closers, check, tryRender } from "./lib.mjs";
import fs from "node:fs";
const SRC = fs.readFileSync("s1.mjs","utf8").match(/const SRC = `([\s\S]*?)`;/)[1];
const raw = {};
for (let i = 1; i <= SRC.length; i++) { const s = scan(SRC.slice(0,i)).state; const r = await check(SRC.slice(0,i)); const k = r.diagnostics.diagnostics.map(d=>d.code)[0] ?? "ok"; ((raw[s] ??= {})[k] = (raw[s][k] ?? 0) + 1); }
console.log("RAW prefix by lexical state:"); for (const [s,v] of Object.entries(raw)) console.log(" ", s.padEnd(12), JSON.stringify(v));
// attr-string: close the string and tag => what value would show?
let n=0, wrong=0, ex=[];
const finalTitle = "Account summary for the current quarter";
for (let i = 1; i <= SRC.length; i++) { const p = SRC.slice(0,i); const s = scan(p); if (s.state !== "attr-string") continue; 
  const closed = p + '"' + ">" + closers([...s.stack, ["tag","card"]]).replace(/^<\/card>/,"") ; // crude: close string, end tag, close open ancestors
  const src = p + '">' + "</card></page>"; const r = await tryRender(src); n++;
  const t = r.tree?.root?.children?.[0]?.props?.title; if (t !== undefined && t !== finalTitle) { wrong++; if (ex.length<2) ex.push(t); } }
console.log("attr-string prefixes:", n, "closed-and-clean with a value different from final:", wrong, ex);

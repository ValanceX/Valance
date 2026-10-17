import { repair, tryRender, isPrefix } from "./lib.mjs";
import fs from "node:fs";
const SRC = fs.readFileSync("s1.mjs","utf8").match(/const SRC = `([\s\S]*?)`;/)[1];
const full = await tryRender(SRC);
const pre = SRC.slice(0,180); console.log(JSON.stringify(pre.slice(-30)));
const r = await tryRender(repair(pre,"grow").src); console.log(JSON.stringify(repair(pre,"grow").src.slice(-60)));
const txt = (n)=>JSON.stringify(n.children.map(c=>c.text ?? c.component));
console.log(txt(r.tree.root.children[0].children?.[0] ?? r.tree.root));
// surrogate split
const e = SRC.indexOf("🙂");
for (const cut of [e, e+1, e+2]) { const pre = SRC.slice(0,cut); const rp = repair(pre,"grow"); const x = await tryRender(rp.src); console.log("utf16 cut", cut-e, JSON.stringify(pre.slice(-6)), x.codes, x.tree && JSON.stringify(x.tree.root.children[0].children[0].children.at(-1).text.slice(-12))); }
// UTF-8 byte cut: partial multi-byte becomes U+FFFD with TextDecoder default
const buf = Buffer.from(SRC); const eb = buf.indexOf(Buffer.from("🙂"));
for (const k of [1,2,3,4]) { const s = new TextDecoder().decode(buf.subarray(0, eb+k)); const rp = repair(s,"grow"); const x = await tryRender(rp.src); console.log("utf8 bytes of emoji kept", k, x.codes, x.tree && JSON.stringify(x.tree.root.children[0].children[0].children.at(-1).text.slice(-6))); }
// streaming decoder (stream:true) holds the partial bytes
const td = new TextDecoder(); const s2 = td.decode(buf.subarray(0, eb+2), {stream:true}); console.log("streaming decoder, 2 bytes of emoji:", JSON.stringify(s2.slice(-5)));

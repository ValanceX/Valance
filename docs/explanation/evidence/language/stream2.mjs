import { compile } from "@valancex/mesh-compiler";
import fs from "node:fs";
const src = fs.readFileSync("stream.mjs","utf8");
const rec = { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } };
const MODEL = eval("(" + src.match(/JSON\.stringify\((\{ version: 1[\s\S]*?\})\);\nconst SRC/)[1] + ")");
const M = JSON.stringify(MODEL);
const check = (source) => compile({ source, path: "g.mprx", model: { manifest: M, path: "m.json", component: "view" } });
// 1. time to first semantic error
const BAD = `<page>\n  <card title={name} on.click={save()}>\n    <text>hi</text>\n    <card colour="red"></card>\n    <row title={item.label}>x</row>\n    <banner/>\n  </card>\n</page>`;
const r = await check(BAD); console.log("batch:", r.diagnostics.diagnostics.map(d => `${d.code}@${d.span.start.byte}`));
// prefix + closing with a simple repair
function repair(prefix) { let cut = Math.max(prefix.lastIndexOf(">"), prefix.lastIndexOf("}")); if (cut < 0) return null; let p = prefix.slice(0, cut + 1); const st = []; const re = /<\/([a-z-]+)>|<([a-z-]+)(?:[^>]*?)(\/)?>/g; let m; while ((m = re.exec(p))) { if (m[1]) st.pop(); else if (!m[3]) st.push(m[2]); } return p + st.reverse().map(n => `</${n}>`).join(""); }
const seen = new Map();
for (let i = 1; i <= BAD.length; i++) { const rp = repair(BAD.slice(0, i)); if (!rp) continue; const d = (await check(rp)).diagnostics.diagnostics; for (const x of d) if (!seen.has(x.code + x.span.start.byte)) seen.set(x.code + x.span.start.byte, { code: x.code, at: x.span.start.byte, firstPrefix: i }); }
console.log("first prefix length at which each error is reported (error position -> prefix len):", [...seen.values()]);
// 2. hostile inputs
for (const [name, mk] of [["depth 2000", () => "<card>".repeat(2000) + "</card>".repeat(2000)], ["depth 20000", () => "<card>".repeat(20000) + "</card>".repeat(20000)], ["200k siblings", () => "<page>" + "<text>x</text>".repeat(200000) + "</page>"], ["5MB text", () => "<page><text>" + "a".repeat(5e6) + "</text></page>"], ["unterminated string 1MB", () => `<page><card title="` + "a".repeat(1e6)], ["10k attributes", () => "<card " + Array.from({length:10000},(_, i)=>`p${i}="x"`).join(" ") + "/>"]]) {
  const s = mk(); const t = performance.now(); let out;
  try { const x = await check(s); out = x.diagnostics.diagnostics.slice(0,2).map(d => d.code).join(",") || "ok"; } catch (e) { out = "THROW " + String(e).slice(0, 80); }
  console.log(name.padEnd(26), `${(performance.now() - t).toFixed(0)} ms`, out);
}
// 3. injection-shaped values
for (const [n, s] of [["javascript: url in prop", `<page><card title="javascript:alert(1)"></card></page>`], ["script tag", `<page><script>alert(1)</script></page>`], ["html in text", `<page><text>&lt;img onerror=x&gt;<b>x</b></text></page>`], ["call outside commands", `<page><card on.click={fetch("http://x")}></card></page>`], ["expression call", `<page><text>{eval(name)}</text></page>`]]) { const x = await check(s); console.log(n.padEnd(26), x.diagnostics.diagnostics.slice(0,2).map(d => d.code).join(",") || "ok (accepted)"); }

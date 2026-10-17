import { compile } from "@valancex/mesh-compiler";
import fs from "node:fs";
const src = fs.readFileSync("stream.mjs","utf8");
const rec = { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } };
const MODEL = eval("(" + src.match(/JSON\.stringify\((\{ version: 1[\s\S]*?\})\);\nconst SRC/)[1] + ")");
const M = JSON.stringify(MODEL);
const check = (source) => compile({ source, path: "g.mprx", model: { manifest: M, path: "m.json", component: "view" } });

const cases = {
 "depth 500": () => "<card>".repeat(500) + "</card>".repeat(500),
 "20k siblings": () => "<page>" + "<text>x</text>".repeat(20000) + "</page>",
 "200k siblings": () => "<page>" + "<text>x</text>".repeat(200000) + "</page>",
 "5MB text": () => "<page><text>" + "a".repeat(5e6) + "</text></page>",
 "1MB unterminated string": () => `<page><card title="` + "a".repeat(1e6),
 "10k attributes": () => "<card " + Array.from({length:10000},(_, i)=>`p${i}="x"`).join(" ") + "/>",
};
const name = process.argv[2]; const s = cases[name](); const t = performance.now(); let out;
try { const x = await check(s); out = x.diagnostics.diagnostics.slice(0,2).map(d => d.code).join(",") || "ok"; } catch (e) { out = "THROW " + String(e).slice(0, 80); }
console.log(name.padEnd(26), `${(performance.now() - t).toFixed(0)} ms`, out);

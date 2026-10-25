import { compile } from "@valancex/mesh-compiler";
const rec = { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } };
const MODEL = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} },
  text: { props: {}, events: {}, commands: {}, scope: {} },
  card: { props: { title: { type: { kind: "string" }, required: false } }, events: { click: {} }, commands: {}, scope: {} },
  row: { props: { title: { type: { kind: "string" }, required: true } }, events: { press: {} }, commands: {}, scope: {} },
  view: { props: {}, events: {}, commands: { pick: { parameters: [] }, save: { parameters: [] } }, scope: { items: { kind: "list", element: rec }, name: { kind: "string" }, ready: { kind: "boolean" } } },
} });
const SRC = `<page>
  <card title={name} on.click={save()}>
    {#if ready}
      <text>Hello {name}</text>
    {:else}
      <text>Loading</text>
    {/if}
    {#each items as item (item.id)}
      <row title={item.label} on.press={pick()}>{item.label}</row>
    {/each}
  </card>
</page>`;
const check = async (source) => { const r = await compile({ source, path: "g.mprx", model: { manifest: MODEL, path: "m.json", component: "view" } }); return r; };
const full = await check(SRC);
console.log("full source diagnostics:", full.diagnostics.diagnostics.map(d => d.code), "template?", !!full.template);
// every prefix
const codes = {}; let t0 = performance.now(); let maxMs = 0; let crashes = 0;
const first = []; 
for (let i = 1; i <= SRC.length; i++) {
  const s = performance.now();
  try { const r = await check(SRC.slice(0, i)); const cs = r.diagnostics.diagnostics.map(d => d.code); const k = cs.join(",") || "ok"; codes[k] = (codes[k] ?? 0) + 1; if (!first.includes(k)) first.push(k); } catch (e) { crashes++; }
  maxMs = Math.max(maxMs, performance.now() - s);
}
console.log("prefixes", SRC.length, "crashes", crashes, "avg ms", ((performance.now() - t0) / SRC.length).toFixed(2), "max ms", maxMs.toFixed(1));
console.log(Object.entries(codes).sort((a, b) => b[1] - a[1]).slice(0, 12));
// diagnostics on a few mid-token prefixes show span and message
for (const n of [12, 40, 62, 90, 150, 230]) { const r = await check(SRC.slice(0, n)); const d = r.diagnostics.diagnostics; console.log(n, JSON.stringify(SRC.slice(Math.max(0, n - 14), n)), d.map(x => `${x.code}@${x.span.start.byte}`).join(" ")); }
// repair by closing: stack of open constructs from the lexical prefix is done by heuristic: take the last complete-token boundary, then append closers
function repair(prefix) {
  // cut back to the last '>' or '}' (a complete token), then close open tags/blocks
  let cut = Math.max(prefix.lastIndexOf(">"), prefix.lastIndexOf("}"));
  if (cut < 0) return null; let p = prefix.slice(0, cut + 1);
  const stack = []; const re = /<\/([a-z-]+)>|<([a-z-]+)(?:[^>]*?)(\/)?>|\{#(if|each)\b[^}]*\}|\{:else\}|\{\/(if|each)\}/g; let m;
  while ((m = re.exec(p))) { if (m[1]) stack.pop(); else if (m[2]) { if (!m[3]) stack.push(["tag", m[2]]); } else if (m[4]) stack.push(["blk", m[4]]); else if (m[5]) stack.pop(); }
  for (const [k, n] of stack.reverse()) p += k === "tag" ? `</${n}>` : `{/${n}}`;
  return p;
}
let ok = 0, tried = 0, bad = {};
for (let i = 1; i <= SRC.length; i++) { const rp = repair(SRC.slice(0, i)); if (rp == null) continue; tried++; const r = await check(rp); const cs = r.diagnostics.diagnostics.map(d => d.code); if (!cs.length) ok++; else for (const c of cs) bad[c] = (bad[c] ?? 0) + 1; }
console.log("repaired-by-closing prefixes that check clean:", ok, "of", tried, bad);

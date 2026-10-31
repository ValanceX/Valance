import { render, update, updateChanges } from "@valancex/mesh-runtime";
import { compile } from "@valancex/mesh-compiler";
const rec = { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } };
const MODEL = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} },
  row: { props: { title: { type: { kind: "string" }, required: true } }, events: {}, commands: {}, scope: {} },
  view: { props: {}, events: {}, commands: {}, scope: { items: { kind: "list", element: rec }, visible: { kind: "list", element: rec } } },
} });
const full = await compile({ source: '<page>{#each items as item (item.id)}<row title={item.label}>{item.label}</row>{/each}</page>', path: "v.mprx", model: { manifest: MODEL, path: "m.json", component: "view" } });
const win = await compile({ source: '<page>{#each visible as item (item.id)}<row title={item.label}>{item.label}</row>{/each}</page>', path: "v.mprx", model: { manifest: MODEL, path: "m.json", component: "view" } });
const prog = (c) => ({ root: "view", templates: [JSON.stringify(c.template)] });
const mk = (n, changed) => Array.from({ length: n }, (_, id) => ({ id, label: id === changed ? "changed" : `item ${id}` }));
const least = async (runs, f) => { let b = Infinity; for (let i = 0; i < runs; i++) { const s = performance.now(); await f(); b = Math.min(b, performance.now() - s); } return b; };
const N = 10000, W = 50;
const base = { items: mk(N), visible: mk(W) };
const edited = { items: mk(N, 5000), visible: mk(W) }; // a change far outside the window
const scrolled = { items: mk(N), visible: mk(W).map((r) => ({ id: r.id + 10, label: `item ${r.id + 10}` })) };
for (const [name, p, snap] of [["whole list rendered (today)", prog(full), { items: mk(N), visible: [] }], ["window of 50 rendered, whole list still in the snapshot", prog(win), base]]) {
  const renderMs = await least(10, () => render({ program: p, model: MODEL, snapshot: snap }));
  const r = await render({ program: p, model: MODEL, snapshot: snap });
  const treeBytes = JSON.stringify(r.render.tree).length;
  console.log(`${name}: render ${renderMs.toFixed(1)} ms, tree ${treeBytes} bytes`);
}
// A scroll step: the window moves by 10 rows; the whole list is unchanged.
let { render: cur } = await render({ program: prog(win), model: MODEL, snapshot: base });
let flip = false;
const scrollMs = await least(15, async () => { flip = !flip; const n = await update(cur, flip ? scrolled : base); cur.release(); cur = n.render; });
console.log(`scroll step with the whole list in the snapshot (full-snapshot update): ${scrollMs.toFixed(1)} ms`);
let { render: kept } = await render({ program: prog(win), model: MODEL, snapshot: base });
let t = false;
const chMs = await least(15, async () => { t = !t; const n = await updateChanges(kept, { base: kept.version, changes: [{ op: "set", path: ["visible", 0, "label"], value: t ? "x" : "item 0" }] }); kept.release(); kept = n.render; });
console.log(`scroll-like change from the changes form (the list is not re-sent): ${chMs.toFixed(2)} ms`);

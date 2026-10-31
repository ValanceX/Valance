import { render, update, updateChanges, dispatch } from "@valancex/mesh-runtime";
import { compile } from "@valancex/mesh-compiler";
import { createHash } from "node:crypto";
const rec = { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } };
const MODEL = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} },
  row: { props: { title: { type: { kind: "string" }, required: true } }, events: { press: {} }, commands: {}, scope: {} },
  view: { props: {}, events: {}, commands: { pick: { parameters: [] } }, scope: { items: { kind: "list", element: rec } } },
} });
const c = await compile({ source: '<page>{#each items as item (item.id)}<row title={item.label} on.press={pick()}>{item.label}</row>{/each}</page>', path: "v.mprx", model: { manifest: MODEL, path: "m.json", component: "view" } });
console.log(JSON.stringify(c.diagnostics.diagnostics).slice(0,300));
const program = { root: "view", templates: [JSON.stringify(c.template)] };
const mk = (n) => Array.from({ length: n }, (_, id) => ({ id, label: `item ${id}` }));
// A session: a log of snapshot-changes steps (what a host produces), recorded with update path
const steps = [
  [{ op: "set", path: ["items", 1, "label"], value: "edited" }],
  [{ op: "insert", path: ["items", 0], value: { id: 100, label: "new" } }],
  [{ op: "remove", path: ["items", 3] }],
  [{ op: "insert", path: ["items", 2], value: { id: 101, label: "mid" } }, { op: "set", path: ["items", 0, "label"], value: "again" }],
];
const h = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 12);
// apply changes to a plain snapshot, host-side
function apply(snap, changes) {
  const s = structuredClone(snap);
  for (const ch of changes) {
    let t = s; const p = ch.path;
    for (let i = 0; i < p.length - 1; i++) t = t[p[i]];
    const k = p[p.length - 1];
    if (ch.op === "set") t[k] = ch.value; else if (ch.op === "insert") t.splice(k, 0, ch.value); else t.splice(k, 1);
  }
  return s;
}
async function record() {
  const log = { initial: { items: mk(6) }, steps: [], hashes: [], dispatches: [] };
  let { render: cur } = await render({ program, model: MODEL, snapshot: log.initial });
  log.hashes.push(h(cur.tree));
  for (const ch of steps) {
    const n = await updateChanges(cur, { base: cur.version, changes: ch });
    cur.release(); cur = n.render; log.steps.push(ch); log.hashes.push(h(cur.tree));
    log.versions = [...(log.versions ?? []), cur.version];
  }
  return log;
}
const log = await record();
// Replay route A: fresh runtime, same updateChanges chain
async function replayChanges(l) { let { render: cur } = await render({ program, model: MODEL, snapshot: l.initial }); const out = [h(cur.tree)]; for (const ch of l.steps) { const n = await updateChanges(cur, { base: cur.version, changes: ch }); cur.release(); cur = n.render; out.push(h(cur.tree)); } return out; }
// Route B: time travel: render of each past snapshot, never update
async function replayRender(l) { let s = l.initial; const out = []; const r0 = await render({ program, model: MODEL, snapshot: s }); out.push(h(r0.render.tree)); for (const ch of l.steps) { s = apply(s, ch); const r = await render({ program, model: MODEL, snapshot: s }); out.push(h(r.render.tree)); } return out; }
// Route C: whole-snapshot update chain
async function replayUpdate(l) { let s = l.initial; let { render: cur } = await render({ program, model: MODEL, snapshot: s }); const out = [h(cur.tree)]; for (const ch of l.steps) { s = apply(s, ch); const n = await update(cur, s); cur.release(); cur = n.render; out.push(h(cur.tree)); } return out; }
const A = await replayChanges(log), B = await replayRender(log), C = await replayUpdate(log);
console.log("recorded", log.hashes.join(" "));
console.log("changes  ", A.join(" "), JSON.stringify(A) === JSON.stringify(log.hashes));
console.log("render   ", B.join(" "), JSON.stringify(B) === JSON.stringify(log.hashes));
console.log("update   ", C.join(" "), JSON.stringify(C) === JSON.stringify(log.hashes));
console.log("versions recorded", log.versions, "- replayed run versions differ?");
// version numbers in a second process-like run (second record)
const log2 = await record();
console.log("versions 2nd record", log2.versions, "same hashes:", JSON.stringify(log2.hashes) === JSON.stringify(log.hashes));
// dispatch determinism
{ const { render: r } = await render({ program, model: MODEL, snapshot: log.initial });
  const find = (n, acc = []) => { for (const k of n.children ?? []) { if (k.events) acc.push(k); find(k, acc); } return acc; };
  const nodes = find(r.tree.root ?? r.tree); console.log("event nodes", nodes.length, JSON.stringify(nodes[0]?.events));
  const hd = Object.values(nodes[0].events)[0]; const d1 = await dispatch(r, typeof hd === "string" ? hd : hd.handler); const d2 = await dispatch(r, typeof hd === "string" ? hd : hd.handler);
  console.log("dispatch twice equal:", h(d1) === h(d2), JSON.stringify(d1).slice(0, 160)); }

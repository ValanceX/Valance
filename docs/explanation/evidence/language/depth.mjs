import { render } from "@valancex/mesh-runtime";
import { compile } from "@valancex/mesh-compiler";
const D = +process.argv[2]; const K = +(process.argv[3] || 1);
const comp = { props: {}, events: {}, commands: {}, scope: {} };
const components = { box: comp, leaf: comp };
for (let i = 0; i <= D; i++) components["c" + i] = comp;
const MODEL = JSON.stringify({ version: 1, types: {}, components });
const templates = [];
for (let i = 0; i <= D; i++) {
  const inner = i < D ? `<c${i + 1} />` : "end"; const src = "<box>".repeat(K) + inner + "</box>".repeat(K);
  const c = await compile({ source: src, path: `c${i}.mprx`, model: { manifest: MODEL, path: "m.json", component: "c" + i } });
  if (!c.template) { console.log("compile fail", i, JSON.stringify(c).slice(0, 300)); process.exit(1); }
  templates.push(JSON.stringify(c.template));
}
const t0 = performance.now();
try {
  const r = await render({ program: { root: "c0", templates }, model: MODEL, snapshot: {} });
  console.log(D, r.render ? "ok" : "diag " + JSON.stringify(r.diagnostics ?? r).slice(0, 300), (performance.now() - t0).toFixed(0) + "ms");
} catch (e) { console.log(D, "THROW", String(e).slice(0, 200), String(e.cause ?? "").slice(0,300), e.code); }

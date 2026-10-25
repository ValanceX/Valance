import { render, update } from "@valancex/mesh-runtime";
import { compile } from "@valancex/mesh-compiler";
export const rec = { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } };
export const MODEL = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} },
  text: { props: {}, events: {}, commands: {}, scope: {} },
  card: { props: { title: { type: { kind: "string" }, required: false } }, events: { click: {} }, commands: {}, scope: {} },
  row: { props: { title: { type: { kind: "string" }, required: true } }, events: { press: {} }, commands: {}, scope: {} },
  view: { props: {}, events: {}, commands: { pick: { parameters: [] }, save: { parameters: [] } }, scope: { items: { kind: "list", element: rec }, name: { kind: "string" }, ready: { kind: "boolean" } } },
} });
export const SNAP = { items: [{ id: 1, label: "a" }, { id: 2, label: "b" }, { id: 3, label: "c" }], name: "Ann", ready: true };
export const check = (source) => compile({ source, path: "g.mprx", model: { manifest: MODEL, path: "m.json", component: "view" } });
export async function tryRender(source, snap = SNAP) {
  const c = await check(source);
  const codes = c.diagnostics.diagnostics.map(d => d.code);
  if (codes.length || !c.template) return { codes };
  const r = await render({ program: { root: "view", templates: [JSON.stringify(c.template)] }, model: MODEL, snapshot: snap });
  if (!r.render) return { codes: ["render:" + (r.diagnostics?.diagnostics?.map(d => d.code).join(",") ?? "?")] };
  return { codes: [], tree: r.render.tree };
}
// scanner: returns { safe, stackAtSafe, state, textStart }
export function scan(p) {
  let i = 0; const n = p.length; const stack = []; let safe = 0, safeStack = [], state = "text";
  const mark = () => { safe = i; safeStack = stack.slice(); };
  const skipWs = () => { while (i < n && /\s/.test(p[i])) i++; };
  const readStr = () => { // at '"'
    i++; while (i < n) { if (p[i] === "\\") { i += 2; continue; } if (p[i] === '"') { i++; return true; } i++; } return false; };
  const readBrace = () => { // at '{' ; returns true if closed
    i++; while (i < n) { if (p[i] === '"') { if (!readStr()) return false; continue; } if (p[i] === "}") { i++; return true; } i++; } return false; };
  while (i < n) {
    const c = p[i];
    if (c === "<") {
      const st = i;
      if (p[i + 1] === "/") { const m = /^<\/([A-Za-z_][\w-]*)>/.exec(p.slice(i)); if (!m) { state = "endtag"; return { safe, stack: safeStack, state, end: n }; } i += m[0].length; stack.pop(); mark(); continue; }
      const m = /^<([A-Za-z_][\w-]*)/.exec(p.slice(i)); if (!m) { state = "tag-name"; return { safe, stack: safeStack, state }; }
      const name = m[1]; i += m[0].length; if (i >= n) { state = "tag-name"; return { safe, stack: safeStack, state }; }
      // attrs
      for (;;) {
        skipWs(); if (i >= n) { state = "tag-attrs"; return { safe, stack: safeStack, state }; }
        if (p[i] === ">") { i++; stack.push(["tag", name]); mark(); break; }
        if (p[i] === "/") { if (i + 1 >= n) { state = "tag-attrs"; return { safe, stack: safeStack, state }; } if (p[i + 1] === ">") { i += 2; mark(); break; } return { safe, stack: safeStack, state: "bad" }; }
        const a = /^[A-Za-z_][\w.]*/.exec(p.slice(i)); if (!a) return { safe, stack: safeStack, state: "bad" };
        i += a[0].length; if (i >= n) { state = "attr-name"; return { safe, stack: safeStack, state }; }
        skipWs(); if (i >= n) { state = "attr-name"; return { safe, stack: safeStack, state }; }
        if (p[i] !== "=") continue; i++; skipWs(); if (i >= n) { state = "attr-eq"; return { safe, stack: safeStack, state }; }
        if (p[i] === '"') { if (!readStr()) { state = "attr-string"; return { safe, stack: safeStack, state }; } }
        else if (p[i] === "{") { if (!readBrace()) { state = "attr-expr"; return { safe, stack: safeStack, state }; } }
        else return { safe, stack: safeStack, state: "bad" };
      }
      continue;
    }
    if (c === "{") {
      const rest = p.slice(i);
      const head = /^\{([#:\/])/.exec(rest);
      if (!head && rest.length === 1) { state = "brace-open"; return { safe, stack: safeStack, state }; }
      const ok = readBrace(); if (!ok) { state = head ? "block-head" : "text-expr"; return { safe, stack: safeStack, state }; }
      const tok = rest.slice(0, i - (n - rest.length));
      if (head) { if (head[1] === "#") stack.push(["blk", /^\{#(\w+)/.exec(tok)[1]]); else if (head[1] === "/") stack.pop(); }
      mark(); continue;
    }
    // text run
    let j = i; while (j < n && p[j] !== "<" && p[j] !== "{") j++;
    if (j >= n) { state = "text"; i = j; return { safe, stack: safeStack, state, textTail: p.slice(safe) , liveStack: stack.slice()}; }
    i = j; mark();
  }
  return { safe, stack: safeStack, state: "complete", liveStack: stack.slice() };
}
export const closers = (st) => st.slice().reverse().map(([k, n]) => k === "tag" ? `</${n}>` : `{/${n}}`).join("");
// policy token: cut to last complete token. policy grow: also keep a trailing text run.
export function repair(prefix, policy) {
  const s = scan(prefix);
  if (policy === "grow" && s.state === "text") return { src: prefix + closers(s.liveStack), state: s.state };
  return { src: prefix.slice(0, s.safe) + closers(s.stack), state: s.state };
}
// structural prefix: a ⊑ b ignoring keys
export function isPrefix(a, b, allowTextGrowth) {
  if (a.type === "text") return b.type === "text" && (a.text === b.text || (allowTextGrowth && b.text.startsWith(a.text)));
  if (b.type !== "node" || a.component !== b.component) return false;
  if (JSON.stringify(a.props) !== JSON.stringify(b.props)) return false;
  if (JSON.stringify(Object.keys(a.events).sort()) !== JSON.stringify(Object.keys(b.events).sort())) return false;
  const ac = a.children ?? [], bc = b.children ?? []; if (ac.length > bc.length) return false;
  for (let i = 0; i < ac.length; i++) { const last = i === ac.length - 1; if (!isPrefix(ac[i], bc[i], allowTextGrowth && true)) return false; if (!last && ac[i].type==="text" && allowTextGrowth && ac[i].text !== bc[i].text) return false; }
  return true;
}

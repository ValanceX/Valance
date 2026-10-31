import { repair, tryRender, isPrefix, SNAP } from "./lib.mjs";
const CASES = {
 "each, 1-element body": `<page><text>top</text>{#each items as item (item.id)}<row title={item.label}>{item.label}</row>{/each}<text>after</text></page>`,
 "each, 2-element body": `<page><text>top</text>{#each items as item (item.id)}<row title={item.label}>{item.label}</row><text>Item {item.id}</text>{/each}<text>after</text></page>`,
 "if/else (ready=true)": `<page>{#if ready}<text>A</text><text>A2</text>{:else}<text>B</text><text>B2</text>{/if}<text>after</text></page>`,
 "if/else (ready=false)": [`<page>{#if ready}<text>A</text><text>A2</text>{:else}<text>B</text><text>B2</text>{/if}<text>after</text></page>`, { ...SNAP, ready: false }],
 "each > if": `<page>{#each items as item (item.id)}{#if ready}<row title={item.label}>x</row>{:else}<text>no</text>{/if}{/each}</page>`,
 "if > each": `<page>{#if ready}{#each items as item (item.id)}<row title={item.label}>{item.label}</row>{/each}{:else}<text>none</text>{/if}</page>`,
 "each > each(2-el)": `<page>{#each items as a (a.id)}<card>{#each items as b (b.id)}<row title={b.label}>{a.label}</row><text>{b.id}</text>{/each}</card>{/each}</page>`,
};
for (const [name, v] of Object.entries(CASES)) {
  const [SRC, snap] = Array.isArray(v) ? v : [v, SNAP];
  const full = await tryRender(SRC, snap); if (full.codes.length) { console.log(name, "FULL FAILS", full.codes); continue; }
  const tally = {}; const ex = {};
  for (let i = 1; i <= SRC.length; i++) {
    const { src } = repair(SRC.slice(0, i), "grow"); if (!src.trim()) continue;
    const r = await tryRender(src, snap);
    const k = r.codes.length ? "diag:" + r.codes.join(",") : r.tree.root ? (isPrefix(r.tree.root, full.tree.root, false) ? "append-only" : isPrefix(r.tree.root, full.tree.root, true) ? "text-grows" : "NOT-PREFIX") : "?";
    tally[k] = (tally[k] ?? 0) + 1; if (/diag|NOT/.test(k)) (ex[k] ??= []).length < 2 && ex[k].push([i, src.slice(Math.max(0,i-40))]);
  }
  console.log(name.padEnd(24), JSON.stringify(tally)); for (const [k, e] of Object.entries(ex)) console.log("    ", k, JSON.stringify(e.map(x => x[1])).slice(0, 300));
}

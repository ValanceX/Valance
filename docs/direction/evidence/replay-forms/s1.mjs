import { scan, repair, closers, check, tryRender, isPrefix, SNAP } from "./lib.mjs";
const SRC = `<page>
  <card title="Account summary for the current quarter" on.click={save()}>
    <text>Hello {name}, your account is in good standing and nothing needs attention today. Café 🙂 done.</text>
    {#if ready}
      <text>All {name} data is loaded and up to date.</text>
    {:else}
      <text>Loading your details, this can take a moment.</text>
    {/if}
    {#each items as item (item.id)}
      <row title={item.label} on.press={pick()}>{item.label}</row>
    {/each}
  </card>
</page>`;
const full = await tryRender(SRC); console.log("full:", full.codes, !!full.tree);
const stats = {}; const examples = {};
const bump = (st, pol, k, i) => { const key = `${st}|${pol}`; (stats[key] ??= {}); stats[key][k] = (stats[key][k] ?? 0) + 1; (examples[`${key}|${k}`] ??= []).length < 2 && examples[`${key}|${k}`].push(i); };
for (let i = 1; i <= SRC.length; i++) {
  const pre = SRC.slice(0, i);
  for (const pol of ["token", "grow"]) {
    const { src, state } = repair(pre, pol);
    if (!src.trim()) { bump(state, pol, "empty", i); continue; }
    const r = await tryRender(src);
    const k = r.codes.length ? "diag:" + r.codes.join(",") : (r.tree ? (isPrefix(r.tree.root, full.tree.root, false) ? "clean+appendOnly" : isPrefix(r.tree.root, full.tree.root, true) ? "clean+textGrows" : "clean+NOTPREFIX") : "?");
    bump(state, pol, k, i);
  }
}
for (const [k, v] of Object.entries(stats).sort()) console.log(k.padEnd(22), JSON.stringify(v));
console.log(JSON.stringify(Object.fromEntries(Object.entries(examples).filter(([k])=>/diag|NOTPREFIX/.test(k)))));

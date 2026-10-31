import { render, dispatch } from "@valancex/mesh-runtime";
import { compile } from "@valancex/mesh-compiler";
import { createHash } from "node:crypto";
const h = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 12);
const MODEL = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} },
  btn: { props: {label:{type:{kind:"string"},required:false}}, events: { press: {} }, commands: {}, scope: {} },
  view: { props: {}, events: {}, commands: { go:{parameters:[]} }, scope: { secret:{kind:"string"} } },
} });
const c = await compile({ source: '<page>{#if secret == "open"}<btn on.press={go()}/>{/if}<btn label={secret}/></page>', path: "v.mprx", model: { manifest: MODEL, path: "m.json", component: "view" } });
console.log(JSON.stringify(c.diagnostics.diagnostics));
const program = { root: "view", templates: [JSON.stringify(c.template)] };
const real = await render({program, model:MODEL, snapshot:{secret:"open"}});
const red = await render({program, model:MODEL, snapshot:{secret:""}});
console.log("hash real", h(real.render.tree), "hash redacted", h(red.render.tree));
const ev = (t)=>{const o=[];const w=n=>{for(const h of Object.values(n.events??{}))o.push(h);(n.children??[]).forEach(k=>typeof k==="object"&&w(k));};w(t.root??t);return o;};
const hid = ev(real.render.tree)[0]; console.log("real handler", hid);
console.log("dispatch on real:", JSON.stringify((await dispatch(real.render,hid)).intent?.command));
console.log("dispatch same id on redacted-render:", JSON.stringify((await dispatch(red.render,hid)).diagnostics?.diagnostics?.[0]?.code));

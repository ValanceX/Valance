import { render, update, updateChanges, dispatch } from "@valancex/mesh-runtime";
import { compile } from "@valancex/mesh-compiler";
const rec = { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } };
const MODEL = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} },
  row: { props: { title: { type: { kind: "string" }, required: true } }, events: { press: {} }, commands: {}, scope: {} },
  btn: { props: {}, events: { press: {} }, commands: {}, scope: {} },
  view: { props: {}, events: {}, commands: { pick: { parameters: [{name:"id",type:{kind:"number"}}] }, go:{parameters:[]} }, scope: { items: { kind: "list", element: rec }, show:{kind:"boolean"} } },
} });
const c = await compile({ source: '<page>{#if show}<btn on.press={go()}/>{/if}{#each items as item (item.id)}<row title={item.label} on.press={pick(item.id)}>{item.label}</row>{/each}</page>', path: "v.mprx", model: { manifest: MODEL, path: "m.json", component: "view" } });
console.log(JSON.stringify(c.diagnostics.diagnostics).slice(0,400));
const program = { root: "view", templates: [JSON.stringify(c.template)] };
const items=[{id:1,label:"a"},{id:2,label:"b"},{id:3,label:"c"}];
let {render:r0} = await render({program, model:MODEL, snapshot:{items, show:true}});
const handlers=(t)=>{const out=[];const w=n=>{for(const [e,h] of Object.entries(n.events??{}))out.push([n.component,e,typeof h==="string"?h:h.handler??h, n.key]);(n.children??[]).forEach(k=>typeof k==="object"&&w(k));};w(t.root??t);return out;};
const hs=handlers(r0.tree); console.log(hs.map(x=>x.slice(0,3).join(" ")));
const hBtn=hs.find(x=>x[0]==="btn")[2], hRow2=hs.filter(x=>x[0]==="row")[1][2];
const show=(l,x)=>console.log(l, JSON.stringify(x).slice(0,300));
show("fresh row2 #1", await dispatch(r0,hRow2));
show("fresh row2 #2 (twice)", await dispatch(r0,hRow2));
// tree changes: remove item 2 and show=false
const n = await updateChanges(r0,{base:r0.version,changes:[{op:"remove",path:["items",1]},{op:"set",path:["show"],value:false}]});
const r1=n.render;
show("OLD render, old handler (renderer still showing old tree)", await dispatch(r0,hRow2));
show("NEW render, removed row handler", await dispatch(r1,hRow2));
show("NEW render, removed btn handler (if false)", await dispatch(r1,hBtn));
show("NEW render twice", await dispatch(r1,hRow2));
show("garbage id", await dispatch(r1,"nonsense"));
show("other-program-shaped id", await dispatch(r1,"hAAAAAAAAAAA."+hRow2.split(".")[1]));
show("payload junk", await dispatch(r0,hRow2,{x:1}));
// released render
r0.release?.();
try{ show("released render", await dispatch(r0,hRow2)); }catch(e){console.log("released render throws", e.name, e.code, e.message.slice(0,100));}
// after re-add item 2 (leaves and returns) - handler id identical?
const n2 = await updateChanges(r1,{base:r1.version,changes:[{op:"insert",path:["items",1],value:{id:2,label:"b"}}]});
show("returned row: same id dispatches in new render", await dispatch(n2.render,hRow2));

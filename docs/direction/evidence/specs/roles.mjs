import { elementRoles, roles } from "aria-query";
import { JSDOM } from "jsdom";
import { getRole } from "dom-accessibility-api";
import fs from "node:fs";
// aria-query: map each element schema {name, attributes[{name,value,constraints}]} -> roles
const rows=[]; for (const [el,rs] of elementRoles.entries()) rows.push({el,rs:[...rs]});
console.log("elementRoles entries:",rows.length);
const find=(name,attrs={})=>rows.filter(r=>r.el.name===name && (r.el.attributes||[]).every(a=>a.value===undefined? (a.name in attrs): attrs[a.name]===a.value)).map(r=>r.rs.join("|"));
// declared table from bets/accessibility.md (Web column -> AccessKit/ARIA role)
const declared = [
 ["heading","h2",{}, "heading"],["paragraph","p",{}, "paragraph"],["list","ul",{}, "list"],["listitem","li",{}, "listitem"],
 ["link","a",{href:"/x"}, "link"],["image","img",{alt:"x"}, "img"],["button","button",{}, "button"],
 ["checkbox","input",{type:"checkbox"}, "checkbox"],["textfield","input",{type:"text"}, "textbox"],["textfield(no type)","input",{}, "textbox"],
 ["radio","input",{type:"radio"}, "radio"],["table","table",{}, "table"],["rowgroup","tbody",{}, "rowgroup"],["row","tr",{}, "row"],["cell","td",{}, "cell"],
 ["columnheader","th",{}, "columnheader"],["dialog","dialog",{}, "dialog"],["nav","nav",{}, "navigation"],["main","main",{}, "main"],
 ["group(vlx-column)","vlx-column",{}, "generic/none"],["text(span)","span",{}, "generic/none"],
];
for (const [prim,el,attrs,want] of declared){
  const d=new JSDOM("<body></body>").window.document; const e=d.createElement(el); for(const[k,v]of Object.entries(attrs)) e.setAttribute(k,v);
  d.body.append(e); if(el==="td"||el==="tr"||el==="th"||el==="tbody"){d.body.innerHTML=`<table><tbody><tr><th>h</th><td>c</td></tr></tbody></table>`;}
  const target = el==="td"||el==="tr"||el==="th"||el==="tbody" ? d.body.querySelector(el) : e;
  const aq=find(el,attrs); const dom=getRole(target);
  const ok = want.includes("/")? (aq.length===0 && dom===null) : (aq.includes(want)||dom===want);
  console.log(prim.padEnd(20), el.padEnd(11), "aria-query:",JSON.stringify(aq).padEnd(24),"dom-a-a:",String(dom).padEnd(11),"declared:",want.padEnd(13), ok?"OK":"MISMATCH");
}
// 22-name role set: which are real ARIA roles
for (const r of ["group","text","heading","paragraph","list","listitem","link","image","img","button","checkbox","textbox","radiogroup","radio","table","row","cell","columnheader","rowheader","rowgroup","status","alert","dialog"]) console.log(r.padEnd(12), roles.has(r)?"in aria-query roles (abstract="+roles.get(r).abstract+")":"NOT an ARIA role");
// name-from per ARIA role
for (const r of ["button","link","checkbox","radio","heading","textbox","radiogroup","status","alert","dialog","table","paragraph","generic","img"]) { const x=roles.get(r); console.log(r.padEnd(11),"nameFrom:",JSON.stringify(x?.nameFrom),"prohibited:",JSON.stringify(x?.prohibitedProps)); }

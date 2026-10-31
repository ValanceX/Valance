import { realizeHtml, attribute as A, booleanAttribute as B, controlled, controlledBoolean } from "@valancex/port-web/server";
import fs from "node:fs";
const klass=A("class"), label=A("aria-label");
const prim = {
  column:{element:"vlx-column"}, row:{element:"vlx-row"},
  heading:{element:"h2",props:{level:A("aria-level")}},
  text:{element:"span"},
  para:{element:"p"},
  list:{element:"ul"}, item:{element:"li"},
  image:{element:"img",props:{src:A("src"),alt:A("alt")}},
  link:{element:"a",props:{href:A("href"),current:A("aria-current")}},
  checkbox:{element:"input",attributes:{type:"checkbox"},props:{checked:controlledBoolean("checked"),label}},
  textfield:{element:"input",props:{value:controlled("value"),placeholder:A("placeholder"),label}},
  button:{element:"button",props:{pressed:A("aria-pressed"),disabled:B("disabled")}},
  main:{element:"main"}, nav:{element:"nav",props:{label}},
};
let n=0; const key=()=>"k"+String(++n).padStart(22,"0");
const node=(component,props={},children=[])=>({type:"node",key:key(),component,props,events:{},children});
const t=s=>({type:"text",key:key(),text:s});
const tree={format:"mesh-render",version:1,root:node("main",{},[
  node("nav",{label:"Primary"},[node("link",{href:"/a",current:"page"},[t("Home")])]),
  node("column",{},[
    node("heading",{level:"2"},[t("Title")]),
    node("para",{},[t("Hello")]),
    node("list",{},[node("item",{},[t("one")]),node("item",{},[t("two")])]),
    node("row",{},[node("text",{},[t("x")]),node("image",{src:"data:image/gif;base64,R0lGODlhAQABAAAAACw=",alt:""})]),
    node("checkbox",{checked:true,label:"Done"},[]),
    node("checkbox",{checked:false},[]),
    node("textfield",{value:"",placeholder:"Your name"},[]),
    node("textfield",{value:"",label:"Name"},[]),
    node("button",{pressed:"false"},[t("Save")]),
    node("button",{},[]),
    node("link",{href:"/x"},[]),
  ])])};
fs.writeFileSync("tree.json",JSON.stringify(tree,null,1));
const html=realizeHtml(tree,prim);
fs.writeFileSync("body.html",html);
fs.writeFileSync("page.html",`<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Sample</title></head>\n<body>\n${html}\n</body>\n</html>\n`);
console.log(html);

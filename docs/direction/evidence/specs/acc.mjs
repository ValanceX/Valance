import { JSDOM } from "jsdom";
import { computeAccessibleName, computeAccessibleDescription, getRole } from "dom-accessibility-api";
import { getRole as _g } from "dom-accessibility-api";
const g = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const cases = { "checkbox label": `<input type=checkbox aria-label="Done">`, "checkbox none": `<input type=checkbox>`, "text placeholder": `<input placeholder="Your name">`, "text none": `<input>`, "button empty": `<button></button>`, "link empty": `<a href="/x"></a>`, "img no alt": `<img src="${g}">`, "img alt empty": `<img src="${g}" alt="">`, "invalid+described": `<input aria-label="Name" aria-invalid="true" aria-describedby="e"><span id=e>Enter your name</span>`, "vlx-column": `<vlx-column><span>a</span></vlx-column>`, "button text":`<button>Save</button>`, "h2 aria-level":`<h2 aria-level="3">T</h2>`, "title only":`<input title="T">`, "label for":`<label for=i>Lbl</label><input id=i>` };
for (const [k,h] of Object.entries(cases)) {
  const d = new JSDOM(`<body>${h}</body>`).window.document;
  const els=[...d.body.querySelectorAll("*")].filter(e=>!["SPAN","LABEL"].includes(e.tagName)||k==="vlx-column");
  const el = d.body.querySelector("input,button,a,img,h2,vlx-column");
  console.log(k.padEnd(18), "role="+getRole(el), "name="+JSON.stringify(computeAccessibleName(el)), "desc="+JSON.stringify(computeAccessibleDescription(el)));
}

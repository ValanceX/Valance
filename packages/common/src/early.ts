// The early-input shell (Bet 14; decisions H2 to H5, H9 to H11): a few hundred bytes of script written into every page's <head>, before the page's own script has arrived. For the second or so
// between the server's HTML being painted and the application starting, a tap on a control does nothing, because nothing is listening yet (measured: 7 of 9 taps in that dead zone were lost). The
// shell listens from the first byte and keeps what a person did, so the client can do it once the application is ready (`replayEarly`, below):
//
//   - a trusted click (a tap, a key press on a focused control) on a control inside the page, in order, at most 20 and none older than 10 seconds when they are replayed; never a link (the browser
//     already navigates it) and never a control marked `earlyInput="drop"` (that one is dropped and shows the busy state: "Pay" and "Like" are both buttons, H9);
//   - the keys Enter and Escape in a text field (H11);
//   - the text of every field whose value differs from the server's, and the caret of the focused one (H4, H10): read once, when hydration begins.
//
// It also starts compiling the WebAssembly runtime as the document is parsed (`compileStreaming`, W11), when the page names it in `<link id="vlx-wasm">`, so the compile overlaps the download of the
// page's script.
//
// The shell is the same bytes in every page, so a Content-Security-Policy can allow it by hash (`vlx build` computes it and writes it into `_headers`) without `'unsafe-inline'`. It decides nothing and has no configuration: PORTs do not
// know it exists (H6), and replay is the composer's feature, done by dispatching ordinary events at the adopted nodes.
/** The shell. Hand-minified; `earlyShellLimit` is its size budget (a test holds it). */
export const earlyShell =
  `(function(d,w){var v=w.__vlx={q:[],busy:[],on:1,wasm:0},l=d.getElementById("vlx-wasm"),T="#app input:not([type=checkbox]):not([type=radio]),#app textarea";` +
  `if(l&&w.WebAssembly&&WebAssembly.compileStreaming)v.wasm=WebAssembly.compileStreaming(fetch(l.href)).catch(function(){});` +
  `function on(t,f){d.addEventListener(t,function(e){v.on&&e.isTrusted&&f(e)},!0)}` +
  `function add(k,n,x){if(v.q.length<20)v.q.push({k:k,n:n,x:x,t:Date.now()})}` +
  `on("click",function(e){var t=e.target.closest&&e.target.closest("a[href],button,[role=button],input,select,textarea,summary,label");` +
  `if(t&&t.tagName=="LABEL")t=t.control;if(!t||t.closest("a[href]")||!t.closest("#app"))return;` +
  `if(t.closest("[data-early-input=drop]")){t.setAttribute("aria-busy","true");v.busy.push(t);return}add("click",t)});` +
  `on("keydown",function(e){var t=e.target;(e.key=="Enter"||e.key=="Escape")&&t.matches&&t.matches(T)&&add("key",t,e.key)});` +
  `v.snap=function(){var f=[],a=d.activeElement;d.querySelectorAll(T).forEach(function(n){n.value!=n.defaultValue&&f.push({n:n,x:n.value})});` +
  `v.fields=f;v.focus=a&&a.matches&&a.matches(T)?{n:a,s:a.selectionStart,e:a.selectionEnd}:0}` +
  `})(document,window);`;

/** The most bytes the shell may have: it is on the critical path of every page (Bet 3, `budgets.json`). */
export const earlyShellLimit = 1500;

/** The markup the server writes in the head: the shell, and, when the page's WebAssembly runtime is at `wasm`, the link the shell compiles it from. */
export const earlyHead = (built: { readonly wasm?: string | undefined }): string =>
  `${built.wasm === undefined ? "" : `<link id="vlx-wasm" rel="preload" as="fetch" type="application/wasm" crossorigin href="${built.wasm}">`}<script>${earlyShell}</script>`;

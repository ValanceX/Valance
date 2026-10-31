import { chromium } from "/opt/node-tools/node_modules/playwright-core/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p=await b.newPage({viewport:{width:600,height:400}});
const css=(fb)=>`
#btn{anchor-name:--a;position:absolute;left:50px;top:TOPpx;width:80px;height:30px}
#pop{position:fixed;margin:0;inset:auto;position-anchor:--a;position-area:bottom span-right;width:120px;height:150px;border:1px solid;padding:0;
 ${fb}}
`;
async function run(label, top, fb, extra=''){
 await p.setContent(`<style>body{margin:0;height:2000px}${css(fb).replace('TOP',top)}${extra}</style><button id=btn popovertarget=pop>x</button><div id=pop popover=manual>hi</div>`);
 await p.evaluate(()=>pop.showPopover());
 const r=await p.evaluate(()=>{const a=btn.getBoundingClientRect(),q=pop.getBoundingClientRect();return {btnTop:a.top,btnBottom:a.bottom,popTop:q.top,popBottom:q.bottom,popLeft:q.left,vh:innerHeight}});
 console.log(label, JSON.stringify(r));
}
console.log('supports', await p.evaluate(()=>[CSS.supports('anchor-name','--a'),CSS.supports('position-area','top'),CSS.supports('position-try-fallbacks','flip-block'),CSS.supports('position-anchor','--a'),CSS.supports('top','anchor(bottom)')]));
await run('no fallback, room below',100,'');
await run('no fallback, button near bottom',340,'');
await run('flip-block, button near bottom',340,'position-try-fallbacks:flip-block;');
await run('flip-block, room below',100,'position-try-fallbacks:flip-block;');
await run('flip-block, pos-visibility no-overflow? not enough room either way (tall)',200,'height:250px;position-try-fallbacks:flip-block;');
await run('flip-block,flip-inline near right edge? left',520,'position-try-fallbacks:flip-block;');
// anchor() style insets instead of position-area
await p.setContent(`<style>body{margin:0;height:2000px}#btn{anchor-name:--a;position:absolute;left:50px;top:340px;width:80px;height:30px}
#pop{position:fixed;margin:0;inset:auto;position-anchor:--a;top:anchor(bottom);left:anchor(left);width:120px;height:150px;position-try-fallbacks:flip-block}</style><button id=btn>x</button><div id=pop popover=manual>hi</div>`);
await p.evaluate(()=>pop.showPopover());
console.log('anchor() insets + flip-block', JSON.stringify(await p.evaluate(()=>{const q=pop.getBoundingClientRect();return {top:q.top,bottom:q.bottom}})));
// horizontal flip
await p.setContent(`<style>body{margin:0}#btn{anchor-name:--a;position:absolute;left:520px;top:100px;width:60px;height:30px}
#pop{position:fixed;margin:0;inset:auto;position-anchor:--a;position-area:bottom span-right;width:150px;height:50px;position-try-fallbacks:flip-inline, flip-block}</style><button id=btn>x</button><div id=pop popover=manual>hi</div>`);
await p.evaluate(()=>pop.showPopover());
console.log('right edge span-right, flip-inline', JSON.stringify(await p.evaluate(()=>{const q=pop.getBoundingClientRect();return {left:q.left,right:q.right,vw:innerWidth}})));
// scroll: anchor scrolls away: popover follows page scroll? popover in top layer positioned relative to anchor
await p.setContent(`<style>body{margin:0;height:3000px}#btn{anchor-name:--a;position:absolute;left:50px;top:100px;width:80px;height:30px}
#pop{position:fixed;margin:0;inset:auto;position-anchor:--a;position-area:bottom span-right;width:120px;height:100px;position-try-fallbacks:flip-block}</style><button id=btn>x</button><div id=pop popover=manual>hi</div>`);
await p.evaluate(()=>pop.showPopover());
await p.evaluate(()=>scrollTo(0,60)); await p.waitForTimeout(100);
console.log('after scroll 60', JSON.stringify(await p.evaluate(()=>({btn:btn.getBoundingClientRect().top,pop:pop.getBoundingClientRect().top}))));
await p.evaluate(()=>scrollTo(0,200)); await p.waitForTimeout(100);
console.log('after scroll 200 (anchor offscreen)', JSON.stringify(await p.evaluate(()=>({btn:btn.getBoundingClientRect().top,pop:pop.getBoundingClientRect().top}))));
// without anchor support emulate: not possible; test fallback placement w/o: pop uses @supports not
await p.setContent(`<style>@supports not (position-area:top){#pop{position:fixed;left:50px;top:100px}}#pop{position-area:bottom}</style><div id=pop popover=manual>hi</div>`);
await b.close();

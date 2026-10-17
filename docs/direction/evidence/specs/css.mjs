import * as csstree from "css-tree"; import fs from "node:fs";
for (const f of process.argv.slice(2)) {
  const src=fs.readFileSync(f,"utf8"); const errs=[];
  const ast=csstree.parse(src,{positions:true,onParseError:e=>errs.push("PARSE "+e.formattedMessage??e.message)});
  csstree.walk(ast,{visit:"Declaration",enter(n){ }});
  const lex=csstree.lexer;
  const bad=[]; csstree.walk(ast,{visit:"Declaration",enter(n,item,list){
     const r=lex.matchDeclaration(n); if(r.error) bad.push(`${n.property}: ${r.error.message.split("\n")[0]} @${n.loc.start.line}`);}});
  csstree.walk(ast,{visit:"Atrule",enter(n){ const r=lex.matchAtrulePrelude?.(n.name,n.prelude); if(r&&r.error) bad.push(`@${n.name}: ${r.error.message.split("\n")[0]}`);} });
  csstree.walk(ast,{visit:"PseudoClassSelector",enter(n){ if(!lex.pseudos ){} }});
  console.log("==",f,"css-tree",csstree.version,"parseErrors:",errs.length,"invalid:",bad.length); errs.forEach(x=>console.log("  ",x)); bad.forEach(x=>console.log("   INVALID",x));
}

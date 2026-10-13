// What importing a template file gives the author's TypeScript: the file's address (see `Template` in src/index.ts, which this is structurally). The bundler (vite.ts) makes the import.
declare module "*.mprx" {
  const template: { readonly mprx: string };
  export default template;
}

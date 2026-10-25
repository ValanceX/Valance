// What importing a template file gives TypeScript: the file's address. (The bundler makes the import; see @valancex/common/types/mprx.d.ts.)
declare module "*.mprx" {
  const template: { readonly mprx: string };
  export default template;
}

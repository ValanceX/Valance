// The bundler turns `?url` imports into addresses. This is the one declaration the package needs for that; an application never sees it, because the entry that imports the runtime is this package's.
declare module "*.wasm?url" { const url: string; export default url; }

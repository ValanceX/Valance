declare module "*.wasm?url" { const url: string; export default url; }
// The compiled views: `pnpm build` writes them (build/cli/prepare.ts), and the page script imports their text, so the program is in the script and in no document.
declare module "*/program.json?raw" { const text: string; export default text; }

// `pnpm start`: the exported site, as a static host serves it. `pnpm start:ssr`: the same site rendered per request (opt-in).
import { readGeneratedSite, siteName } from "./document.js";
import { serveSsr, serveStatic } from "./serve.js";

const port = Number(process.env["PORT"] ?? 4174);
const site = readGeneratedSite();
const { origin } = process.argv.includes("--ssr") ? await serveSsr(site, `dist/${siteName()}`, { port }) : await serveStatic(`dist/${siteName()}`, { base: site.base, port });

console.log(`docs-verifier at ${origin}${site.base}${process.argv.includes("--ssr") ? " (rendered per request)" : ""}`);

import { serve } from "./serve.js";
import { readGeneratedSite } from "./document.js";

const { origin } = await serve(readGeneratedSite(), "dist/page", Number(process.env["PORT"] ?? 4174));

console.log(`docs-verifier at ${origin}/`);

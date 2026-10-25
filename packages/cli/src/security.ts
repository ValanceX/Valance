// The security headers a built site should be served with, written beside it as `_headers` (the format Netlify and Cloudflare Pages read; other hosts take the same lines). The VALANCE
// browser runtime is WebAssembly, so a strict Content-Security-Policy needs `'wasm-unsafe-eval'` in `script-src` and nothing more permissive: no `'unsafe-inline'`, no `'unsafe-eval'`. Without it
// the page's server HTML stays and the application never starts (measured in Chromium). Everything the build writes is a same-origin file, so every other source is `'self'`.
import { createHash } from "node:crypto";

import { earlyShell } from "@valancex/common/internal";

import type { Config } from "./config.js";

/** The CSP source that allows the early-input shell (the same bytes in every page) and nothing else inline: a hash, not `'unsafe-inline'`. */
export const earlyShellSource = (): string => `'sha256-${createHash("sha256").update(earlyShell).digest("base64")}'`;

/** The origin of the backend when `api.base` is an absolute address (the page may connect to it), else nothing: a path is the page's own origin. */
const apiOrigin = (config: Config): string | undefined => {
  try {
    return new URL(config.api.base).origin;
  } catch {
    return undefined;
  }
};

export const contentSecurityPolicy = (config: Config): string => {
  const origin = apiOrigin(config);

  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${earlyShellSource()}`,
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self'${origin === undefined ? "" : ` ${origin}`}`,
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
};

/** The header lines, for every path under the site's base. */
export const headersFile = (config: Config): string => {
  const lines = [
    `Content-Security-Policy: ${contentSecurityPolicy(config)}`,
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy: same-origin",
  ];

  return `# Written by vlx build. Serve these headers with the site (Netlify and Cloudflare Pages read this file; copy the lines to any other host's configuration).\n# Turn it off with "headers": false in valance.web.json.\n${config.web.base}*\n${lines.map((line) => `  ${line}`).join("\n")}\n`;
};

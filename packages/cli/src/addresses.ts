// An address a template writes for a file or page of the site (`<image src="/logo.svg">`, `<link href="/guide/a">`) is written without the site's base, as a Markdown link is, and the build
// puts the base in front. MPRX cannot build a string (`src={base + "/logo.svg"}` is a type error, and meant to be), so without this a layout could not name a file of the site once the site
// was served under a path. Only a literal that starts with a single "/" is the site's: `https://…`, `mailto:`, `#heading` and `//host/…` are left as they are.
import { addressesIn } from "./outline.js";

/** The template with the base put in front of each site address it writes. A base of "/" changes nothing. */
export const underBase = (source: string, base: string): string => {
  if (base === "/") {
    return source;
  }

  let out = source;

  for (const address of [...addressesIn(source)].reverse()) {
    if (address.value.startsWith("/") && !address.value.startsWith("//")) {
      out = `${out.slice(0, address.start)}${base}${address.value.slice(1)}${out.slice(address.end)}`;
    }
  }

  return out;
};

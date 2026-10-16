// An address a template writes for a file or page of the site (`<image src="/logo.svg">`, `<link href="/guide/a">`) is written without the site's base, as a Markdown link is, and the build
// puts the base in front. MPRX cannot build a string (`src={base + "/logo.svg"}` is a type error, and meant to be), so without this a layout could not name a file of the site once the site
// was served under a path. Only a literal that starts with a single "/" is the site's: `https://…`, `mailto:`, `#heading` and `//host/…` are left as they are. A page address (an `href` that is
// not a file) is also written in the form the site's `trailingSlash` names, as a Markdown link is.
import { pageUrl } from "@valancex/common/internal";
import type { TrailingSlash } from "@valancex/common/internal";

import { addressesIn } from "./outline.js";

/** The template with the base put in front of each site address it writes. A base of "/" and a policy of "never" change nothing. */
export const underBase = (source: string, base: string, trailingSlash: TrailingSlash = "never"): string => {
  if (base === "/" && trailingSlash === "never") {
    return source;
  }

  let out = source;

  for (const address of [...addressesIn(source)].reverse()) {
    if (address.value.startsWith("/") && !address.value.startsWith("//")) {
      const written = address.attribute === "href" ? pageUrl(base, address.value, trailingSlash) : `${base}${address.value.slice(1)}`;

      out = `${out.slice(0, address.start)}${written}${out.slice(address.end)}`;
    }
  }

  return out;
};

// How a page's address is written in a URL. A page has one address, with or without a trailing slash as the site's `trailingSlash` says (`valance.web.json`), never both: two addresses for one
// page are two pages to a search engine. The application reads either form (`normalize`); it writes the one the policy names. A file (an address whose last segment has an extension) is not a page and
// is left as it is.
export type TrailingSlash = "never" | "always";

/** A path (and any query or fragment) in the form the policy names. The root is always `/`. */
export const shaped = (address: string, policy: TrailingSlash): string => {
  const cut = address.search(/[?#]/);
  const path = cut < 0 ? address : address.slice(0, cut);
  const rest = cut < 0 ? "" : address.slice(cut);
  const bare = path.replace(/\/+$/, "");

  if (bare === "" || /\.[A-Za-z0-9]+$/.test(bare)) {
    return `${bare === "" ? "/" : bare}${rest}`;
  }

  return `${bare}${policy === "always" ? "/" : ""}${rest}`;
};

/** The URL of a page address (`/guide/a`, `/orders/42?tab=open`) under the site's base. */
export const pageUrl = (base: string, address: string, policy: TrailingSlash): string => `${base}${shaped(address, policy).replace(/^\//, "")}`;

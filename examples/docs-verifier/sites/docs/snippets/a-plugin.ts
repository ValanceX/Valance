import type { Plugin } from "@valancex/valance/web/plugin";

// A plugin is a value. It does nothing until it is passed in `plugins`.
// This one serves any application: its head does not read the state.
export const siteHead = (site: string): Plugin<unknown> => ({
  name: "site-head",
  head: () => ({
    title: site,
    meta: [{ name: "description", content: `${site}: documentation` }],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

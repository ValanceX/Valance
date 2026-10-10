// The site's plugins, in the one place that lists them. The server and the browser call this with the same site and the same build, so both say the same head and draw the same tags.
import type { Plugin } from "@valancex/valance/web/plugin";

import type { AppState } from "../app/state.js";
import type { SiteMap } from "../model/site.js";

import type { Built } from "./built.js";
import { kit } from "./kit.js";
import { router } from "./router.js";
import { seo } from "./seo.js";

export const plugins = (map: SiteMap, built: Pick<Built, "style"> = {}): ReadonlyArray<Plugin<AppState>> => [kit(built), router(map), seo(map)];

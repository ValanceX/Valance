// The URL policy as a plugin. The application's routes (../app/routes.ts) already are the contract; this hands them to Valance as the plugin's `routes`, which `Web.run` turns into the
// browser's history and a static export reads for the paths it renders. The stand-in for the router external (../EXTERNALS.md, X1).
import type { Plugin } from "@valancex/valance/web/plugin";

import { routes } from "../app/routes.js";
import type { AppState } from "../app/state.js";
import type { Site } from "../model/site.js";

import { afterNavigation } from "./navigation.js";

export const router = (site: Site): Plugin<AppState> => ({ name: "docs-router", routes: { ...routes(site), onNavigated: afterNavigation } });

// The sites of this project: each a directory under sites/ with a site.json, its content and its examples, and no code. The kit builds every one of them the same way.
import { fileURLToPath } from "node:url";

export const SITES = ["docs", "blog", "landing", "handbook"] as const;
export type SiteName = typeof SITES[number];

export const siteDir = (name: SiteName | string = "docs"): string => fileURLToPath(new URL(`../sites/${name}`, import.meta.url));

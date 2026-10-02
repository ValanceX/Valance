/**
 * The Web target for Valance: the only module that names `@valancex/port-web`.
 * It adds nothing to PORT: it fixes `container` and `primitives` (the application's Web realization
 * table, which is target configuration, not part of the application) and hands PORT the report callback.
 */
import type { WebPort, WebPortOptions } from "@valancex/port-web";
import type { TargetFactory } from "./index.js";

import { createWebPort } from "@valancex/port-web";

export type { HydrationResult, WebPrimitives } from "@valancex/port-web";
export { attribute, booleanAttribute, property, textProperty } from "@valancex/port-web";

export const target = (options: Omit<WebPortOptions, "report">): TargetFactory<WebPort> => (report) => createWebPort({ ...options, report });

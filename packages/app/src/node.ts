// The tooling as a library: what the `valance` command runs, for tests, scripts and other tools. Node only.
export { build } from "./build.js";
export type { Built } from "./build.js";
export { check } from "./check.js";
export type { Checked } from "./check.js";
export { findRoot, loadConfig } from "./config.js";
export type { Config } from "./config.js";
export { dev } from "./dev.js";
export type { Dev, DevOptions } from "./dev.js";
export { AppError, format } from "./diagnostics.js";
export type { Diagnostic } from "./diagnostics.js";

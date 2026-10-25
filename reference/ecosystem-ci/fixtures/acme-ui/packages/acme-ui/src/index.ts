// What the library exports: its components, and the list of them an application can pass to `components`. Removing an export, a component, a prop or an event is a breaking change (decision K8).
export { greeting } from "./greeting.js";
import { greeting } from "./greeting.js";

export const components = [greeting];

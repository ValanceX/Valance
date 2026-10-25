// What the library exports: its components, and the list of them an application can pass to `components`. Removing an export, a component, a prop or an event is a breaking change.
export { dataList, Row } from "./data-list.js";
export { disclosure } from "./disclosure.js";
export { labeledField } from "./labeled-field.js";
export { Tab, tabs } from "./tabs.js";
import { dataList } from "./data-list.js";
import { disclosure } from "./disclosure.js";
import { labeledField } from "./labeled-field.js";
import { tabs } from "./tabs.js";

export const components = [labeledField, disclosure, tabs, dataList];

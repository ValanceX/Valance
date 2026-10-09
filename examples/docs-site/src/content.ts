// The site's content: plain data. Not VALANCE: this is what a documentation author writes (here a few pages; a real site would read files).
export interface Page {
  readonly id: string;
  readonly section: "" | "Guides" | "Reference";
  readonly title: string;
  readonly path: string;
  readonly paragraphs: ReadonlyArray<string>;
  readonly code?: string;
  readonly details: string;
}

export const pages: ReadonlyArray<Page> = [
  { id: "introduction", section: "", title: "Introduction", path: "/docs/introduction", paragraphs: ["Valance keeps an application's state in one place.", "The screen is a function of that state."], details: "Nothing else holds truth." },
  { id: "getting-started", section: "Guides", title: "Getting Started", path: "/docs/guides/getting-started", paragraphs: ["Install the packages, describe a view, define the application."], code: "const app = Valance.define({ name: \"counter\" });", details: "A definition starts nothing." },
  { id: "state", section: "Guides", title: "State", path: "/docs/guides/state", paragraphs: ["State is one value.", "Commands are the only way to change it."], details: "A command is validated before it runs." },
  { id: "async-work", section: "Guides", title: "Async Work", path: "/docs/guides/async-work", paragraphs: ["A command can wait.", "Loading and failure are ordinary state."], code: "// loading, then ready or failed", details: "Closing the application cancels what is still waiting." },
  { id: "api", section: "Reference", title: "API", path: "/docs/reference/api", paragraphs: ["define, start, mount, hydrate, invoke.", "isRefusal(defect) tells work turned away because the application is closing from a bug."], code: "Valance.define(definition)", details: "Every export, by name." },
  { id: "configuration", section: "Reference", title: "Configuration", path: "/docs/reference/configuration", paragraphs: ["Options for start and for the host."], code: "Web.run(app, { container, primitives, present: \"mount\" })", details: "primitives belong to the target." },
];

// `vlx info`: what the project is, read from its files without building anything. The answers to "what targets does this have, how are its pages delivered, which routes exist and which file makes
// each, which stylesheets load and in what order, which components are registered, which tags may I write" are all decided somewhere, and this puts them in one place.
import type { Component } from "@valancex/common";
import { basename } from "node:path";

import { loadAuthor } from "./author.js";
import { loadConfig } from "./config.js";
import { readContent } from "./content.js";
import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic } from "./diagnostics.js";
import { stylesheets } from "./emit.js";
import { pageUrl, RouteDeclarationError, routingFor, screenName } from "@valancex/common/internal";
import { componentStyles } from "./styles.js";
import { tagsOf } from "./tags.js";
import { TARGETS } from "./targets.js";
import { createLoader } from "./vite.js";

export interface Route {
  /** The address, under the site's base. */
  readonly address: string;
  /** The file that makes it. */
  readonly file: string;
  readonly title: string;
  readonly section: string;
  readonly order: number;
  /** How the page is delivered. */
  readonly delivery: string;
}

export interface Info {
  readonly name: string;
  readonly targets: ReadonlyArray<string>;
  readonly web?: { readonly base: string; readonly url: string; readonly rendering: string; readonly trailingSlash: string; readonly headers: boolean; readonly announce: boolean };
  /** Every page, in navigation order: the web's routes. A route is a Markdown file's path under `content/`. */
  readonly routes: ReadonlyArray<Route>;
  /** The routes `src/main.ts` declares (`routes` in `defineApp`), beside the content's: name, pattern, parameters, and the pages a build writes for each. */
  readonly declared: ReadonlyArray<{
    readonly name: string;
    readonly pattern: string;
    readonly parameters: ReadonlyArray<string>;
    readonly delivery: string;
    readonly pages: ReadonlyArray<string>;
    readonly buildable: boolean;
    /** The component the route shows (`screen`), when it names one. */
    readonly screen?: string;
  }>;
  /** The file shown for an address that is not a page, when the project has one. */
  readonly notFound?: string;
  /** The stylesheets the web loads, in the order it loads them. */
  readonly stylesheets: ReadonlyArray<{ readonly file: string; readonly scope?: string }>;
  /** The components `src/main.ts` registers (the layout first), each with its template and, in a project of several targets, the target whose templates it belongs to. */
  readonly components: ReadonlyArray<{ readonly name: string; readonly template: string; readonly target?: string }>;
  /** How many tags each target's vocabulary has (`vlx info --tags` lists them). */
  readonly tags: Readonly<Record<string, number>>;
  /** Mistakes that kept something from being read; `vlx check` reports every one. */
  readonly problems: ReadonlyArray<Diagnostic>;
}

const templateName = (template: { readonly mprx: string }): string => basename(template.mprx).replace(/\.mprx$/, "");

export const info = async (root: string): Promise<Info> => {
  const config = loadConfig(root);
  const problems: Array<Diagnostic> = [];
  const web = config.targets.includes("web");
  let content: ReturnType<typeof readContent> | undefined;

  // The content is read once the definition is: a link in it may lead to a route the definition declares ("unknown" when it could not be loaded).
  const readIt = (routes: Parameters<typeof readContent>[2]): void => {
    try {
      content = readContent(root, config, routes);
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      problems.push(...error.diagnostics);
    }
  };

  const components: Array<{ name: string; template: string; target?: string }> = [];
  let declared: Info["declared"] = [];
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const routing = routingFor(author);

    readIt(routing);

    const { addresses, missing } = routing.pages();

    declared = routing.list.map((each) => ({
      ...each,
      delivery: config.web.rendering === "client" ? "client" : each.delivery,
      pages:
        config.web.rendering === "client"
          ? []
          : addresses.filter((address) => routing.match(address)?.name === each.name).map((address) => pageUrl(config.web.base, address, config.web.trailingSlash)),
      buildable: !missing.includes(each.name),
      ...(routing.screens.some((screen) => screen.route === each.name) ? { screen: screenName(routing.screens.find((screen) => screen.route === each.name)!.component) } : {}),
    }));

    const parts: ReadonlyArray<
      readonly [string | undefined, { readonly layout?: Component; readonly components?: ReadonlyArray<Component>; readonly override?: ReadonlyArray<Component> } | undefined]
    > = [
      [undefined, author],
      ["web", author?.targets?.web],
      ["desktop", author?.targets?.desktop],
    ];

    for (const [target, part] of parts) {
      for (const each of [part?.layout, ...(part?.components ?? []), ...(part?.override ?? [])]) {
        if (each !== undefined) {
          components.push({ name: templateName(each.template), template: each.template.mprx, ...(target === undefined ? {} : { target }) });
        }
      }
    }
  } catch (error) {
    if (content === undefined && !problems.some((each) => each.file.startsWith("content"))) {
      readIt("unknown");
    }

    if (error instanceof RouteDeclarationError) {
      problems.push(diagnostic("src/main.ts", 1, "entry-definition", error.message.replace(/^src\/main\.ts: /, "")));
    } else if (error instanceof AppError) {
      problems.push(...error.diagnostics);
    } else {
      throw error;
    }
  } finally {
    await loader.close();
  }

  const base = config.web.base;
  const scopes = new Map(componentStyles(root).map((each) => [each.file, each.scope]));

  return {
    name: config.name,
    targets: config.targets,
    ...(web
      ? { web: { base, url: config.web.url, rendering: config.web.rendering, trailingSlash: config.web.trailingSlash, headers: config.web.headers, announce: config.web.announce } }
      : {}),
    routes: (content?.pages ?? []).map((page) => ({
      address: `${base}${page.path.replace(/^\//, "")}`,
      file: page.file,
      title: page.title,
      section: page.section,
      order: page.order,
      delivery: config.web.rendering,
    })),
    declared,
    ...(content?.notFound === undefined ? {} : { notFound: content.notFound.file }),
    stylesheets: web ? stylesheets(root).map((file) => ({ file, ...(scopes.has(file) ? { scope: scopes.get(file)! } : {}) })) : [],
    components,
    tags: Object.fromEntries(TARGETS.map((each) => [each.id, tagsOf(each.vocabulary).length])),
    problems,
  };
};

const pad = (text: string, width: number): string => text.padEnd(width);

/** The report as text for a terminal. */
export const render = (found: Info): string => {
  const lines: Array<string> = [`${found.name}`, ""];
  const row = (label: string, value: string): void => {
    lines.push(`${pad(label, 12)}${value}`);
  };

  row("targets", found.targets.join(", "));

  if (found.web !== undefined) {
    row(
      "web",
      `served at ${found.web.base}${found.web.url === "" ? "" : ` (published at ${found.web.url})`}; pages are ${found.web.rendering}, addressed ${found.web.trailingSlash === "always" ? "with" : "without"} a trailing slash; security headers ${found.web.headers ? "on" : "off"}; page changes announced ${found.web.announce ? "yes" : "no"}`,
    );
    row("", "(valance.web.json: base, url, rendering, headers, announce, api)");
  }

  lines.push("");
  lines.push(`routes      ${found.routes.length} (a page's address is its file's path under content/; the order is the navigation's)`);

  const width = Math.max(0, ...found.routes.map((each) => each.address.length));
  const files = Math.max(0, ...found.routes.map((each) => each.file.length));

  for (const each of found.routes) {
    lines.push(`  ${pad(each.address, width)}  ${pad(each.file, files)}  ${each.title}${each.section === "" ? "" : `  [${each.section}]`}  ${each.delivery}`);
  }

  for (const each of found.declared) {
    lines.push(
      `  ${each.pattern}  route "${each.name}"${each.screen === undefined ? "" : ` shows <${each.screen}>`}${each.parameters.length === 0 ? "" : ` (parameters ${each.parameters.join(", ")})`}  ${each.delivery === "client" ? "answered by the app shell" : each.buildable ? `${each.pages.length} page${each.pages.length === 1 ? "" : "s"} when built` : "needs staticParams to be built"}  ${each.delivery}`,
    );
  }

  lines.push(found.notFound === undefined ? "  (no content/404.md: a built-in page answers an address that is not a page)" : `  not found: ${found.notFound}`);
  lines.push("");
  row("styles", found.stylesheets.length === 0 ? "none" : found.stylesheets.map((each) => `${each.file}${each.scope === undefined ? "" : ` (inside .${each.scope})`}`).join(" → "));
  row(
    "components",
    found.components.length === 0
      ? "none (the built-in layout draws the page)"
      : found.components.map((each) => `${each.target === undefined ? "" : `${each.target}: `}${each.name} (${each.template})`).join(", "),
  );
  row(
    "tags",
    `${Object.entries(found.tags)
      .map(([target, count]) => `${target} ${count}`)
      .join(", ")} (vlx info --tags lists them)`,
  );

  if (found.problems.length > 0) {
    lines.push("", `${found.problems.length} problem${found.problems.length === 1 ? "" : "s"} kept something from being read; vlx check lists them`);
  }

  return lines.join("\n");
};

/**
 * The plugin contract for the Web target, and the three small operations that make it real: composing plugins, writing a head as HTML, and keeping a document's head in step.
 *
 * A plugin is a plain value, never a registration: nothing here runs on import, no module keeps a list, and a plugin does nothing until it is handed to `run`,
 * `renderToHtml` or `manifest`. Each contribution is independent and optional, and each one lands on a seam that already existed (the primitives table, the platform, the URL policy,
 * the document's head), so a plugin adds no concept the application did not already have.
 *
 * What a plugin cannot do is stated by what is missing: it has no view, state, command or lifecycle. A plugin that ships templates is read by the build step that compiles
 * MPRX (outside VALANCE, which compiles nothing); this contract carries what VALANCE itself composes.
 */
import type { BoundaryValue } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "@valancex/port-web";
import * as Nexus from "@valancex/nexus";
import { Context, Effect, Layer } from "effect";

type Platform = Nexus.Application.Platform;

import { ValanceError } from "./errors.js";

/** How a route is delivered: rendered once at build time (`static`, the default) or per request (`server`, opt-in). */
export type Delivery = "static" | "server";

/** A `<meta>`: a `name` (or a `property`, as Open Graph uses) and its `content`. */
export type MetaTag = { readonly name: string; readonly content: string } | { readonly property: string; readonly content: string };

/** A `<link>` in the head: a stylesheet, a canonical URL, an icon, a preload. `href` may not carry script (`javascript:`, `vbscript:`, `data:`). */
export interface LinkTag {
  readonly rel: string;
  readonly href: string;
  readonly as?: string;
  readonly type?: string;
}

/** What the document's head says for a state: the one title, and the metas and links that go with it. Plain data, the same on the server and in the browser. */
export interface HeadTags {
  readonly title?: string;
  readonly meta?: ReadonlyArray<MetaTag>;
  readonly links?: ReadonlyArray<LinkTag>;
}

/**
 * An application's URL policy as one value. `urlOf` and `stateOf` are what `HistoryOptions` takes; `known` and `paths` are what a build and a server need and a browser does not.
 *
 * `paths()` lists every concrete pathname the application can show. A static export renders those whose `delivery` is `static`; those marked `server` are left for a server.
 */
export interface RouteTable<S> {
  /** The URL (path and query) shown for `state`. */
  readonly urlOf: (state: S) => string;
  /** The one argument of the navigate command, for a URL. */
  readonly stateOf: (url: URL) => BoundaryValue;
  /** The application's navigate command: a bare name or an exact binding key (see `HistoryOptions.navigate`). */
  readonly navigate: string;
  /** Whether `pathname` is a page of the application (a server answers 404 for one that is not). */
  readonly known: (pathname: string) => boolean;
  /** Every pathname the application can show, in a stable order. */
  readonly paths: () => ReadonlyArray<string>;
  /** How `pathname` is delivered. Absent: `static`. */
  readonly delivery?: (pathname: string) => Delivery;
  /** Called after each navigation (see `HistoryOptions.onNavigated`): where scroll and focus policy lives. */
  readonly onNavigated?: (navigation: Navigation) => void;
}

/** A navigation that has been written to the URL (a link click) or taken from it (Back and Forward). */
export interface Navigation {
  /** `link`: the user followed a link the application handled. `popstate`: the browser moved through its history. */
  readonly kind: "link" | "popstate";
  /** The destination exactly as the browser has it, `#fragment` included (a fragment is never part of the application's state). */
  readonly url: URL;
}

/** One plugin. Every contribution is optional; `name` is the identity a conflict is reported with. */
export interface Plugin<S> {
  readonly name: string;
  /** Tags it adds to the Web realization table. */
  readonly primitives?: WebPrimitives;
  /** Capabilities it provides. */
  readonly platform?: Platform;
  /** The application's URL policy, for an application that has none of its own. */
  readonly routes?: RouteTable<S>;
  /** What the document's head says for a state. Merged with the application's own and every other plugin's. */
  readonly head?: (state: S) => HeadTags;
}

/** What `deliveryOf` answers for a route table that doesn't say. */
export const DEFAULT_DELIVERY: Delivery = "static";

/** How `pathname` is delivered under `routes`. */
export const deliveryOf = <S>(routes: RouteTable<S>, pathname: string): Delivery => routes.delivery?.(pathname) ?? DEFAULT_DELIVERY;

/** The pathnames a static export renders: every known path that is delivered `static`. */
export const staticPaths = <S>(routes: RouteTable<S>): ReadonlyArray<string> => routes.paths().filter((pathname) => deliveryOf(routes, pathname) === "static");

// ---- composition --------------------------------------------------------------------------------------------------------------------------------------------------

/** What the application itself declares on the seams a plugin can also declare on. */
export interface Own<S> {
  readonly primitives?: WebPrimitives | undefined;
  readonly platform?: Platform | undefined;
  /** The application declares a URL policy of its own (`history`). */
  readonly routes?: boolean | undefined;
  readonly head?: ((state: S) => HeadTags) | undefined;
}

export interface Composed<S> {
  readonly primitives: WebPrimitives;
  readonly platform: Platform | undefined;
  readonly routes: RouteTable<S> | undefined;
  readonly head: ((state: S) => HeadTags) | undefined;
}

const APPLICATION = "the application";

/**
 * Merges the application's own declarations with its plugins'. The rules, which are the whole of the precedence:
 *
 *   primitives  a tag is declared once. Two declarations of one tag are a `plugin-conflict`, naming both owners; nothing is overridden silently.
 *   routes      one URL policy. The application's own `history` and a plugin's `routes`, or two plugins' `routes`, are a `plugin-conflict`.
 *   platform    merged in order (`mergePlatforms`): plugins as listed, the application's own last, so a capability provided twice is the later one's.
 *   head        merged in order, the application's own first. The title is the first one defined; a meta is identified by its name or property and a link by its rel and
 *               href, and the first one wins; the rest are appended in order.
 *
 * Pure, and the same inputs give the same output.
 */
export const compose = <S>(own: Own<S>, plugins: ReadonlyArray<Plugin<S>>): Composed<S> => {
  const owners = new Map<string, string>();
  const primitives: Record<string, WebPrimitives[string]> = {};
  const claim = (from: string, table: WebPrimitives | undefined): void => {
    for (const [tag, primitive] of Object.entries(table ?? {})) {
      const holder = owners.get(tag);

      if (holder !== undefined) {
        throw new ValanceError("plugin-conflict", `the tag "${tag}" is declared by ${holder} and by ${from}; a tag is declared once (remove one, or rename it)`);
      }

      owners.set(tag, from);
      primitives[tag] = primitive;
    }
  };
  const names = new Set<string>();

  claim(APPLICATION, own.primitives);

  let routes: { readonly from: string; readonly table: RouteTable<S> } | undefined;

  for (const plugin of plugins) {
    if (names.has(plugin.name)) {
      throw new ValanceError("plugin-conflict", `two plugins are named "${plugin.name}"; a plugin's name identifies it`);
    }

    names.add(plugin.name);
    claim(`the plugin "${plugin.name}"`, plugin.primitives);

    if (plugin.routes !== undefined) {
      const holder = own.routes === true ? APPLICATION : routes?.from;

      if (holder !== undefined) {
        throw new ValanceError("plugin-conflict", `the URL policy is declared by ${holder} and by the plugin "${plugin.name}"; an application has one`);
      }

      routes = { from: `the plugin "${plugin.name}"`, table: plugin.routes };
    }
  }

  const layers = [...plugins.flatMap((plugin) => plugin.platform === undefined ? [] : [plugin.platform]), ...(own.platform === undefined ? [] : [own.platform])];
  const heads = [...(own.head === undefined ? [] : [own.head]), ...plugins.flatMap((plugin) => plugin.head === undefined ? [] : [plugin.head])];

  return {
    primitives,
    platform: layers.length === 0 ? undefined : layers.length === 1 ? layers[0] : mergePlatforms(layers),
    routes: routes?.table,
    head: heads.length === 0 ? undefined : heads.length === 1 ? heads[0] : (state) => mergeHeads(heads.map((head) => head(state))),
  };
};

/**
 * Platforms merged into one, in order. A platform is a Layer that provides the one Environment, so two cannot be combined as Layers (the second Environment would replace the
 * first, and the first's capabilities would vanish): each is built in the merged platform's own scope and their resolutions are combined, a capability resolved by two being
 * the later one's. What a platform acquires is released with the merged platform, last built first, as one platform's resources are.
 */
export const mergePlatforms = (platforms: ReadonlyArray<Platform>): Platform =>
  Layer.scoped(Nexus.Capability.Environment, Effect.gen(function* () {
    const resolutions = new Map<string, Nexus.Capability.CapabilityResolution<unknown>>();

    for (const platform of platforms) {
      const environment = Context.get(yield* Layer.build(platform), Nexus.Capability.Environment);

      for (const [id, resolution] of environment.resolutions) {
        resolutions.set(id, resolution);
      }
    }

    return { resolutions };
  }));

/** Heads merged in order; see `compose` for what wins. */
export const mergeHeads = (heads: ReadonlyArray<HeadTags>): HeadTags => {
  const meta = new Map<string, MetaTag>();
  const links = new Map<string, LinkTag>();

  for (const head of heads) {
    for (const tag of head.meta ?? []) {
      const key = "name" in tag ? `name:${tag.name}` : `property:${tag.property}`;

      if (!meta.has(key)) { meta.set(key, tag); }
    }

    for (const tag of head.links ?? []) {
      const key = `${tag.rel}\n${tag.href}`;

      if (!links.has(key)) { links.set(key, tag); }
    }
  }

  const title = heads.find((head) => head.title !== undefined)?.title;

  return { ...(title === undefined ? {} : { title }), meta: [...meta.values()], links: [...links.values()] };
};

// ---- the head as HTML, and as DOM ---------------------------------------------------------------------------------------------------------------------------------

/** Marks the elements VALANCE wrote into the head, so the browser replaces exactly those and never an element someone else put there. */
export const HEAD_MARK = "data-valance-head";

const escapeText = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttribute = (text: string): string => escapeText(text).replaceAll('"', "&quot;");

/** A URL a head link may carry: anything but a scheme that runs script or embeds a document. Relative URLs, http, https and the rest are allowed. */
const refused = (href: string): boolean => /^[\u0000- ]*(javascript|vbscript|data):/i.test(href.replace(/[\t\n\r]/g, ""));

const checked = (head: HeadTags): HeadTags => {
  for (const link of head.links ?? []) {
    if (refused(link.href)) {
      throw new ValanceError("invalid-head", `the head link rel="${link.rel}" has an href that carries script (${link.href.slice(0, 24)}…); a head link points at a document or a file`);
    }
  }

  return head;
};

/** The `<title>` is not marked: the browser keeps one, so the document's own is replaced in place. */
export const renderHead = (head: HeadTags): string => {
  const { title, meta = [], links = [] } = checked(head);

  return [
    title === undefined ? "" : `<title>${escapeText(title)}</title>`,
    ...meta.map((tag) => `<meta ${"name" in tag ? `name="${escapeAttribute(tag.name)}"` : `property="${escapeAttribute(tag.property)}"`} content="${escapeAttribute(tag.content)}" ${HEAD_MARK}>`),
    ...links.map((tag) => `<link rel="${escapeAttribute(tag.rel)}" href="${escapeAttribute(tag.href)}"${tag.as === undefined ? "" : ` as="${escapeAttribute(tag.as)}"`}${tag.type === undefined ? "" : ` type="${escapeAttribute(tag.type)}"`} ${HEAD_MARK}>`)
  ].join("");
};

/**
 * Makes `document`'s head say `head`: the title is set when there is one, and the metas and links this function wrote before are replaced by these. Elements it did not write
 * (no `data-valance-head`) are never touched, so a stylesheet the server linked stays. Mutates the document it is given and nothing else.
 */
export const applyHead = (document: Document, head: HeadTags): void => {
  const { title, meta = [], links = [] } = checked(head);

  if (title !== undefined) {
    document.title = title;
  }

  for (const stale of Array.from(document.head.querySelectorAll(`[${HEAD_MARK}]`))) {
    stale.remove();
  }

  const add = (tag: string, attributes: Readonly<Record<string, string | undefined>>): void => {
    const element = document.createElement(tag);

    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined) { element.setAttribute(name, value); }
    }

    element.setAttribute(HEAD_MARK, "");
    document.head.append(element);
  };

  for (const tag of meta) {
    add("meta", "name" in tag ? { name: tag.name, content: tag.content } : { property: tag.property, content: tag.content });
  }

  for (const tag of links) {
    add("link", { rel: tag.rel, href: tag.href, as: tag.as, type: tag.type });
  }
};

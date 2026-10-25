// Generated UI as conformance cases (Bet 13; WP9): what a model may write is data (`generated/`: a profile, pages in the Valance vocabulary, planted mistakes), and the cases below are the properties the design promises,
// shown on those data and not on a toy: a page streamed in small chunks draws only previews the program check passes; its last preview is the page; `close()` is the batch check; a planted mistake is heard within
// 20 bytes of its start, once, and nothing is drawn after it; and every preview, drawn by the Web PORT's server entry, is HTML for the Nu Html Checker and names for the accessible-name computation (those two run in
// verify.ts over what this returns).
import { check } from "@valancex/mesh-compiler";
import { render } from "@valancex/mesh-runtime";
import { loadSpecifications, loadWeb, webManifest, webTable } from "@valancex/primitives";
import { realizeHtml } from "@valancex/port-web/server";
import * as Web from "@valancex/valance/web";
import { generation, previewProgram, profile } from "@valancex/valance/generate";
import type { Profile } from "@valancex/valance/generate";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The data of the cases: `generated/` of this package. */
export const dataDirectory = join(fileURLToPath(new URL("..", import.meta.url)), "generated");

interface ProfileData {
  readonly name: string;
  readonly page: string;
  readonly components: ReadonlyArray<string>;
  readonly commands: ReadonlyArray<string>;
  readonly scope: Record<string, unknown>;
  readonly pageCommands: Record<string, unknown>;
  readonly snapshot: Record<string, unknown>;
}

export interface Mistake {
  readonly name: string;
  readonly code: string;
  readonly source: string;
}

export interface Drawn {
  readonly name: string;
  /** The HTML the Web PORT's server entry realizes for a preview. */
  readonly html: string;
}

export interface GeneratedRun {
  readonly profile: Profile;
  readonly failures: string[];
  readonly checked: number;
  /** The last preview of each page, drawn. */
  readonly pages: Drawn[];
  /** Every distinct preview of every page, drawn. */
  readonly previews: Drawn[];
  readonly mistakes: ReadonlyArray<Mistake>;
  /** Whether each planted mistake was heard in time, once, with its code, and with nothing drawn after it. */
  readonly heard: boolean;
  /** A preview of a program the profile does not allow is refused by the program check: the control of "no preview draws an unchecked node". */
  readonly refusesUnchecked: boolean;
}

/** The HTML document a body is checked inside. */
export const documentOf = (body: string): string =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Generated</title>\n</head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`;

const chunks = (text: string, size: number): string[] => Array.from({ length: Math.ceil(text.length / size) }, (_, index) => text.slice(index * size, (index + 1) * size));

export const runGenerated = async (directory: string = dataDirectory): Promise<GeneratedRun> => {
  const data = JSON.parse(readFileSync(join(directory, "profile.json"), "utf8")) as ProfileData;
  const manifest = {
    version: 1,
    types: {},
    components: { [data.page]: { props: {}, events: {}, commands: data.pageCommands, scope: data.scope }, ...webManifest(loadSpecifications(), loadWeb()) },
  };
  const given = await profile(manifest, { page: data.page, name: data.name, components: data.components, commands: data.commands });
  const table = webTable(loadWeb(), Web as never);
  const failures: string[] = [];
  const pages: Drawn[] = [];
  const previews: Drawn[] = [];
  let checked = 0;

  const draw = async (preview: { readonly n: number; readonly round: number; readonly text: string }): Promise<string> => {
    const program = await previewProgram(given, preview);
    const rendered = await render({ program: program as never, model: (program as unknown as { model: string }).model, snapshot: data.snapshot });

    if (rendered.render === undefined) {
      throw new Error(`a preview that passed the program check did not render: ${JSON.stringify(rendered.diagnostics)}`);
    }

    const html = realizeHtml(rendered.render.tree as never, table);

    rendered.render.release();

    return html;
  };

  const modelOf = given.manifest;

  for (const file of readdirSync(join(directory, "pages"))
    .filter((each) => each.endsWith(".mprx"))
    .sort()) {
    const name = file.replace(/\.mprx$/, "");
    const source = readFileSync(join(directory, "pages", file), "utf8");
    const run = await generation(given);
    const seen = new Set<string>();
    let last = "";

    for (const chunk of chunks(source, 2)) {
      const update = await run.push(chunk);

      if (update.diagnostics.length > 0) {
        failures.push(`${name}: a page that is right was reported: ${update.diagnostics.map((each) => each.code).join(", ")}`);
        break;
      }

      if (update.preview !== undefined && !seen.has(update.preview.text)) {
        seen.add(update.preview.text);
        last = update.preview.text;
        checked += 1;
        previews.push({ name: `${name}#${update.preview.n}`, html: await draw(update.preview) });
      }
    }

    const outcome = await run.finish();
    const batch = await check({ source, path: "generated.mprx", model: { manifest: modelOf, path: "components.json", component: data.page } });

    if (!outcome.ok || JSON.stringify(outcome.diagnostics) !== JSON.stringify(batch.diagnostics)) {
      failures.push(`${name}: close() is not the batch check`);
    }

    if (last !== source) {
      failures.push(`${name}: the last preview is not the page`);
    } else {
      pages.push({ name, html: previews[previews.length - 1]!.html });
    }
  }

  // the planted mistakes: heard within 20 bytes of where they start, once, with their code, and nothing drawn after
  const mistakes = JSON.parse(readFileSync(join(directory, "mistakes.json"), "utf8")) as Mistake[];
  let heard = true;

  for (const mistake of mistakes) {
    const batch = await check({ source: mistake.source, path: "generated.mprx", model: { manifest: modelOf, path: "components.json", component: data.page } });
    const start = batch.diagnostics.find((each) => each.code === mistake.code)?.span.start.byte;
    const run = await generation(given);
    const reports: Array<{ at: number; code: string }> = [];
    let sent = 0;
    let after = false;

    for (const chunk of chunks(mistake.source, 1)) {
      sent += Buffer.byteLength(chunk);

      const update = await run.push(chunk);

      after ||= reports.length > 0 && update.preview !== undefined;
      update.diagnostics.forEach((each) => reports.push({ at: sent, code: each.code }));
    }

    checked += 1;

    if (start === undefined) {
      failures.push(`${mistake.name}: the batch check does not report ${mistake.code}`);
      heard = false;
    } else if (reports.filter((each) => each.code === mistake.code).length !== 1 || reports[0]!.at - start > 20 || reports[0]!.code !== mistake.code) {
      failures.push(`${mistake.name}: ${mistake.code} was not heard once within 20 bytes of its start (${JSON.stringify(reports)} for a start at ${start})`);
      heard = false;
    } else if (after) {
      failures.push(`${mistake.name}: a preview was drawn after the mistake was heard`);
      heard = false;
    }
  }

  const refusesUnchecked = await previewProgram(given, { n: 1, round: 1, text: "<column><banner /></column>" }).then(
    () => false,
    () => true,
  );

  return { profile: given, failures, checked, pages, previews, mistakes, heard, refusesUnchecked };
};

// Each probe records what it observed, and the file is the evidence the report (../PRINCIPLES.md) cites. Observations are plain data; a probe's assertions pin them.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const evidence = (file: string) => {
  const observed: Record<string, unknown> = {};

  return {
    record: (key: string, value: unknown): void => { observed[key] = value; },
    write: (): void => {
      const target = join(dirname(fileURLToPath(import.meta.url)), "evidence", `${file}.json`);

      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(observed, null, 2) + "\n");
    },
  };
};

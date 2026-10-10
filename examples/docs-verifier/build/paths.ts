// Where the build reads and writes. `.valance/` is generated: nothing there is edited or committed. `dist/<site>` is the deliverable. Every path is relative to the project root, where the
// commands run.
export const VIEWS = "src/views";
export const generatedProgram = ".valance/program.json";
export const generatedSite = (name: string): string => `.valance/${name}/site.json`;
export const generatedSearch = (name: string): string => `.valance/${name}/search.json`;
export const deliverable = (name: string): string => `dist/${name}`;

export default { logLevel: "error", build: { outDir: "vout", minify: "esbuild", rollupOptions: { input: "entry.mjs", external: ["node:fs/promises"] }, target: "esnext", emptyOutDir: true } };

# What the compiler's 320,228 gzipped bytes are made of (W23a)

2026-10-18. Analysis only: no budget changed (it is 330,000 since W23a), no code changed. Module: `@valancex/mesh-compiler` `dist/mesh.wasm`, built from MESH commit `77f8ca1` (`claude/wp2c-snippets-forwarder`) with the `wasm` profile (`opt-level = "z"`, fat LTO, one codegen unit, `panic = "abort"`, stripped). To read names, the same build was repeated with `strip = false` (3,420,211 bytes with debug info; the code is the same) and read with `twiggy` 0.8; sections of the shipped file were read from its binary layout. Attribution of a function to a crate is by the first crate named in its symbol, so a generic from `alloc` instantiated for a `serde_json` type is counted to `alloc`: the shares below are a guide, and the "touching" figures overlap.

## Shape

| | Bytes | Share |
|---|---:|---:|
| Whole module, raw | 987,588 | |
| Whole module, gzip -9 (the figure the budget tests) | 320,228 | |
| Code section | 869,601 | 88.0% |
| Data section | 112,059 | 11.3% |
| Function table, types, exports, element | 5,889 | 0.6% |

Gzip shrinks the code to about a third; the data less (tables). With `opt-level = "s"` instead of `"z"` the module is bigger (1,087,008 raw, 341,444 gzipped), so `z` stands.

## The data section (112,059 bytes)

| Part | Bytes | Note |
|---|---:|---|
| Tree-sitter parse tables | about 17,900 | `ts_small_parse_table` 9,292, `ts_parse_actions` 4,336, lex modes 1,176, the rest under 800 each (196 states, 87 symbols). **1.8% of the module.** |
| Text: MESH messages, names and codes | about 17,400 | diagnostics, runtime codes, field names |
| Text: Rust panic messages and source paths | about 9,000 | `unwrap`, index and overflow messages, `library/` paths |
| Other text | about 11,800 | |
| Binary tables and the rest | about 56,000 | number-formatting tables, Unicode lookups, `sha2` constants, vtables and relocations |

**The W23a note was wrong in its reason**: it said the growth from enums was "mostly the regenerated parser tables". The tables are 17.9 kB raw in a 988 kB module; the growth was code (the manifest validator, the checker, the new rules). The decision stands (the budget was raised for a measured size); the reason in its row is superseded by this file.

## The code by crate (raw bytes; 869,601 in all, 986,510 with the data segment)

| Crate (by first name in the symbol) | Bytes | Functions |
|---|---:|---:|
| `alloc` (collections, `fmt`, `String`, `Vec` instantiations) | 206,318 | 1,687 |
| `core` (iterators, `fmt`, `str`, number formatting) | 194,533 | 933 |
| `serde_json` | 77,976 | 401 |
| `serde` | 73,126 | 242 |
| tree-sitter C runtime and the lexer | 59,331 | 169 |
| `mesh_template` (reader, writer, derive impls) | 51,881 | 429 |
| `mesh_parser` | 37,780 | 47 |
| `mesh_analysis` | 30,514 | 47 |
| `mesh_runtime` (assembly rules for `check_program`, number text) | 27,924 | 49 |
| `mesh_manifest` | 25,227 | 35 |
| `mesh_compiler` | 20,771 | 40 |
| `hashbrown`, `dlmalloc`, `std`, `sha2`, others | about 35,000 | |
| `mesh_semantic`, `mesh_syntax`, `mesh_wasm` | about 13,000 | |

Counting by what a function *touches* instead (overlapping): symbols naming `serde_json` are 225 kB, `BTreeMap` or `BTreeSet` 198 kB, `mesh_template` 177 kB, serde visitors for MESH types 128 kB. **JSON is the module's largest single cost**: the serde stack and the template's derives are 203 kB by first crate (21% of the raw module), and about twice that counting the collections and `fmt` code they instantiate. MESH's own logic (parser, analysis, runtime rules, manifest, compiler, semantic) is about 160 kB, 16%.

## What could be removed or loaded later (estimates, none built)

1. **JSON without `serde` derives** (largest). The template, manifest and result documents are small closed shapes; hand-written readers and writers for them, with `serde_json` kept only where a generic value is unavoidable, would remove most of the 203 kB. Estimate: 50 to 100 kB raw, 15 to 30 kB gzipped. Costs: a second path to keep equal to the schemas (the schema tests already compare), and the free window is the time to change the reader's error messages.
2. **Floating-point formatting**: `core`'s exact and shortest formatting (`flt2dec`, dragon and grisu) is 16 kB, kept alive by a `{}` or `{:e}` of an `f64` somewhere in the checker or the writers. MESH has its own number text (`number_to_text`, 3.6 kB); finding the remaining use and routing it there would save about 16 kB raw, 5 kB gzipped.
3. **Split the module by use**: `check_program` and `compile_program` carry `mesh_runtime`'s assembly rules (27.9 kB) and `mesh_infer` exists for editors and the CLI; a build without the editor entry points is possible with features. Estimate: 25 to 35 kB raw if separately loaded, at the cost of two files to serve and a version pair to keep in step. **Lazy loading does not reduce what a site that compiles ships**; it helps only a page that checks without compiling programs.
4. **A post-link optimizer** (`wasm-opt -Oz`) typically gives a further several percent on a `z` build. Not measured: the tool is not installed here and I did not install it. A build step, not a source change; the first thing to try.
5. **Messages**: 17 kB raw of text, a few kB gzipped. Not worth removing.
6. **Not worth it:** the parser tables (1.8%), `sha2` (5 kB, needed for the fingerprint and identity), `opt-level = "s"` (larger).

What snippets themselves cost: the module was about 309,000 gzipped before them (W23) and 321,522 when W23a recorded it; this build, which also has the forwarder (U13) and the completion work, gives 320,228. I did not bisect the 1,300 bytes by which today's figure is *lower*; both are gzip of a wasm build from different commits, and I did not keep the earlier artifact to compare. So "snippets cost about 11 kB gzipped" is the right size of the claim, not a measurement of each part.

## What was not checked

The shares are by symbol name, not by retained size (`twiggy dominators` was not used: with LTO and inlining it mostly points at `mesh_check_program`). No removal was tried, so every saving above is an estimate. The `opt-level = "s"` figure is measured.

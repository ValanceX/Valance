# Architectural constraints (Guarded Tracer Bullet, step 2)

Written *before* the first line of `src/`. Each line is either enforced by a tripwire
(`packages/valance/test/boundaries.test.ts`, `examples/tracer-web/test/*`) or listed
as "reviewed only".

## MUST

1. **C1, one composition boundary.** An application author defines and starts a *Valance* application; they do not wire a NEXUS host to a PORT. *(tripwire: tracer example imports no `Mesh.host`/`createWebPort`.)*
2. **C2, substrate ownership.** Behavior is NEXUS's (`Application.start`, state, commands), render semantics are MESH's (`Mesh.host`, render-v1), realization is PORT's (`draw/update/hydrate`). Valance calls them; it reimplements none. *(reviewed + render tripwire)*
3. **C3, real paths only.** The tracer runs the real compiler, MESH runtime (WASM), NEXUS 0.9 and port-web.
4. **C4, target independence.** The core entry (`.`) names no Web type and imports no PORT package. Target specifics live in the `./web` subpaths. *(tripwire)*
5. **C5, substrates stay independent.** MESH and PORT never depend on Valance or NEXUS; Valance's core depends on NEXUS and (types of) the MESH runtime only. *(tripwire)*
6. **C6, explicit lifecycle.** `start` creates the application; the *caller's Scope* owns its lifetime; `start` is where platform is supplied; Valance owns render/update orchestration (a fiber and a target, both finalized by the Scope, target first); shutdown is scope close or `Application.shutdown`. *(tripwire: lifecycle + J1 isolation)*
7. **C7, program continuity and drawn render stay with the composer** (PORT CONTRACT; NEXUS M1/M2). Valance dispatches each event with the render whose tree is drawn, never a newer one. *(tripwire)*

## MUST NOT

- No router, plugin system, CLI, dev server, platform registry, diagnostics framework, optimizer.
- No second hydration protocol: `hydrate` is PORT's; Valance only decides *when* to call it.
- No `any`; no `ApplicationDefinition.environment` / `CapabilitySource`.
- No application code mutating the target. The only path to the target is state → render → PORT.
- No compat shims. (None were needed; if one appears it is documented in `FINDINGS.md`.)

## Added for stage 2 (written before the multi-view code)

- **C8.** One `Valance.start` per application, however many MESH programs it shows; route state lives in application state; the active program is derived from it.
- **C9.** A program change is PORT's `draw` (continuity is the composer's fact); Valance never asks PORT to `update` across programs.
- No `@valancex/router`, route DSL, navigation registry, or route lifecycle; no second application to simulate navigation.

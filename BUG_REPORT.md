# Bug Report: Extension Host OOM when formatting PDXScript files

**Date:** 2026-03-25
**Severity:** Critical — Extension Host crash (OOM, ~4 GB heap)
**Status:** Fixed

---

## Summary

The `pdx-script-formatter` VS Code extension caused the Extension Host to crash
with an out-of-memory error when formatting any `.txt` file registered as a
PDXScript language (HOI4, Stellaris, EU4). The crash occurred inside
`prettier.format()` before the plugin's `parse()` function was ever invoked.

## Symptoms

```
[19080:0000058400214000]   102479 ms: Scavenge (during sweeping)
    3961.4 (3990.7) -> 3952.4 (3993.9) MB ...
[19080:0000058400214000]   105869 ms: Mark-Compact (reduce)
    3954.0 (3993.9) -> 3952.9 (3967.2) MB ...
[19080:0325/165845.569:ERROR:electron\shell\common\node_bindings.cc:183]
    OOM error in V8: Ineffective mark-compacts near heap limit
    Allocation failed - JavaScript heap out of memory
```

- Extension Host became unresponsive within milliseconds of calling
  `prettier.format()`.
- VS Code reported `myriad.pdx-script-formatter` consumed ~42% of CPU
  during the unresponsive period.
- Extension Host automatically restarted after the crash.

## Root Cause

**`prettier` was bundled into `dist/extension.js` by esbuild**, and an esbuild
plugin (`prettierEsmRedirectPlugin`) that redirected prettier's lazy ESM import
to a synchronous CJS `require()` created an **infinite self-reference loop**
when both prettier and the plugin were inlined into a single file.

### How prettier's lazy loading works

`prettier/index.cjs` uses this pattern:

```js
var prettierPromise = import("./index.mjs");
// All exported methods are async wrappers:
format: (...args) => (await prettierPromise).format(...args)
```

### What the esbuild redirect did

The `prettierEsmRedirectPlugin` replaced `import("./index.mjs")` with
`require("./index.cjs")` to avoid bundling the ESM code path (which contained
`createRequire(import.meta.url)` that throws when `import.meta.url` is
undefined in a CJS bundle).

### Why it broke

When esbuild inlined both `prettier/index.cjs` and its self-referencing
redirect into a single bundled file, the `require("./index.cjs")` resolved to
**the same bundled module**. This created a circular initialization:

1. Module loads → `require("./index.cjs")` → same module loads again
2. `require("./index.cjs")` → same module loads again
3. ...infinite loop, allocating memory each iteration
4. V8 heap exhausted at ~4 GB → process killed

## Evidence

| Observation                                                     | Implication                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `prettier.format("# hello", { parser: "markdown" })` also OOMed | The bug is in prettier itself, not the plugin                   |
| Plugin's `parse()` debug logs never appeared                    | `prettier.format()` never reached the plugin                    |
| `formatText: [2/4] opts ready` was the last log                 | Options were correct; crash was inside `prettier.format()`      |
| vitest tests with the same input passed in < 1 second           | prettier works fine when loaded from node_modules (not bundled) |
| Extension Host heap grew to ~4 GB with repeated GC failures     | Classic symptom of an infinite allocation loop                  |

## Investigation Timeline

### Step 1: Verified plugin works in isolation

Ran the exact problematic input through vitest — formatted successfully in
948ms. Confirmed the plugin code itself was not the problem.

### Step 2: Added granular logging

Added `[1/4]` through `[4/4]` stage markers in `formatText()`. Confirmed the
hang was inside `prettier.format()` before `parse()` executed. Added debug
logging inside the plugin's bundled code (patching `dist/extension.js`
directly) — those logs never appeared.

### Step 3: Removed `filepath` from prettier options

Suspected prettier's language→extension matching conflicted with the explicit
`parser` option. **Did not help.**

### Step 4: Stripped `languages` from plugin object

Suspected `languages: [{ extensions: [".txt"] }]` caused a parser resolution
loop. **Did not help.**

### Step 5: Added diagnostic tests

Added two `prettier.format()` calls before the main one:

- `prettier.format("# hello", { parser: "markdown" })` — **also OOMed**
- `prettier.format("a=b", { parser: "pdx-script-parse", plugins: [] })` —
  never reached

The markdown test proved the issue was with **bundled prettier itself**, not
the plugin.

### Step 6: Made prettier external

Changed esbuild config to not bundle prettier. The OOM was resolved.

## Fix

### `esbuild.js`

1. **Added `"prettier"` to the `external` array** — esbuild now emits
   `require("prettier")` instead of inlining prettier's code:

   ```js
   external: ["vscode", "web-tree-sitter", "prettier"],
   ```

2. **Added prettier to `copyRuntimeDeps()`** — so the `require("prettier")`
   resolves at runtime:

   ```js
   const prettierSrc = path.dirname(require.resolve("prettier"));
   const prettierDest = path.join(destRoot, "prettier");
   fs.cpSync(prettierSrc, prettierDest, { recursive: true });
   ```

3. **Removed `prettierEsmRedirectPlugin`** — no longer needed since prettier
   is not bundled.

### Why this works

- Both the extension and the plugin `require("prettier")` at runtime.
- Node.js module resolution finds the same physical
  `dist/node_modules/prettier/` directory.
- Single prettier instance, no bundling, no circular reference, no OOM.

## Cleanup Items

All investigation artifacts have been removed. The codebase is clean.

- [x] `formatter.ts`: Removed `withTimeout` wrapper
- [x] `formatter.ts`: Removed `{ languages: _lang, ...safePlugin }` destructure — restored `plugins: [pdxPlugin]`
- [x] `formatter.ts`: Removed `[DIAG] markdown` and `[DIAG] no-plugin` test blocks
- [x] `formatter.ts`: Removed plugin keys/parsers/printers debug logging
- [x] `extension.ts`: Removed timing logs from provider callback
- [x] `esbuild.js`: Removed `prettierEsmRedirectPlugin` and its JSDoc

## Relevant Files

| File                         | Role                                |
| ---------------------------- | ----------------------------------- |
| `esbuild.js`                 | Build config — **fix applied here** |
| `src/formatter.ts`           | Formatting logic — cleaned up       |
| `src/extension.ts`           | Extension entry point — cleaned up  |
| `src/logger.ts`              | Logging utility — unchanged         |
| `vitest.config.ts`           | Test config — unchanged             |
| `src/test/formatter.test.ts` | Unit tests — cleaned up             |

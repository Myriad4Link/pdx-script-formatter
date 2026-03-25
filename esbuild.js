const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

// External packages: esbuild emits `require(...)` for these instead of
// inlining their code.  Keep this in sync with the external array in
// the esbuild config below.
const PLUGIN_PACKAGE = "prettier-plugin-pdx-script";

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      // Don't print "[watch] build finished" here — the main() function
      // prints it AFTER copyRuntimeDeps() completes, so VS Code's problem
      // matcher (tasks.json) only signals "ready" when everything is done.
    });
  },
};

/**
 * Copies runtime dependencies to `dist/node_modules/`.
 *
 * The following packages are marked `external` in esbuild, so the bundled
 * extension.js still contains `require(...)` calls for them.  At runtime,
 * those `require` calls resolve to the files we copy here.
 *
 * - `web-tree-sitter` — tree-sitter WASM runtime
 * - `prettier` — must be external to avoid a circular self-reference when
 *   bundled (see BUG_REPORT.md)
 * - `prettier-plugin-pdx-script` — its WASM grammar and package.json are
 *   read via `readFileSync` during activation, so the package must exist
 *   on disk at a known location
 */
async function copyRuntimeDeps() {
  const destRoot = path.join(__dirname, "dist", "node_modules");

  // web-tree-sitter
  const wtsSrc = path.dirname(require.resolve("web-tree-sitter"));
  const wtsDest = path.join(destRoot, "web-tree-sitter");
  fs.cpSync(wtsSrc, wtsDest, { recursive: true });
  console.log(`[watch] copied web-tree-sitter to ${wtsDest}`);

  // prettier (external, needs to be available at runtime)
  const prettierSrc = path.dirname(require.resolve("prettier"));
  const prettierDest = path.join(destRoot, "prettier");
  fs.cpSync(prettierSrc, prettierDest, { recursive: true });
  console.log(`[watch] copied prettier to ${prettierDest}`);

  // prettier-plugin-pdx-script — copy the entire package directory so that
  // all files (package.json, dist/, any data files) are available at runtime.
  // Previously we selectively copied only package.json + dist/, which would
  // break if the plugin added runtime dependencies outside dist/.
  const pluginSrc = path.dirname(
    require.resolve(`${PLUGIN_PACKAGE}/package.json`),
  );
  const pluginDest = path.join(destRoot, PLUGIN_PACKAGE);
  fs.cpSync(pluginSrc, pluginDest, { recursive: true });
  console.log(`[watch] copied ${PLUGIN_PACKAGE} to ${pluginDest}`);
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode", "web-tree-sitter", "prettier"],
    logLevel: "silent",
    plugins: [esbuildProblemMatcherPlugin],
    // Force CJS resolution for the plugin to avoid ESM code paths.
    alias: {
      [PLUGIN_PACKAGE]: require.resolve(PLUGIN_PACKAGE), // → dist/index.cjs
    },
    conditions: ["require", "import"],
  });

  if (watch) {
    // In watch mode, do an initial rebuild + copy so the dist folder is
    // populated before the Extension Development Host starts.
    await ctx.rebuild();
    await copyRuntimeDeps();
    // Print "build finished" AFTER copy — the problem matcher in
    // .vscode/tasks.json matches this to signal VS Code that the task is ready.
    console.log("[watch] build finished");
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    await copyRuntimeDeps();
    console.log("[watch] build finished");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

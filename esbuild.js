const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

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
      console.log("[watch] build finished");
    });
  },
};

/**
 * Copies the `web-tree-sitter` runtime package to `dist/node_modules/web-tree-sitter/`.
 *
 * The grammar WASM (`tree-sitter-pdx_script.wasm`) is read from the plugin's
 * package at runtime via `readFileSync`, so it does not need a separate copy.
 *
 * `web-tree-sitter` is marked `external` in esbuild, which means the bundled
 * extension.js still contains `require("web-tree-sitter")`.  At runtime, that
 * `require` resolves to the files we copy here.  The full package (JS + WASM)
 * is needed — just the WASM is not enough.
 */
async function copyWebTreeSitter() {
  const srcDir = path.dirname(require.resolve("web-tree-sitter"));
  const destDir = path.join(
    __dirname,
    "dist",
    "node_modules",
    "web-tree-sitter",
  );

  fs.cpSync(srcDir, destDir, { recursive: true });
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
    external: ["vscode", "web-tree-sitter"],
    logLevel: "silent",
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    await copyWebTreeSitter();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

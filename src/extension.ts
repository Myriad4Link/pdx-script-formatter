/**
 * VS Code extension entry point for PDXScript formatting.
 *
 * Activates on any of the four Paradox game language IDs provided by
 * `tboby.cwtools-vscode` and registers a document-formatting provider
 * backed by `prettier-plugin-pdx-script`.
 *
 * WASM configuration must happen before the first `formatText()` call,
 * so both `setGrammarBinary` and `setLocateFile` are called during
 * `activate()`.
 */
import * as vscode from "vscode";
import * as path from "path";
import { readFileSync } from "fs";
import {
  setGrammarBinary,
  setLocateFile,
  type LocateFileFn,
} from "prettier-plugin-pdx-script";
import { formatText, SUPPORTED_LANGUAGES } from "./formatter";
import { log, initLogger, setLogLevel, parseLogLevel } from "./logger";

/** Matches the package name in package.json `dependencies` and esbuild.js. */
const PLUGIN_PACKAGE = "prettier-plugin-pdx-script";

const ext = log.tagged("extension");

/**
 * Called by VS Code when the extension is activated.
 *
 * Activation triggers: `onLanguage:stellaris`, `onLanguage:hoi4`,
 * `onLanguage:eu4`, `onLanguage:paradox` (declared in package.json).
 */
export function activate(context: vscode.ExtensionContext) {
  // Eagerly create the Output Channel FIRST, before anything else.
  // This guarantees it appears in the Output dropdown even if activation
  // fails partway through.
  initLogger();

  try {
    activateInner(context);
  } catch (err) {
    ext.error("=== ACTIVATION FAILED ===", err);
    throw err;
  }
}

/** Inner activation logic — throws on failure. */
function activateInner(context: vscode.ExtensionContext) {
  // ── Read debug setting ──────────────────────────────────────────────────
  const config = vscode.workspace.getConfiguration("pdxScriptFormatter");
  const levelName = config.get<string>("logLevel", "info");
  setLogLevel(parseLogLevel(levelName));

  ext.info("=== Activation start ===");
  ext.info(`Extension ID: ${context.extension.id}`);
  ext.info(`Extension version: ${context.extension.packageJSON?.version}`);

  // ── WASM configuration ─────────────────────────────────────────────────
  // These must run before the plugin's parser is initialized (which happens
  // lazily on the first `parse()` call inside prettier.format).

  // Grammar WASM: resolve by reading the plugin's package.json exports field.
  //
  // We CANNOT use `require.resolve("prettier-plugin-pdx-script/dist/...")`
  // because esbuild bundles a `createRequire` shim that breaks when the
  // extension is loaded from a VSIX (VS Code's module loader doesn't set
  // `__filename` the way esbuild expects).  Instead we look in
  // `__dirname/node_modules/` for the plugin's package root (copied there
  // by esbuild.js), then use its `exports` map to locate the WASM file.
  let grammarPath: string;
  try {
    // Use path.join with the known package name rather than require.resolve,
    // because the latter relies on Node's module resolution which may not
    // work correctly inside a VSIX-packaged extension.
    const pluginDir = path.join(__dirname, "node_modules", PLUGIN_PACKAGE);
    const pluginPkgJsonPath = path.join(pluginDir, "package.json");
    ext.debug(`Plugin package.json: ${pluginPkgJsonPath}`);
    const pluginPkg = JSON.parse(readFileSync(pluginPkgJsonPath, "utf-8"));
    // Find the wasm export entry (the key contains "tree-sitter-pdx_script.wasm")
    const exportsField = pluginPkg.exports ?? {};
    const wasmKey = Object.keys(exportsField).find((k) =>
      k.includes("tree-sitter-pdx_script.wasm"),
    );
    if (!wasmKey) {
      throw new Error(
        "Could not find grammar WASM entry in prettier-plugin-pdx-script exports",
      );
    }
    const wasmRel = exportsField[wasmKey]?.default ?? exportsField[wasmKey];
    if (typeof wasmRel !== "string") {
      throw new Error(
        `Unexpected export value for ${wasmKey}: ${JSON.stringify(wasmRel)}`,
      );
    }
    grammarPath = path.resolve(pluginDir, wasmRel);
    ext.debug(`Grammar WASM resolved to: ${grammarPath}`);
  } catch (err) {
    ext.error("Failed to resolve grammar WASM path", err);
    throw err;
  }

  // Hand the grammar data to the plugin via a lazy callback — the plugin
  // calls this on its first `parse()` invocation.
  setGrammarBinary(() => {
    const data = readFileSync(grammarPath);
    ext.debug(`Grammar WASM loaded (${data.length} bytes)`);
    return data;
  });

  // Runtime WASM: point web-tree-sitter to our bundled copy.  The build
  // script copies `web-tree-sitter.wasm` to `dist/node_modules/web-tree-sitter/`.
  // At runtime, `__dirname` is `extension/dist/`.
  const runtimeWasmDir = path.join(
    __dirname,
    "node_modules",
    "web-tree-sitter",
  );
  const locateFile: LocateFileFn = (fileName: string, _scriptDir: string) => {
    const resolved = path.join(runtimeWasmDir, fileName);
    ext.debug(`LocateFile: ${fileName} → ${resolved}`);
    return resolved;
  };
  setLocateFile(locateFile);
  ext.debug(`Runtime WASM dir: ${runtimeWasmDir}`);

  // ── Register formatting provider ────────────────────────────────────────
  for (const languageId of SUPPORTED_LANGUAGES) {
    ext.info(`Registering formatter for language: ${languageId}`);
    const provider = vscode.languages.registerDocumentFormattingEditProvider(
      { language: languageId },
      {
        async provideDocumentFormattingEdits(
          document: vscode.TextDocument,
        ): Promise<vscode.TextEdit[]> {
          const filename = document.fileName;
          const lineCount = document.lineCount;

          try {
            const original = document.getText();
            const formatted = await formatText(original);
            const changed = formatted !== original;
            ext.info(
              `Formatted ${filename} (${lineCount} lines, changed=${changed})`,
            );
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(original.length),
            );
            return [vscode.TextEdit.replace(fullRange, formatted)];
          } catch (err) {
            ext.error(`Format FAILED: ${filename}`, err);
            throw err;
          }
        },
      },
    );
    context.subscriptions.push(provider);
  }

  ext.info("=== Activation complete ===");
}

/** Called by VS Code when the extension is deactivated. */
export function deactivate() {
  ext.info("Extension deactivated");
}

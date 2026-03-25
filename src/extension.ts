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
import { log, setLogLevel, parseLogLevel } from "./logger";

const ext = log.tagged("extension");

/**
 * Called by VS Code when the extension is activated.
 *
 * Activation triggers: `onLanguage:stellaris`, `onLanguage:hoi4`,
 * `onLanguage:eu4`, `onLanguage:paradox` (declared in package.json).
 */
export function activate(context: vscode.ExtensionContext) {
  // ── Read debug setting ──────────────────────────────────────────────────
  const config = vscode.workspace.getConfiguration("pdxScriptFormatter");
  const levelName = config.get<string>("logLevel", "info");
  setLogLevel(parseLogLevel(levelName));

  ext.info("=== Activation start ===");
  ext.info(`Extension ID: ${context.extension.id}`);
  ext.info(`Extension version: ${context.extension.packageJSON?.version}`);
  ext.info(`Global storage: ${context.globalStorageUri.fsPath}`);
  ext.info(`Log level: ${levelName}`);

  // ── WASM configuration ─────────────────────────────────────────────────
  // These must run before the plugin's parser is initialized (which happens
  // lazily on the first `parse()` call inside prettier.format).

  // Grammar WASM: resolve through the plugin's `exports` subpath (rc.4+).
  // `readFileSync` runs inside the callback so the file is only read when
  // the parser is first initialized.
  const grammarPath =
    require.resolve("prettier-plugin-pdx-script/dist/tree-sitter/tree-sitter-pdx_script.wasm");
  ext.debug(`Grammar WASM resolved to: ${grammarPath}`);
  ext.debug(`Grammar WASM exists: ${readFileSync(grammarPath).length} bytes`);
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
          ext.debug(
            `Format request: language=${languageId} file=${filename} lines=${lineCount}`,
          );

          const original = document.getText();
          const t0 = performance.now();
          try {
            const formatted = await formatText(original, filename);
            const elapsed = (performance.now() - t0).toFixed(1);
            const changed = formatted !== original;
            ext.info(
              `Format done in ${elapsed}ms: ${filename} (${lineCount} lines, changed=${changed})`,
            );
            if (!changed) {
              ext.debug("Text unchanged after formatting");
            }
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(original.length),
            );
            return [vscode.TextEdit.replace(fullRange, formatted)];
          } catch (err) {
            const elapsed = (performance.now() - t0).toFixed(1);
            ext.error(`Format FAILED in ${elapsed}ms: ${filename}`, err);
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

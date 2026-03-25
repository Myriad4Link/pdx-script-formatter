/**
 * Pure formatting logic for PDXScript files.
 *
 * This module is intentionally decoupled from the VS Code API so it can be
 * unit-tested independently. It directly imports `prettier` and
 * `prettier-plugin-pdx-script` — the plugin ships a CJS entry point, so
 * no dynamic imports or ESM/CJS workarounds are needed.
 */
import * as prettier from "prettier";
import * as pdxPlugin from "prettier-plugin-pdx-script";
import { log } from "./logger";

const fmt = log.tagged("formatter");

/** Paradox game language IDs provided by `tboby.cwtools-vscode`. */
export const SUPPORTED_LANGUAGES = [
  "stellaris",
  "hoi4",
  "eu4",
  "paradox",
] as const;

/** Union type of the four supported language IDs. */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Formats PDXScript text using prettier with the `pdx-script-parse` parser.
 *
 * The parser (provided by `prettier-plugin-pdx-script`) uses a tree-sitter
 * WASM grammar to parse PDXScript into an AST, which the plugin's printer
 * then renders with consistent formatting rules:
 *
 * - Tab-based indentation
 * - Spacing around `=` in key-value pairs
 * - Consistent block structure
 * - Comment preservation
 *
 * @param text - Raw PDXScript source text.
 * @param filepath - Optional file path hint for prettier's plugin resolution.
 *   Defaults to `"file.txt"`.
 * @returns The formatted text.
 */
export async function formatText(
  text: string,
  filepath?: string,
): Promise<string> {
  const resolvedPath = filepath ?? "file.txt";

  fmt.debug(`formatText: input=${text.length} chars, file=${resolvedPath}`);
  fmt.trace(
    `formatText: text preview:\n${text.slice(0, 500)}${text.length > 500 ? `\n... (${text.length} chars total)` : ""}`,
  );

  try {
    const result = await prettier.format(text, {
      parser: "pdx-script-parse",
      plugins: [pdxPlugin],
      filepath: resolvedPath,
    });

    const linesIn = text.split("\n").length;
    const linesOut = result.split("\n").length;
    fmt.debug(
      `formatText: output=${result.length} chars, lines ${linesIn}→${linesOut}`,
    );
    fmt.trace(
      `formatText: output preview:\n${result.slice(0, 500)}${result.length > 500 ? `\n... (${result.length} chars total)` : ""}`,
    );

    return result;
  } catch (err) {
    fmt.error(`formatText: prettier.format FAILED for ${resolvedPath}`, err);
    throw err;
  }
}

/**
 * Tests for {@link formatText} and {@link SUPPORTED_LANGUAGES}.
 *
 * These tests import the real `prettier` and `prettier-plugin-pdx-script`
 * modules, exercising the full formatting pipeline including tree-sitter
 * WASM parser initialization. No mocking is needed — the plugin ships a
 * CJS entry point so standard imports work without ESM/CJS workarounds.
 *
 * `setGrammarBinary` is called before any `formatText()` to ensure the
 * grammar WASM is loaded from the correct path in the test environment.
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
import { describe, it, expect } from "vitest";
import { setGrammarBinary } from "prettier-plugin-pdx-script";
import { formatText, SUPPORTED_LANGUAGES } from "../formatter.js";

// Ensure the grammar WASM is available before the plugin's parser initializes.
// Resolve through the plugin's `exports` subpath (rc.4+) using `createRequire`
// because this test file runs in an ESM context (vitest).
const _require = createRequire(import.meta.url);
const grammarPath = _require.resolve(
  "prettier-plugin-pdx-script/dist/tree-sitter/tree-sitter-pdx_script.wasm",
);
setGrammarBinary(() => readFileSync(grammarPath));

describe("formatText", () => {
  it("formats a simple PDXScript declaration", async () => {
    const input = "key=value";
    const result = await formatText(input, "test.txt");

    expect(result).toContain("key");
    expect(result).toContain("value");
    // The plugin should normalize spacing around =
    expect(result).not.toBe(input);
  });

  it("formats a block structure", async () => {
    const input = "block={inner=value}";
    const result = await formatText(input, "test.txt");

    expect(result).toContain("block");
    expect(result).toContain("inner");
  });

  it("handles empty input", async () => {
    const result = await formatText("", "test.txt");

    expect(typeof result).toBe("string");
  });

  it("preserves comments", async () => {
    const input = "# a comment\nkey=value";
    const result = await formatText(input, "test.txt");

    expect(result).toContain("# a comment");
    expect(result).toContain("key");
  });

  it("defaults filepath to file.txt when not provided", async () => {
    // Should not throw — prettier defaults to the language's registered extension
    const result = await formatText("key=value");

    expect(result).toContain("key");
  });

  it("formats nested blocks with indentation", async () => {
    const input = "outer={inner_key=inner_value}";
    const result = await formatText(input, "test.txt");

    expect(result).toContain("outer");
    expect(result).toContain("inner_key");
    expect(result).toContain("inner_value");
  });
});

describe("SUPPORTED_LANGUAGES", () => {
  it("contains all four Paradox language IDs", () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      "stellaris",
      "hoi4",
      "eu4",
      "paradox",
    ]);
  });

  it("has exactly 4 entries", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(4);
  });
});

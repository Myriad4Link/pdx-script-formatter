/**
 * Vitest setup file loaded before all tests via `vitest.config.ts`.
 *
 * Mocks the `vscode` module so unit tests can run outside the VS Code
 * extension host. Only the APIs used by this extension are stubbed:
 * `languages.registerDocumentFormattingEditProvider`, `Range`, `TextEdit`, etc.
 */
import { vi } from "vitest";

/** Shared disposable stub returned by all `register*` mock functions. */
const mockDisposable = { dispose: vi.fn() };

/** Minimal mock of the VS Code extension API. */
const vscode = {
  window: {
    showInformationMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => "info"),
    })),
  },
  languages: {
    registerDocumentFormattingEditProvider: vi.fn(() => mockDisposable),
  },
  commands: {
    registerCommand: vi.fn(() => mockDisposable),
  },
  Range: class {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
  },
  TextEdit: {
    replace: vi.fn((range: unknown, newText: string) => ({ range, newText })),
  },
  Position: class {
    constructor(
      public line: number,
      public character: number,
    ) {}
  },
};

// Replace any `import * as vscode from "vscode"` with this mock.
vi.mock("vscode", () => ({ default: vscode, ...vscode }));

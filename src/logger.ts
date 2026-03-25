/**
 * Debug logging for the PDXScript Formatter extension.
 *
 * All messages go to a dedicated VS Code Output Channel
 * ("PDXScript Formatter"), visible via View → Output → PDXScript Formatter.
 *
 * Logging is gated by the `pdxScriptFormatter.debug` setting so nothing
 * appears in the user's Output panel unless they opt in.
 *
 * Usage:
 * ```ts
 * import { log, setLogLevel } from "./logger";
 * log.info("Extension activated");
 * log.debug("WASM path", grammarPath);
 * log.error("Format failed", err);
 * ```
 */

import * as vscode from "vscode";

/** Log levels in ascending verbosity. */
export enum LogLevel {
  /** Nothing is logged. */
  OFF = 0,
  /** Errors only. */
  ERROR = 1,
  /** Errors + warnings. */
  WARN = 2,
  /** Errors + warnings + informational messages. */
  INFO = 3,
  /** Everything, including verbose diagnostic details. */
  DEBUG = 4,
  TRACE = 5,
}

const CHANNEL_NAME = "PDXScript Formatter";

let channel: vscode.OutputChannel | undefined;

/** Lazily create the Output Channel (survives test runs without vscode). */
function getChannel(): vscode.OutputChannel | undefined {
  if (!channel) {
    try {
      channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    } catch {
      // vscode API not available (e.g. unit test) — no-op
    }
  }
  return channel;
}

/** Current log level — defaults to DEBUG so all logs appear while debugging. */
let currentLevel: LogLevel = LogLevel.DEBUG;

/**
 * Returns the log level from the user's settings, or falls back to the
 * explicitly-set level.
 */
function getConfiguredLevel(): LogLevel {
  return currentLevel;
}

/**
 * Override the log level programmatically.
 *
 * Call this once during activation after reading the user's setting.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Parse a string log level name to `LogLevel`.
 *
 * Accepts "off", "error", "warn", "info", "debug", "trace"
 * (case-insensitive).  Defaults to `LogLevel.INFO` for unrecognized values.
 */
export function parseLogLevel(name: string): LogLevel {
  switch (name.toLowerCase().trim()) {
    case "off":
      return LogLevel.OFF;
    case "error":
      return LogLevel.ERROR;
    case "warn":
      return LogLevel.WARN;
    case "info":
      return LogLevel.INFO;
    case "debug":
      return LogLevel.DEBUG;
    case "trace":
      return LogLevel.TRACE;
    default:
      return LogLevel.INFO;
  }
}

/** Format a timestamp as HH:MM:SS.mmm for log lines. */
function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Core write function.  Checks the current level, formats the message, and
 * writes to the Output Channel if one exists.
 */
function write(level: LogLevel, tag: string, ...args: unknown[]): void {
  if (level > getConfiguredLevel()) {
    return;
  }

  const ch = getChannel();
  if (!ch) {
    return;
  }

  const label =
    level === LogLevel.ERROR
      ? "[ERROR]"
      : level === LogLevel.WARN
        ? "[WARN ]"
        : level === LogLevel.INFO
          ? "[INFO ]"
          : level === LogLevel.DEBUG
            ? "[DEBUG]"
            : "[TRACE]";

  const msg = args
    .map((a) => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}${a.stack ? "\n" + a.stack : ""}`;
      }
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a, null, 2);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");

  ch.appendLine(`${timestamp()} ${label} [${tag}] ${msg}`);
}

/**
 * Typed logger object.
 *
 * Each method writes at the corresponding log level.
 * The `tag` parameter lets you filter logs by subsystem.
 *
 * All methods are safe to call even when the Output Channel hasn't been
 * created yet (they become no-ops).
 */
export const log = {
  error: (...args: unknown[]) => write(LogLevel.ERROR, "main", ...args),
  warn: (...args: unknown[]) => write(LogLevel.WARN, "main", ...args),
  info: (...args: unknown[]) => write(LogLevel.INFO, "main", ...args),
  debug: (...args: unknown[]) => write(LogLevel.DEBUG, "main", ...args),
  trace: (...args: unknown[]) => write(LogLevel.TRACE, "main", ...args),

  /** Create a sub-logger that prefixes every message with the given tag. */
  tagged(tag: string) {
    return {
      error: (...args: unknown[]) => write(LogLevel.ERROR, tag, ...args),
      warn: (...args: unknown[]) => write(LogLevel.WARN, tag, ...args),
      info: (...args: unknown[]) => write(LogLevel.INFO, tag, ...args),
      debug: (...args: unknown[]) => write(LogLevel.DEBUG, tag, ...args),
      trace: (...args: unknown[]) => write(LogLevel.TRACE, tag, ...args),
    };
  },
};

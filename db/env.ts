import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function loadLocalEnvFiles(
  options: {
    cwd?: string;
    files?: string[];
    env?: NodeJS.ProcessEnv;
  } = {}
): void {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const files = options.files ?? [".env", ".env.local"];
  const initiallyDefinedKeys = new Set(Object.keys(env));

  for (const file of files) {
    const path = join(cwd, file);

    if (!existsSync(path)) {
      continue;
    }

    const parsed = parseEnvFile(readFileSync(path, "utf8"));

    for (const [key, value] of Object.entries(parsed)) {
      if (initiallyDefinedKeys.has(key)) {
        continue;
      }

      env[key] = value;
    }
  }
}

export function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    values[key] = parseEnvValue(rawValue);
  }

  return values;
}

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trim();
  const quote = value[0];

  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    const unquoted = value.slice(1, -1);

    if (quote === "\"") {
      return unquoted
        .replaceAll("\\n", "\n")
        .replaceAll("\\r", "\r")
        .replaceAll("\\t", "\t")
        .replaceAll('\\"', '"')
        .replaceAll("\\\\", "\\");
    }

    return unquoted;
  }

  return value.replace(/\s+#.*$/, "").trim();
}

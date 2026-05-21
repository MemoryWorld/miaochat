export const configPackageName = "@agenthub/config";

export const sharedConfigPaths = {
  eslint: "eslint/base.js",
  tsconfig: "tsconfig/base.json",
  vitest: "vitest/base.ts"
} as const;

export type SharedConfigName = keyof typeof sharedConfigPaths;

export function getSharedConfigPath(name: SharedConfigName): string {
  return sharedConfigPaths[name];
}

import baseConfig from "./packages/config/eslint/base.js";

export default [
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "**/.turbo/**",
      "**/node_modules/**"
    ]
  },
  ...baseConfig
];

// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

/**
 * Shared flat ESLint config for Rovrum packages.
 * Consume from a package's eslint.config.js:
 *
 *   import config from "@rovrum/eslint-config";
 *   export default config;
 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/generated/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
);

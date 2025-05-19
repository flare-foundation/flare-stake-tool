import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";


export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts}"], languageOptions: { globals: globals.browser } },
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "guard-for-in": "warn",
      "linebreak-style": ["error", "unix"],
      "no-console": "off",
      "no-empty": "warn",
      "prefer-const": "off",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-for-in-array": "error",
      "@typescript-eslint/prefer-namespace-keyword": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
          "varsIgnorePattern": "^_",
          "argsIgnorePattern": "."
      }],
      // "node/no-extraneous-import": "error",
      // "node/no-extraneous-require": "error",
      // "@typescript-eslint/no-explicit-any": "off",
      // "guard-for-in": "warn",
      // "no-fallthrough": "error",
      // '@typescript-eslint/await-thenable': 'warn',
      // "@typescript-eslint/no-unused-vars": ["error", {
      //   "caughtErrors": "none"
      // }]
    },
  },
  globalIgnores(["dist/", "node_modules/"]),
]);

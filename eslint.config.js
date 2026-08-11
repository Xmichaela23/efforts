import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import consistentButtonShape from "./eslint-rules/consistent-button-shape.js";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      efforts: { rules: { "consistent-button-shape": consistentButtonShape } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // ⛔ BUTTON SHAPE IS ONE SHAPE (2026-08-11). Buttons are rounded-xl via <GalaxyButton>;
      // this catches raw off-standard radii so the shape can't drift per-element again. Starts as a
      // warning so it surfaces without failing the build on pre-existing buttons; ratchet to "error"
      // once the codebase is clean.
      "efforts/consistent-button-shape": "warn",
    },
  }
);

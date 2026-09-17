module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  plugins: ["@typescript-eslint"],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ["dist/", "node_modules/", "coverage/", "*.js", "*.d.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-non-null-assertion": "warn",
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
};

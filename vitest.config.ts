import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const pkg = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript source so tests never depend
    // on a prior `npm run build` having produced dist/.
    alias: {
      "@polyglot-img/binary": pkg("./packages/binary/src/index.ts"),
      "@polyglot-img/core": pkg("./packages/core/src/index.ts"),
      "@polyglot-img/sdk": pkg("./packages/sdk/src/index.ts"),
      "@polyglot-img/cli": pkg("./packages/cli/src/index.ts"),
      "@polyglot-img/formats-png": pkg("./packages/formats/png/src/index.ts"),
      "@polyglot-img/formats-jpeg": pkg("./packages/formats/jpeg/src/index.ts"),
      "@polyglot-img/formats-zip": pkg("./packages/formats/zip/src/index.ts"),
      "@polyglot-img/browser": pkg("./packages/browser/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts"],
    globals: true
  },
  resolve: {
    alias: {
      "@hipflow/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@hipflow/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@hipflow/audio": new URL("./packages/audio/src/index.ts", import.meta.url).pathname,
      "@hipflow/storage": new URL("./packages/storage/src/index.ts", import.meta.url).pathname,
      "@hipflow/ui-contract": new URL("./packages/ui-contract/src/index.ts", import.meta.url).pathname
    }
  }
});

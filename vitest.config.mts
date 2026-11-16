import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Server-only modules are tested in Node, where the guard would throw.
      "server-only": path.resolve(import.meta.dirname, "src/lib/__mocks__/server-only.ts"),
    },
  },
});

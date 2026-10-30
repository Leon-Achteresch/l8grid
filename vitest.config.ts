import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // Randomized tests are CPU heavy and run on their own (npm run test:compat, npm run test:fuzz).
    exclude: [...configDefaults.exclude, "e2e/**", "src/compat.test.tsx", "src/fuzz.test.tsx"],
  },
});

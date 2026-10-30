import { configDefaults, defineConfig } from "vitest/config";

// CPU-heavy randomized tests, run on their own: npm run test:compat, npm run test:fuzz
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/compat.test.tsx", "src/fuzz.test.tsx"],
    exclude: [...configDefaults.exclude],
    fileParallelism: false,
  },
});

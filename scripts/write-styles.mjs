// Writes dist/styles.css from the built package, for setups that load the stylesheet themselves
// (server rendering, strict Content-Security-Policy).
import { writeFileSync } from "node:fs";

const { gridStyles } = await import("../dist/index.mjs");
writeFileSync(new URL("../dist/styles.css", import.meta.url), gridStyles.trim() + "\n");

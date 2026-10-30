// Fails when the gzipped ESM bundle grows past the limit, so size regressions show up in review.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 18 * 1024;
const size = gzipSync(readFileSync(new URL("../dist/index.mjs", import.meta.url))).length;
console.log(`dist/index.mjs: ${(size / 1024).toFixed(2)} kB gzip (limit ${LIMIT / 1024} kB)`);
if (size > LIMIT) process.exit(1);

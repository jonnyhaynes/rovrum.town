// tsc compiles the generated client's .ts → dist/, but leaves behind Prisma's
// native query-engine binary (a .node file it doesn't understand). Copy any such
// binaries from the generated source into dist so `@rovrum/db/dist` is a complete,
// runnable package (matters for the Docker image / any deployment).
import { readdirSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("../src/generated/prisma/", import.meta.url));
const outDir = fileURLToPath(new URL("../dist/generated/prisma/", import.meta.url));

if (!existsSync(srcDir)) {
  console.error("copy-engine: generated client missing — run `prisma generate` first.");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const name of readdirSync(srcDir)) {
  // Prisma engine binaries: libquery_engine-*.node / *.so.node / *.dylib.node.
  if (name.endsWith(".node")) {
    copyFileSync(srcDir + name, outDir + name);
    copied++;
  }
}
console.log(`copy-engine: copied ${copied} engine binary(ies) into dist.`);

// Copies what pdf.js loads at runtime out of node_modules into public/pdfjs:
// the worker, the character maps (without them Chinese and Japanese PDFs render
// as boxes) and the standard fonts. Runs on `npm install` and before a build;
// public/pdfjs is generated, so it is git-ignored.
import { cp, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "pdfjs-dist");
const target = path.join(root, "public", "pdfjs");

if (!existsSync(source)) {
  console.log("[pdfjs] pdfjs-dist is not installed yet; skipping asset copy");
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(source, "build", "pdf.worker.min.mjs"), path.join(target, "pdf.worker.min.mjs"));
await cp(path.join(source, "cmaps"), path.join(target, "cmaps"), { recursive: true });
await cp(path.join(source, "standard_fonts"), path.join(target, "standard_fonts"), { recursive: true });
console.log("[pdfjs] worker, cmaps and standard fonts copied to public/pdfjs");

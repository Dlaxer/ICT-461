import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
const files = [
  "index.html",
  "student.html",
  "admin.html",
  "css/style.css",
  "css/student.css",
  "css/admin.css",
  "js/auth.js",
  "js/firebase.js",
  "js/student.js",
  "js/admin.js"
];

rmSync(output, { recursive: true, force: true });
for (const file of files) {
  const source = resolve(root, file);
  const destination = resolve(output, file);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

const images = resolve(root, "img");
const crest = resolve(images, "crest.png");
if (existsSync(crest)) {
  mkdirSync(resolve(output, "img"), { recursive: true });
  cpSync(crest, resolve(output, "img", "crest.png"));
}

console.log(`Built Hosting files in ${output}`);

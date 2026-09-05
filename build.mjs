import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const files = ["all.json", "all.js", "index.html", "_headers", "README.md"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const file of files) {
  if (existsSync(file)) {
    cpSync(file, "dist/" + file);
  }
}

console.log("Prepared static friend circle dist/");

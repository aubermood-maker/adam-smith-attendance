import { cpSync, existsSync, mkdirSync } from "node:fs";

if (!existsSync("dist/server/index.js")) {
  throw new Error("vinext server entrypoint was not created.");
}

mkdirSync("dist/.openai", { recursive: true });
cpSync(".openai/hosting.json", "dist/.openai/hosting.json");

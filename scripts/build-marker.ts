import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const revision = process.env.CF_PAGES_COMMIT_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
writeFileSync("out/build-info.json", JSON.stringify({ revision, builtAt: new Date().toISOString(), features: "batch-studio-v1" }));

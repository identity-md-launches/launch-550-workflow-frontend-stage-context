import { writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { root, files, read, sha, manifestBase } from "./shared.mjs";
const manifest = manifestBase();
manifest.assets = files("dist")
  .filter((p) => p !== "dist/imd-deployment.json")
  .map((p) => ({ path: p.slice(5), sha256: sha(read(p)) }));
if (manifest.assets.length > 128) throw new Error("Too many assets");
for (const asset of manifest.assets)
  if (statSync(resolve(root, "dist", asset.path)).size > 8388608)
    throw new Error("Asset too large");
writeFileSync(
  resolve(root, "dist/imd-deployment.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Deployment manifest: ${manifest.assets.length} hashed assets`);

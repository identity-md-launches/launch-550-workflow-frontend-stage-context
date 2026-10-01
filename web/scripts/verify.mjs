import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  root,
  handoff,
  files,
  read,
  json,
  sha,
  abiHash,
  canonical,
  manifestBase,
} from "./shared.mjs";
const m = json("dist/imd-deployment.json");
assert.equal(
  canonical({ ...m, assets: [] }),
  canonical(manifestBase()),
  "Exact handoff + network binding",
);
assert.deepEqual(
  m.assets.map((a) => a.path).sort(),
  files("dist")
    .filter((p) => p !== "dist/imd-deployment.json")
    .map((p) => p.slice(5))
    .sort(),
);
assert(m.assets.length <= 128);
let total = read("dist/imd-deployment.json").length;
for (const asset of m.assets) {
  assert(
    !asset.path.startsWith("/") &&
      !asset.path.includes("..") &&
      !asset.path.includes("://"),
  );
  const bytes = read(`dist/${asset.path}`);
  total += bytes.length;
  assert(bytes.length <= 8388608);
  assert.equal(sha(bytes), asset.sha256);
}
for (const c of m.contracts) {
  assert.equal(abiHash(json(`dist/${c.abiPath}`)), c.abiHash);
  assert(
    read(`dist/${c.abiPath}`).equals(
      execFileSync(
        "git",
        ["show", `${handoff.sourceCommit}:docs/abi/${c.name}.json`],
        { cwd: root },
      ),
    ),
  );
}
assert(total < 32 * 1024 * 1024);
console.log(
  `PASS: exact handoff/network, pinned ABIs, ${m.assets.length} asset hashes, ${total} export bytes.`,
);

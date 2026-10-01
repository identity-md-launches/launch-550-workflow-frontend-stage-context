import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  root,
  handoff,
  network,
  read,
  abiHash,
  poolHash,
  manifestBase,
} from "./shared.mjs";
if (handoff.chainId !== network.network.chainId)
  throw new Error("Network chain mismatch");
for (const contract of handoff.contracts) {
  const path = `docs/abi/${contract.name}.json`;
  const pinned = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${path}`],
    { cwd: root },
  );
  if (!pinned.equals(read(path)))
    throw new Error(`ABI differs from pinned source: ${path}`);
  if (abiHash(JSON.parse(pinned)) !== contract.abiHash)
    throw new Error(`ABI hash mismatch: ${path}`);
  console.log(`Verified ${contract.name}: ${contract.abiHash}`);
}
// Only hashes are embedded; runtime chain, contract addresses and ABIs come from the manifest.
writeFileSync(
  resolve(root, "web/src/binding.ts"),
  `// Generated from the validated handoff by scripts/prepare.mjs.\nexport const binding = ${JSON.stringify({ launchTx: handoff.contracts[0].txHash, poolId: poolHash, manifestHash: abiHash(manifestBase()) }, null, 2)} as const;\n`,
);
mkdirSync(resolve(root, "web/public/abi"), { recursive: true });
for (const c of handoff.contracts)
  writeFileSync(
    resolve(root, `web/public/abi/${c.name}.json`),
    read(`docs/abi/${c.name}.json`),
  );
writeFileSync(
  resolve(root, "web/public/imd-deployment.json"),
  JSON.stringify(manifestBase(), null, 2) + "\n",
);

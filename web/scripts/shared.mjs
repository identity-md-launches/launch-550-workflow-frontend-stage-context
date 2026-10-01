import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  keccak256,
  stringToHex,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const read = (p) => readFileSync(resolve(root, p));
export const json = (p) => JSON.parse(read(p));
export const handoff = json("web/handoff/deployment.json");
export const network = json("web/handoff/network.json");
export const canonical = (x) => JSON.stringify(sort(x));
function sort(x) {
  return Array.isArray(x)
    ? x.map(sort)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, sort(x[k])]),
        )
      : x;
}
export const abiHash = (abi) => keccak256(stringToHex(canonical(abi))).slice(2);
export const sha = (data) => createHash("sha256").update(data).digest("hex");
export function files(dir) {
  return readdirSync(resolve(root, dir))
    .flatMap((name) => {
      const p = `${dir}/${name}`;
      return statSync(resolve(root, p)).isDirectory() ? files(p) : [p];
    })
    .sort();
}
export const poolHash = keccak256(
  encodeAbiParameters(
    parseAbiParameters("address,address,uint24,int24,address"),
    [
      handoff.poolKey.currency0,
      handoff.poolKey.currency1,
      handoff.poolKey.fee,
      handoff.poolKey.tickSpacing,
      handoff.poolKey.hooks,
    ],
  ),
);
export const manifestBase = () => ({
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
    abiPath: `abi/${name}.json`,
  })),
  assets: [],
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
});

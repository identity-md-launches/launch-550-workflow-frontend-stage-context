import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  keccak256,
  stringToHex,
  getAddress,
  parseAbi,
  type Abi,
  type Address,
} from "viem";
import { binding } from "./binding";

export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: Record<
      | "poolManager"
      | "universalRouter"
      | "quoter"
      | "stateView"
      | "positionManager"
      | "permit2",
      Address
    >;
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
export const canonical = (x: unknown): string => JSON.stringify(sort(x));
function sort(x: unknown): unknown {
  return Array.isArray(x)
    ? x.map(sort)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, sort((x as Record<string, unknown>)[k])]),
        )
      : x;
}
export const hashObject = (x: unknown) =>
  keccak256(stringToHex(canonical(x))).slice(2);
const safePath = (path: string) =>
  path.length > 0 &&
  !path.startsWith("/") &&
  !path.includes("..") &&
  !path.includes(":");
async function fetchJson(path: string) {
  if (!safePath(path))
    throw new Error("Deployment contains an unsafe asset path.");
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`Could not load ${path}. Reload to retry.`);
  return response.json();
}
export async function loadConfig() {
  const deployment: Deployment = await fetchJson("imd-deployment.json");
  if (hashObject({ ...deployment, assets: [] }) !== binding.manifestHash)
    throw new Error(
      "Deployment verification failed. Configuration differs from the build handoff.",
    );
  const contracts = await Promise.all(
    deployment.contracts.map(async (c) => {
      const abi: Abi = await fetchJson(c.abiPath);
      if (!Array.isArray(abi) || hashObject(abi) !== c.abiHash)
        throw new Error(`ABI verification failed for ${c.name}.`);
      return { ...c, address: getAddress(c.address), abi };
    }),
  );
  const token = contracts.find((c) => c.name === "LaunchToken");
  const vault = contracts.find((c) => c.name === "StakingVault");
  if (!token || !vault)
    throw new Error("The token or staking vault is missing.");
  const n = deployment.network;
  const chain = defineChain({
    id: deployment.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: n.name, url: n.explorer } },
    testnet: n.testnet,
  });
  const client = createPublicClient({
    chain,
    transport: fallback(
      n.rpcUrls.map((url) =>
        http(url, { batch: { wait: 20 }, timeout: 12000, retryCount: 1 }),
      ),
    ),
    batch: { multicall: false },
  });
  return { deployment, token, vault, chain, client };
}
export type Config = Awaited<ReturnType<typeof loadConfig>>;
export const protocol = {
  pool: parseAbi([
    "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  ]),
  quoter: parseAbi([
    "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
  ]),
  router: parseAbi([
    "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  ]),
  permit2: parseAbi([
    "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
    "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  ]),
};

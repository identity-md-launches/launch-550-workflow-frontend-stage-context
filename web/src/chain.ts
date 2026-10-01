import {
  decodeEventLog,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  zeroAddress,
  parseUnits,
  formatUnits,
  type Address,
  type Abi,
  type Hex,
} from "viem";
import { protocol, type Config } from "./config";
import { binding } from "./binding";
export type Snapshot = {
  block: bigint;
  timestamp: bigint;
  fetchedAt: number;
  decimals: number;
  symbol: string;
  total: bigint;
  apr: bigint;
  reserve: bigint;
  rate: bigint;
  finish: bigint;
  queued: bigint;
  lockDuration: bigint;
  duration: bigint;
  wallet: bigint;
  native: bigint;
  stake: bigint;
  earned: bigint;
  unlock: bigint;
  allowance: bigint;
};
export async function readSnapshot(
  c: Config,
  account?: Address,
): Promise<Snapshot> {
  const chain = await c.client.getChainId();
  if (chain !== c.deployment.chainId)
    throw new Error("RPC returned the wrong chain. Actions are disabled.");
  const block = await c.client.getBlock();
  const [tokenCode, vaultCode] = await Promise.all([
    c.client.getCode({ address: c.token.address, blockNumber: block.number }),
    c.client.getCode({ address: c.vault.address, blockNumber: block.number }),
  ]);
  if (!tokenCode || tokenCode === "0x" || !vaultCode || vaultCode === "0x")
    throw new Error("Deployed contract code could not be verified.");
  const read = (
    contract: { address: Address; abi: Abi },
    functionName: string,
    args: readonly unknown[] = [],
  ) =>
    c.client.readContract({
      ...contract,
      functionName,
      args,
      blockNumber: block.number,
    });
  const values = await Promise.all([
    read(c.vault, "token"),
    read(c.token, "decimals"),
    read(c.token, "symbol"),
    ...[
      "totalStaked",
      "aprBps",
      "rewardReserve",
      "rewardRate",
      "periodFinish",
      "unallocatedRewards",
      "LOCK_DURATION",
      "REWARD_DURATION",
    ].map((f) => read(c.vault, f)),
    ...(account
      ? [
          read(c.token, "balanceOf", [account]),
          c.client.getBalance({ address: account, blockNumber: block.number }),
          read(c.vault, "balanceOf", [account]),
          read(c.vault, "earned", [account]),
          read(c.vault, "unlockTime", [account]),
          read(c.token, "allowance", [account, c.vault.address]),
        ]
      : [0n, 0n, 0n, 0n, 0n, 0n]),
  ]);
  if (String(values[0]).toLowerCase() !== c.token.address.toLowerCase())
    throw new Error("Vault token does not match the verified deployment.");
  const [
    ,
    ,
    symbol,
    total,
    apr,
    reserve,
    rate,
    finish,
    queued,
    lockDuration,
    duration,
    wallet,
    native,
    stake,
    earned,
    unlock,
    allowance,
  ] = values;
  return {
    block: block.number,
    timestamp: block.timestamp,
    fetchedAt: Date.now(),
    decimals: Number(values[1]),
    symbol: String(symbol),
    total,
    apr,
    reserve,
    rate,
    finish,
    queued,
    lockDuration,
    duration,
    wallet,
    native,
    stake,
    earned,
    unlock,
    allowance,
  } as Snapshot;
}
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export async function readPool(c: Config): Promise<PoolKey> {
  const receipt = await c.client.getTransactionReceipt({
    hash: binding.launchTx,
  });
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !==
      c.deployment.network.uniswapV4.poolManager.toLowerCase()
    )
      continue;
    try {
      const { args } = decodeEventLog({
        abi: protocol.pool,
        data: log.data,
        topics: log.topics,
      });
      if (args.id !== binding.poolId) continue;
      const key = {
        currency0: args.currency0,
        currency1: args.currency1,
        fee: args.fee,
        tickSpacing: args.tickSpacing,
        hooks: args.hooks,
      };
      const hash = keccak256(
        encodeAbiParameters(
          parseAbiParameters("address,address,uint24,int24,address"),
          [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
        ),
      );
      if (
        hash !== binding.poolId ||
        ![key.currency0.toLowerCase(), key.currency1.toLowerCase()].includes(
          c.token.address.toLowerCase(),
        )
      )
        throw new Error("Pool binding mismatch");
      if (![key.currency0, key.currency1].includes(zeroAddress))
        throw new Error(
          "This release supports the attested native ETH pair only.",
        );
      for (const name of ["quoter", "universalRouter", "permit2"] as const) {
        const code = await c.client.getCode({
          address: c.deployment.network.uniswapV4[name],
        });
        if (!code || code === "0x") throw new Error(`No code at ${name}`);
      }
      return key;
    } catch (error) {
      if (
        String(error).includes("Pool binding") ||
        String(error).includes("No code")
      )
        throw error;
    }
  }
  throw new Error("The attested pool could not be verified. Refresh to retry.");
}
export function amount(value: string, decimals: number): bigint {
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a positive amount with up to ${decimals} decimal places.`,
    );
  const parsed = parseUnits(value, decimals);
  if (parsed <= 0n) throw new Error("Enter an amount greater than zero.");
  return parsed;
}
export function display(value: bigint, decimals = 18, places = 4) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const tail = fraction.slice(0, places).replace(/0+$/, "");
  return (
    BigInt(whole).toLocaleString("en-US") +
    (tail ? `.${tail}` : "") +
    (value > 0n && whole === "0" && !tail
      ? ` (<0.${"0".repeat(places - 1)}1)`
      : "")
  );
}
export const date = (time: bigint) =>
  time
    ? new Date(Number(time) * 1000).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "No active period";
export function swapCall(
  c: Config,
  key: PoolKey,
  buy: boolean,
  input: bigint,
  minimum: bigint,
  deadline: bigint,
) {
  const inputCurrency = buy ? zeroAddress : c.token.address;
  const outputCurrency = buy ? c.token.address : zeroAddress;
  const swap = encodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ),
    [
      {
        poolKey: key,
        zeroForOne: key.currency0.toLowerCase() === inputCurrency.toLowerCase(),
        amountIn: input,
        amountOutMinimum: minimum,
        hookData: "0x",
      },
    ],
  );
  const settle = encodeAbiParameters(parseAbiParameters("address,uint256"), [
    inputCurrency,
    input,
  ]);
  const take = encodeAbiParameters(parseAbiParameters("address,uint256"), [
    outputCurrency,
    minimum,
  ]);
  const encoded = encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
    "0x060c0f",
    [swap, settle, take],
  ]);
  return {
    address: c.deployment.network.uniswapV4.universalRouter,
    abi: protocol.router,
    functionName: "execute",
    args: ["0x10", [encoded], deadline],
    value: buy ? input : 0n,
  } as const;
}
const errors: Record<string, string> = {
  StakeLocked:
    "Your seven-day lock is still active. Refresh and wait until the unlock time.",
  InsufficientStake:
    "The amount exceeds your stake. Refresh and enter a smaller amount.",
  NoRewards: "There are no rewards to claim yet. Refresh your position.",
  ActiveRewardPeriod:
    "The current reward period is still active. Wait until it ends.",
  RewardDurationTooShort:
    "The reward period is shorter than your minimum. Choose a shorter minimum or wait for a new period.",
  InsufficientRewardFunding:
    "The reward amount is too small to start a stream. Increase the funding amount.",
  ERC20InsufficientBalance:
    "Your token balance is too low. Refresh and enter a smaller amount.",
  ERC20InsufficientAllowance:
    "The token allowance is too low. Approve the amount first.",
  ZeroAmount: "Enter an amount greater than zero.",
  UnexpectedTokenAmount:
    "The vault received an unexpected token amount. No changes were made.",
};
export function errorMessage(error: unknown): string {
  const e = error as {
    shortMessage?: string;
    message?: string;
    code?: number;
    cause?: unknown;
    data?: { errorName?: string };
  };
  if (
    e?.code === 4001 ||
    /rejected|denied/i.test(e?.shortMessage ?? e?.message ?? "")
  )
    return "Request declined in your wallet. You can try again when ready.";
  if (e?.data?.errorName && errors[e.data.errorName])
    return errors[e.data.errorName];
  if (e?.cause) {
    const nested = errorMessage(e.cause);
    if (nested !== "Unable to complete this request. Refresh and try again.")
      return nested;
  }
  const message = e?.shortMessage ?? e?.message ?? "";
  for (const [name, copy] of Object.entries(errors))
    if (message.includes(name)) return copy;
  if (/insufficient funds/i.test(message))
    return "Not enough ETH for this transaction and gas. Add Sepolia ETH and try again.";
  if (/HTTP|fetch|network|timed out|timeout/i.test(message))
    return "Network request failed. Check your connection and refresh to retry.";
  return message.length > 0 && message.length < 240
    ? message
    : "Unable to complete this request. Refresh and try again.";
}
export type TxCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
export type TxHash = Hex;

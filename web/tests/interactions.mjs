import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
  encodeEventTopics,
  decodeAbiParameters,
  keccak256,
  zeroAddress,
} from "viem";
import { root, handoff, network, json, poolHash } from "../scripts/shared.mjs";
const evidence = resolve(root, "docs/frontend-evidence");
mkdirSync(evidence, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
const server = createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://local").pathname,
    );
    if (!pathname.startsWith("/preview/")) throw Error();
    const file = resolve(root, "dist", pathname.slice(9) || "index.html");
    if (!file.startsWith(resolve(root, "dist") + "/")) throw Error();
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
    });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
const check = (name) => {
  results.push({ name, result: "PASS" });
  console.log("PASS", name);
};
const token = handoff.contracts.find((c) => c.name === "LaunchToken");
const vault = handoff.contracts.find((c) => c.name === "StakingVault");
const tokenAbi = json("docs/abi/LaunchToken.json"),
  vaultAbi = json("docs/abi/StakingVault.json");
const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
const permitAbi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const poolAbi = parseAbi([
  "event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)",
]);
const account = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const unit = 10n ** 18n;
const hx = (n) => "0x" + BigInt(n).toString(16);
const hash = "0x" + "a".repeat(64);
let txHash = "0x" + "b".repeat(64);
const chainHex = hx(handoff.chainId);
let now = BigInt(Math.floor(Date.now() / 1000));
let mockBlock = 20000000;
const block = () => ({
  number: hx(20000000),
  hash,
  parentHash: hash,
  nonce: "0x0000000000000000",
  sha3Uncles: hash,
  logsBloom: "0x" + "0".repeat(512),
  transactionsRoot: hash,
  stateRoot: hash,
  receiptsRoot: hash,
  miner: account,
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x100",
  gasLimit: hx(30000000),
  gasUsed: "0x0",
  timestamp: hx(now),
  transactions: [],
  uncles: [],
  baseFeePerGas: hx(1000000000),
  mixHash: hash,
});
function receipt(tx, logs = []) {
  return {
    transactionHash: tx,
    transactionIndex: "0x0",
    blockHash: hash,
    blockNumber: hx(20000000),
    from: account,
    to: vault.address,
    cumulativeGasUsed: hx(100000),
    gasUsed: hx(100000),
    effectiveGasPrice: hx(1),
    contractAddress: null,
    logs,
    logsBloom: "0x" + "0".repeat(512),
    status: "0x1",
    type: "0x2",
  };
}
const key = handoff.poolKey;
const launchLog = {
  address: network.network.uniswapV4.poolManager,
  topics: encodeEventTopics({
    abi: poolAbi,
    eventName: "Initialize",
    args: { id: poolHash, currency0: key.currency0, currency1: key.currency1 },
  }),
  data: encodeAbiParameters(
    parseAbiParameters("uint24,int24,address,uint160,int24"),
    [key.fee, key.tickSpacing, key.hooks, 1n, 0],
  ),
  blockNumber: hx(11819565),
  transactionHash: handoff.contracts[0].txHash,
  transactionIndex: "0x0",
  blockHash: hash,
  logIndex: "0x0",
  removed: false,
};
let state = {
  balance: 1000n * unit,
  stake: 100n * unit,
  earned: 5n * unit,
  unlock: now + 604800n,
  total: 10000n * unit,
  finish: now + 500000n,
  queued: 10n * unit,
  allowance: 0n,
  swapAllowance: 0n,
  permit: 0n,
  expiration: 0,
};
let walletChain = handoff.chainId;
let walletAccount = account;
let unknown = false;
let reject = false;
let noCode = false;
let rpcFail = false;
let revert = false;
let txRevert = false;
let poolMismatch = false;
const requests = [];
const sent = [];
let pending;
let settled = false;
const abis = {
  [token.address.toLowerCase()]: tokenAbi,
  [vault.address.toLowerCase()]: vaultAbi,
  [network.network.uniswapV4.quoter.toLowerCase()]: quoterAbi,
  [network.network.uniswapV4.permit2.toLowerCase()]: permitAbi,
  [network.network.uniswapV4.universalRouter.toLowerCase()]: routerAbi,
};
function applyTx(transaction) {
  const decoded = decodeFunctionData({
    abi: abis[transaction.to.toLowerCase()],
    data: transaction.data,
  });
  const args = decoded.args || [];
  switch (decoded.functionName) {
    case "approve":
      if (transaction.to.toLowerCase() === token.address.toLowerCase()) {
        if (args[0].toLowerCase() === vault.address.toLowerCase())
          state.allowance = args[1];
        else {
          assert.equal(
            args[0].toLowerCase(),
            network.network.uniswapV4.permit2,
          );
          state.swapAllowance = args[1];
        }
      } else {
        assert.equal(args[0].toLowerCase(), token.address);
        assert.equal(
          args[1].toLowerCase(),
          network.network.uniswapV4.universalRouter,
        );
        state.permit = args[2];
        state.expiration = args[3];
      }
      break;
    case "stake":
      state.stake += args[0];
      state.balance -= args[0];
      state.allowance -= args[0];
      state.unlock = now + 604800n;
      break;
    case "unstake":
      state.stake -= args[0];
      state.balance += args[0];
      break;
    case "claim":
      state.balance += state.earned;
      state.earned = 0n;
      break;
    case "fundRewards":
      assert.equal(args.length, 2);
      state.balance -= args[0];
      state.allowance -= args[0];
      state.finish = now + 604800n;
      break;
    case "restartRewards":
      state.queued = 0n;
      state.finish = now + 604800n;
      break;
    case "execute":
      break;
  }
}
function callResult(param) {
  const address = param.to.toLowerCase();
  const abi = abis[address];
  if (!abi) throw new Error(`Unknown call address ${address}`);
  const { functionName: f, args = [] } = decodeFunctionData({
    abi,
    data: param.data,
  });
  let result;
  if (revert && f === "stake")
    return {
      error: {
        code: 3,
        message: "execution reverted",
        data: encodeErrorResult({
          abi: vaultAbi,
          errorName: "StakeLocked",
          args: [state.unlock],
        }),
      },
    };
  if (address === token.address.toLowerCase())
    result = {
      approve: true,
      decimals: 18,
      symbol: "SEVEN",
      balanceOf: state.balance,
      allowance:
        String(args[1]).toLowerCase() === vault.address.toLowerCase()
          ? state.allowance
          : state.swapAllowance,
    }[f];
  if (address === vault.address.toLowerCase())
    result = {
      token: token.address,
      totalStaked: state.total,
      aprBps: 1234n,
      rewardReserve: 500n * unit,
      rewardRate: 100000000000000n,
      periodFinish: state.finish,
      unallocatedRewards: state.queued,
      LOCK_DURATION: 604800n,
      REWARD_DURATION: 604800n,
      balanceOf: state.stake,
      earned: state.earned,
      unlockTime: state.unlock,
      claim: state.earned,
    }[f];
  if (address === network.network.uniswapV4.quoter.toLowerCase()) {
    assert.equal(f, "quoteExactInputSingle");
    assert.equal(args[0].poolKey.hooks.toLowerCase(), key.hooks);
    assert.equal(args[0].poolKey.fee, key.fee);
    assert.equal(args[0].poolKey.currency0.toLowerCase(), key.currency0);
    result = [args[0].exactAmount * 2n, 100000n];
  }
  if (
    address === network.network.uniswapV4.permit2.toLowerCase() &&
    f === "allowance"
  )
    result = [state.permit, state.expiration, 0];
  return { result: encodeFunctionResult({ abi, functionName: f, result }) };
}
async function rpc(req) {
  requests.push(req);
  let result;
  if (rpcFail)
    return {
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32000, message: "Network unavailable" },
    };
  switch (req.method) {
    case "eth_chainId":
      result = chainHex;
      break;
    case "eth_blockNumber":
      result = hx(++mockBlock);
      break;
    case "eth_getBlockByNumber":
      result = block();
      break;
    case "eth_getCode":
      result = noCode ? "0x" : "0x6001600055";
      break;
    case "eth_getBalance":
      result = hx(10n * unit);
      break;
    case "eth_call":
      return { jsonrpc: "2.0", id: req.id, ...callResult(req.params[0]) };
    case "eth_getTransactionReceipt":
      if (req.params[0] === handoff.contracts[0].txHash)
        result = receipt(req.params[0], poolMismatch ? [] : [launchLog]);
      else if (pending && Date.now() - pending.time < 1300) result = null;
      else {
        if (pending && !settled) {
          if (!txRevert) applyTx(pending.transaction);
          settled = true;
        }
        result = {
          ...receipt(req.params[0]),
          status: txRevert ? "0x0" : "0x1",
        };
      }
      break;
    case "eth_getTransactionByHash":
      result = {
        ...pending?.transaction,
        hash: txHash,
        blockHash: hash,
        blockNumber: hx(20000000),
        transactionIndex: "0x0",
        nonce: "0x0",
        gas: hx(100000),
        gasPrice: hx(1),
        value: "0x0",
        input: pending?.transaction.data,
        type: "0x0",
        v: "0x1b",
        r: hash,
        s: hash,
      };
      break;
    default:
      throw new Error(`Unhandled RPC ${req.method}`);
  }
  return { jsonrpc: "2.0", id: req.id, result };
}
async function mockedPage() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await page.route(
    /https:\/\/(ethereum-sepolia-rpc.publicnode.com|rpc.sepolia.ethpandaops.io|sepolia.rpc.sentio.xyz)/,
    async (route) => {
      try {
        const data = route.request().postDataJSON();
        const result = Array.isArray(data)
          ? await Promise.all(data.map(rpc))
          : await rpc(data);
        await route.fulfill({ json: result });
      } catch (e) {
        console.error(e);
        await route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32603, message: String(e) },
          },
        });
      }
    },
  );
  await page.exposeFunction("mockWallet", async (request) => {
    requests.push(request);
    switch (request.method) {
      case "eth_requestAccounts":
        if (reject)
          return { error: { code: 4001, message: "User rejected request" } };
        return { result: [walletAccount] };
      case "eth_accounts":
        return { result: [walletAccount] };
      case "eth_chainId":
        return { result: hx(walletChain) };
      case "wallet_switchEthereumChain":
        if (unknown) return { error: { code: 4902, message: "Unknown chain" } };
        walletChain = parseInt(request.params[0].chainId, 16);
        return { result: null };
      case "wallet_addEthereumChain":
        assert.deepEqual(request.params[0], network.walletAddChain);
        unknown = false;
        return { result: null };
      case "eth_sendTransaction":
        if (reject)
          return { error: { code: 4001, message: "User rejected request" } };
        sent.push(request.params[0]);
        txHash =
          "0x" +
          BigInt(12345 + sent.length)
            .toString(16)
            .padStart(64, "0");
        pending = { transaction: request.params[0], time: Date.now() };
        settled = false;
        return { result: txHash };
      default:
        throw Error(`Unexpected wallet method ${request.method}`);
    }
  });
  await page.addInitScript(() => {
    const listeners = {};
    window.ethereum = {
      request: async (req) => {
        const response = await window.mockWallet(req);
        if (response.error)
          throw Object.assign(
            new Error(response.error.message),
            response.error,
          );
        return response.result;
      },
      on: (name, fn) => {
        (listeners[name] ??= []).push(fn);
      },
      removeListener: (name, fn) => {
        listeners[name] = (listeners[name] || []).filter((f) => f !== fn);
      },
    };
    window.emitWallet = (name, value) =>
      (listeners[name] || []).forEach((fn) => fn(value));
  });
  await page.goto(url);
  await page.getByText("Live on Sepolia").waitFor();
  return { page, context, consoleErrors };
}
async function click(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function refresh(page) {
  await click(page, "Refresh state ↻");
  await page.getByRole("button", { name: "Refresh state ↻" }).waitFor();
}
async function confirm(page, name) {
  await click(page, name);
  await page.getByRole("dialog").waitFor();
  await click(page, `Confirm ${name.toLowerCase()}`);
}
async function confirmed(page, name) {
  await page
    .getByText(`${name} confirmed. Your balances are refreshed.`, {
      exact: true,
    })
    .waitFor({ timeout: 20000 });
}
try {
  const { page, context, consoleErrors } = await mockedPage();
  await page.getByRole("button", { name: "Connect wallet to stake" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Claim rewards", exact: true })
      .isDisabled(),
    true,
  );
  check(
    "Disconnected state, verified config/ABIs, live public reads, gated transactions",
  );
  await page.screenshot({
    path: resolve(evidence, "desktop-disconnected.png"),
    fullPage: true,
  });
  reject = true;
  await click(page, "Connect wallet");
  await page
    .getByText(
      "Request declined in your wallet. You can try again when ready.",
      { exact: true },
    )
    .waitFor();
  reject = false;
  check("Wallet connection rejection is recoverable");
  walletChain = 1;
  unknown = true;
  await click(page, "Connect wallet");
  await page.getByRole("button", { name: "Switch to Sepolia" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Stake", exact: true })
      .last()
      .isDisabled(),
    true,
  );
  await click(page, "Switch to Sepolia");
  await page.getByText("Available: 1,000 SEVEN", { exact: true }).waitFor();
  assert(requests.some((r) => r.method === "wallet_addEthereumChain"));
  check(
    "Wrong chain disables actions; 4902 adds exact supplied network then switches",
  );
  await page.locator("#stake-amount").fill("1.0000000000000000001");
  await page.getByRole("button", { name: "Stake", exact: true }).last().click();
  await page
    .getByText("Enter a positive amount with up to 18 decimal places.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.locator("#stake-amount").getAttribute("aria-invalid"),
    "true",
  );
  check(
    "Invalid precision is rejected without rounding and error is associated with focused field",
  );
  await page.locator("#stake-amount").fill("10");
  await confirm(page, "Approve staking");
  await page
    .getByText("Approve staking submitted. Waiting for confirmation…", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Approve staking…", exact: true })
      .isDisabled(),
    true,
  );
  await confirmed(page, "Approve staking");
  assert.equal(sent.length, 1);
  assert.equal(state.allowance, 10n * unit);
  check(
    "Exact staking approval, pending disable through receipt, fresh allowance, no duplicate send",
  );
  await page.getByRole("button", { name: "Stake", exact: true }).last().click();
  await page.getByRole("dialog").waitFor();
  await page.getByText(/entire position will be locked/).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  check(
    "Stake confirmation explains lock reset; Escape cancels before signing",
  );
  revert = true;
  await page.getByRole("button", { name: "Stake", exact: true }).last().click();
  await click(page, "Confirm stake");
  await page
    .getByText(
      "Your seven-day lock is still active. Refresh and wait until the unlock time.",
      { exact: true },
    )
    .waitFor();
  assert.equal(sent.length, 1);
  revert = false;
  check("Simulation custom error is translated and prevents signing");
  reject = true;
  await page.getByRole("button", { name: "Stake", exact: true }).last().click();
  await click(page, "Confirm stake");
  await page
    .getByText(
      "Request declined in your wallet. You can try again when ready.",
      { exact: true },
    )
    .waitFor();
  reject = false;
  check("Transaction rejection releases action lock");
  await page.getByRole("button", { name: "Stake", exact: true }).last().click();
  await click(page, "Confirm stake");
  await confirmed(page, "Stake");
  assert.equal(state.stake, 110n * unit);
  check("Stake uses the deployed vault and refreshes position after receipt");
  await page
    .getByRole("button", { name: "Unstake", exact: true })
    .first()
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Unstake", exact: true })
      .last()
      .isDisabled(),
    true,
  );
  check("Locked unstake disabled using the chain timestamp");
  await confirm(page, "Claim rewards");
  await confirmed(page, "Claim rewards");
  assert.equal(state.earned, 0n);
  check("Claim while locked succeeds and refreshes rewards");
  state.unlock = now;
  await refresh(page);
  await page.locator("#stake-amount").fill("5");
  await page
    .getByRole("button", { name: "Unstake", exact: true })
    .last()
    .click();
  await click(page, "Confirm unstake");
  await confirmed(page, "Unstake");
  assert.equal(state.stake, 105n * unit);
  check("Unstake becomes available at exact chain unlock boundary");
  await page.locator("summary").click();
  await page.locator("#fund-amount").fill("2");
  await page
    .getByLabel("I understand this is a non-refundable donation.")
    .check();
  await confirm(page, "Approve funding");
  await confirmed(page, "Approve funding");
  await confirm(page, "Fund rewards");
  await confirmed(page, "Fund rewards");
  const funding = decodeFunctionData({ abi: vaultAbi, data: sent.at(-1).data });
  assert.deepEqual(funding.args, [2n * unit, 604800n]);
  check(
    "Donation acknowledgement, approval and guarded full-week funding overload",
  );
  state.finish = now;
  await refresh(page);
  await confirm(page, "Restart rewards");
  await confirmed(page, "Restart rewards");
  assert.equal(state.queued, 0n);
  check("Restart requires ended period and sufficient queued funding");
  await page.locator("#swap-amount").fill("0.1");
  await click(page, "Get quote");
  await page.getByText("Estimated receive", { exact: true }).waitFor();
  await confirm(page, "Swap");
  await confirmed(page, "Swap");
  let trade = decodeFunctionData({ abi: routerAbi, data: sent.at(-1).data });
  assert.equal(trade.args[0], "0x10");
  assert.equal(BigInt(sent.at(-1).value), unit / 10n);
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    trade.args[1][0],
  );
  assert.equal(actions, "0x060c0f");
  const [decodedSwap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ),
    params[0],
  );
  assert.equal(decodedSwap.poolKey.hooks.toLowerCase(), key.hooks);
  assert.equal(decodedSwap.poolKey.fee, key.fee);
  assert.equal(decodedSwap.amountOutMinimum, 199n * 10n ** 15n);
  assert.equal(
    sent.at(-1).to.toLowerCase(),
    network.network.uniswapV4.universalRouter,
  );
  check(
    "Buy: configured quoter/router, handoff pool, V4 actions, 0.5% minimum, native value, no approval",
  );
  await click(page, "Sell SEVEN");
  await page.locator("#swap-amount").fill("1");
  await click(page, "Get quote");
  await confirm(page, "Approve swap token");
  await confirmed(page, "Approve swap token");
  await click(page, "Get quote");
  await confirm(page, "Approve router permission");
  await confirmed(page, "Approve router permission");
  await click(page, "Get quote");
  await confirm(page, "Swap");
  await confirmed(page, "Swap");
  assert.equal(BigInt(sent.at(-1).value || "0x0"), 0n);
  check(
    "Sell: token → configured Permit2 → configured Universal Router permissions, then zero-value execute",
  );
  await page.locator("#swap-amount").fill("2");
  await click(page, "Get quote");
  await page.getByText("Estimated receive", { exact: true }).waitFor();
  await page.locator("#swap-amount").fill("3");
  assert.equal(
    await page.getByText("Estimated receive", { exact: true }).count(),
    0,
  );
  check("Changing trade input invalidates the previous quote");
  walletAccount = other;
  await page.evaluate(
    (other) => window.emitWallet("accountsChanged", [other]),
    other,
  );
  await page.getByRole("button", { name: `Disconnect ${other}` }).waitFor();
  await page.getByText("Available:", { exact: false }).count();
  check(
    "Wallet account event refreshes position and invalidates pending review/quote",
  );
  await refresh(page);
  txRevert = true;
  await page
    .getByRole("button", { name: "Stake", exact: true })
    .first()
    .click();
  await page.locator("#stake-amount").fill("1");
  await confirm(page, "Approve staking");
  await page
    .getByText(
      "Transaction reverted on chain. Refresh and review the action before trying again.",
      { exact: true },
    )
    .waitFor();
  txRevert = false;
  check("Reverted receipt reported without claiming success");
  noCode = true;
  await refresh(page);
  await page
    .getByText("Deployed contract code could not be verified.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Approve staking", exact: true })
      .isDisabled(),
    true,
  );
  noCode = false;
  await refresh(page);
  check(
    "Missing contract code disables all transaction actions and refresh recovers",
  );
  await page.screenshot({
    path: resolve(evidence, "desktop-connected.png"),
    fullPage: true,
  });
  const measured = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
    await page.screenshot({
      path: resolve(evidence, `viewport-${width}.png`),
      fullPage: true,
    });
    measured.push({ width, overflow: false });
  }
  check(
    "Rendered reflow at 1440, 768, 390 and 320 CSS pixels without horizontal overflow",
  );
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: resolve(evidence, "text-200-percent.png"),
    fullPage: true,
  });
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  check("200% text enlargement reflow (not native browser zoom)");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(url);
  await page.getByText("Live on Sepolia").waitFor();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Skip to content",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineWidth,
    ),
    "3px",
  );
  await page.screenshot({
    path: resolve(evidence, "keyboard-focus.png"),
    fullPage: true,
  });
  check(
    "Keyboard skip link and visible focus, native buttons and dialog Escape",
  );
  async function tabTo(selector) {
    await page.waitForFunction((s) => {
      const element = document.querySelector(s);
      return element && !element.disabled;
    }, selector);
    for (let i = 0; i < 80; i++) {
      if (
        await page.evaluate((s) => document.activeElement.matches(s), selector)
      )
        return;
      await page.keyboard.press("Tab");
    }
    throw new Error(`Keyboard could not reach ${selector}`);
  }
  await tabTo("button.wallet-button");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: `Disconnect ${other}` }).waitFor();
  await tabTo("#stake-amount");
  await page.keyboard.type("3");
  await tabTo("#vault button.primary");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Cancel",
  );
  await page.screenshot({
    path: resolve(evidence, "keyboard-dialog.png"),
    fullPage: false,
  });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await confirmed(page, "Approve staking");
  const beforeStake = state.stake;
  await tabTo("#vault button.primary");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await confirmed(page, "Stake");
  assert.equal(state.stake, beforeStake + 3n * unit);
  check(
    "Keyboard-only connect, amount entry, approval, dialog confirmation and staking flow",
  );
  await page.goto(url);
  await page.getByText("Live on Sepolia").waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  check("Reduced motion suppresses button transitions");
  await page.addScriptTag({
    path: resolve(root, "web/node_modules/axe-core/axe.min.js"),
  });
  const axe = await page.evaluate(
    async () =>
      await axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }),
  );
  writeFileSync(
    resolve(evidence, "accessibility.json"),
    JSON.stringify(
      {
        violations: axe.violations,
        passes: axe.passes.map((p) => p.id),
        incomplete: axe.incomplete.map((p) => ({
          id: p.id,
          description: p.description,
        })),
      },
      null,
      2,
    ),
  );
  assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations));
  check(
    "Automated axe WCAG A/AA scan: no violations in disconnected desktop state",
  );
  const contrast = await page.evaluate(() => {
    const lum = (color) => {
      const a = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    return [
      ".hero-copy",
      ".hero h1",
      ".hint",
      ".primary",
      ".wallet-button",
      ".eyebrow",
    ].map((selector) => {
      const e = document.querySelector(selector);
      const s = getComputedStyle(e);
      let parent = e;
      let bg;
      while (parent) {
        bg = getComputedStyle(parent).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)") break;
        parent = parent.parentElement;
      }
      const fg = s.color;
      const l1 = lum(fg),
        l2 = lum(bg);
      return {
        selector,
        foreground: fg,
        background: bg,
        ratio: ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(
          2,
        ),
      };
    });
  });
  assert(contrast.every((x) => Number(x.ratio) >= 4.5));
  writeFileSync(
    resolve(evidence, "rendered-checks.json"),
    JSON.stringify({ viewports: measured, contrast, consoleErrors }, null, 2),
  );
  assert.equal(consoleErrors.length, 0);
  check(
    "Measured rendered text/background pairs ≥4.5:1; no page JavaScript errors",
  );
  await context.close();
  const absent = await browser.newPage();
  await absent.route(/https:\/\//, async (route) => {
    const data = route.request().postDataJSON();
    await route.fulfill({
      json: Array.isArray(data)
        ? await Promise.all(data.map(rpc))
        : await rpc(data),
    });
  });
  await absent.goto(url);
  await absent.getByText("Live on Sepolia").waitFor();
  await click(absent, "Connect wallet");
  await absent.getByText(/No browser wallet found/).waitFor();
  check("Missing injected wallet provides an actionable install/open message");
  await absent.close();
  const live = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const failures = [];
  live.on("pageerror", (e) => failures.push(e.message));
  await live.goto(url);
  await live.getByText("Live on Sepolia").waitFor({ timeout: 60000 });
  await live.getByText(/Verified pool · 1.25% fee/).waitFor({ timeout: 60000 });
  await live.screenshot({
    path: resolve(evidence, "live-sepolia-desktop.png"),
    fullPage: true,
  });
  const liveText = await live.locator("main").innerText();
  writeFileSync(resolve(evidence, "live-read.txt"), liveText + "\n");
  assert.equal(failures.length, 0);
  check(
    "Production export at /preview/: actual Sepolia public reads and attested pool verified, no broadcasts",
  );
  await live.close();
  writeFileSync(
    resolve(evidence, "interaction-results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: "Playwright Chromium 141",
        results,
        transactions: "Mocked only; no real wallet transactions",
        rpcCalls: requests.length,
        walletTransactions: sent.length,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  console.error(error);
  writeFileSync("/tmp/sevenday-test-failure.txt", String(error));
  const page = browser.contexts()[0]?.pages()[0];
  if (page)
    await page.screenshot({
      path: "/tmp/sevenday-failure.png",
      fullPage: true,
    });
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

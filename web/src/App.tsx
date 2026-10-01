import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { loadConfig, protocol, type Config } from "./config";
import {
  amount,
  date,
  display,
  errorMessage,
  readPool,
  readSnapshot,
  swapCall,
  type PoolKey,
  type Snapshot,
  type TxCall,
} from "./chain";
import {
  assertWallet,
  switchChain,
  type Provider,
  type Wallet,
} from "./wallet";

const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}
function AddressLink({
  address,
  c,
  label,
}: {
  address: Address;
  c: Config;
  label: string;
}) {
  const [copy, setCopy] = useState("Copy");
  return (
    <span className="address-group">
      <a
        href={`${c.deployment.network.explorer}/address/${getAddress(address)}`}
        target="_blank"
        rel="noreferrer"
        title={getAddress(address)}
        aria-label={`${label}: ${getAddress(address)} on explorer`}
      >
        {short(getAddress(address))} ↗
      </a>
      <button
        className="copy"
        aria-label={`Copy ${label} address`}
        onClick={() =>
          navigator.clipboard.writeText(getAddress(address)).then(
            () => setCopy("Copied"),
            () => setCopy("Copy failed"),
          )
        }
      >
        {copy}
      </button>
      <span className="sr-only" role="status">
        {copy === "Copied" ? "Address copied." : ""}
      </span>
    </span>
  );
}
function Field({
  id,
  label,
  value,
  onChange,
  unit,
  help,
  error,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  help?: string;
  error?: string;
  max?: () => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="amount-input">
        <input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={`${id}-help`}
        />
        <span>{unit}</span>
        {max && (
          <button className="max" onClick={max} type="button">
            Max
          </button>
        )}
      </div>
      <p id={`${id}-help`} className={error ? "field-error" : "hint"}>
        {error || help}
      </p>
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  foot,
}: {
  label: string;
  value: string;
  unit?: string;
  foot: ReactNode;
}) {
  return (
    <div className="stat">
      <p className="eyebrow">{label}</p>
      <p className="stat-number">
        {value} {unit && <span>{unit}</span>}
      </p>
      <div className="hint">{foot}</div>
    </div>
  );
}
type Review = {
  label: string;
  summary: string;
  call: TxCall;
  guard?: (snapshot: Snapshot) => void;
  after?: () => void;
};
type Tx = {
  label: string;
  stage: "simulate" | "sign" | "pending" | "success" | "error";
  message: string;
  hash?: Hex;
};
function ReviewDialog({
  review,
  onClose,
  onConfirm,
}: {
  review: Review;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const element = ref.current;
    return () => element?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="review-title">
      <p className="eyebrow">Before your wallet opens</p>
      <h2 id="review-title">Review {review.label.toLowerCase()}</h2>
      <p>{review.summary}</p>
      <p className="hint">
        We’ll simulate this transaction first. Your wallet will show the gas fee
        before you sign.
      </p>
      <div className="button-row">
        <button onClick={onClose} autoFocus>
          Cancel
        </button>
        <button className="primary" onClick={onConfirm}>
          Confirm {review.label.toLowerCase()}
        </button>
      </div>
    </dialog>
  );
}
export default function App() {
  const [config, setConfig] = useState<Config>();
  const [fatal, setFatal] = useState("");
  useEffect(() => {
    loadConfig()
      .then(setConfig)
      .catch((e) => setFatal(errorMessage(e)));
  }, []);
  if (!config)
    return (
      <main className="boot">
        <span className="logo-mark">7</span>
        <h1>SevenDay</h1>
        <p role={fatal ? "alert" : "status"}>
          {fatal || "Verifying deployment and loading the vault…"}
        </p>
        {fatal && (
          <button onClick={() => location.reload()}>
            Reload configuration
          </button>
        )}
      </main>
    );
  return <Dashboard c={config} />;
}
function Dashboard({ c }: { c: Config }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selected, setSelected] = useState("");
  const [provider, setProvider] = useState<Provider>();
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [readError, setReadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pool, setPool] = useState<PoolKey>();
  const [poolError, setPoolError] = useState("");
  const [tx, setTx] = useState<Tx>();
  const [receiptChecking, setReceiptChecking] = useState(false);
  const receiptLock = useRef(false);
  const [review, setReview] = useState<Review>();
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [stakeInput, setStakeInput] = useState("");
  const [stakeError, setStakeError] = useState("");
  const [fundInput, setFundInput] = useState("");
  const [fundError, setFundError] = useState("");
  const [minimum, setMinimum] = useState("604800");
  const [donation, setDonation] = useState(false);
  const accountRef = useRef(account);
  accountRef.current = account;
  const lock = useRef(false);
  const readSequence = useRef(0);
  const session = useRef(0);
  const wrong = !!account && walletChain !== c.deployment.chainId;
  const busy =
    tx?.stage === "simulate" || tx?.stage === "sign" || tx?.stage === "pending";
  const ready =
    !!account &&
    !wrong &&
    !!snapshot &&
    !readError &&
    !busy &&
    !refreshing &&
    Date.now() - snapshot.fetchedAt < 45000;
  useEffect(() => {
    const add = (w: Wallet) =>
      setWallets((list) =>
        list.some((x) => x.provider === w.provider || x.id === w.id)
          ? list
          : [...list, w],
      );
    const announce = (event: Event) => {
      const { info, provider: p } = (
        event as CustomEvent<{
          info: { name: string; uuid: string };
          provider: Provider;
        }>
      ).detail;
      if (p) add({ name: info.name, id: info.uuid, provider: p });
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum)
      add({
        name: "Browser wallet",
        id: "injected",
        provider: window.ethereum,
      });
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  const refresh = useCallback(async () => {
    const seq = ++readSequence.current;
    setRefreshing(true);
    try {
      const state = await readSnapshot(c, accountRef.current);
      if (seq === readSequence.current) {
        setSnapshot(state);
        setReadError("");
      }
      return state;
    } catch (e) {
      if (seq === readSequence.current) setReadError(errorMessage(e));
      throw e;
    } finally {
      if (seq === readSequence.current) setRefreshing(false);
    }
  }, [c, account]);
  useEffect(() => {
    session.current++;
    setSnapshot(undefined);
    void refresh().catch(() => {});
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {});
    }, 12000);
    return () => {
      clearInterval(timer);
      readSequence.current++;
    };
  }, [refresh]);
  const getPool = useCallback(() => {
    setPoolError("");
    readPool(c)
      .then(setPool)
      .catch((e) => setPoolError(errorMessage(e)));
  }, [c]);
  useEffect(() => getPool(), [getPool]);
  useEffect(() => {
    if (!provider) return;
    const changed = (v: unknown) => {
      session.current++;
      const accounts = v as string[];
      setAccount(accounts[0] ? getAddress(accounts[0]) : undefined);
      setReview(undefined);
    };
    const chainChanged = (v: unknown) => {
      session.current++;
      setWalletChain(Number(v));
      setReview(undefined);
    };
    const disconnected = () => {
      session.current++;
      setAccount(undefined);
      setWalletChain(undefined);
      setReview(undefined);
    };
    provider.on?.("accountsChanged", changed);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", changed);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider]);
  async function connect() {
    setWalletError("");
    setWalletBusy(true);
    try {
      const wallet = wallets.find((w) => w.id === selected) || wallets[0];
      if (!wallet)
        throw new Error(
          "No browser wallet found. Install an Ethereum wallet extension, or open this page in your wallet’s browser.",
        );
      const addresses = (await wallet.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!addresses[0])
        throw new Error(
          "No account was shared. Open your wallet and try again.",
        );
      const chain = Number(
        await wallet.provider.request({ method: "eth_chainId" }),
      );
      setProvider(wallet.provider);
      setAccount(getAddress(addresses[0]));
      setWalletChain(chain);
    } catch (e) {
      setWalletError(errorMessage(e));
    } finally {
      setWalletBusy(false);
    }
  }
  async function switchNetwork() {
    if (!provider) return;
    setWalletBusy(true);
    setWalletError("");
    try {
      await switchChain(provider, c);
      setWalletChain(Number(await provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setWalletError(errorMessage(e));
    } finally {
      setWalletBusy(false);
    }
  }
  async function track(hash: Hex, label: string, after?: () => void) {
    if (receiptLock.current) return;
    receiptLock.current = true;
    setReceiptChecking(true);
    let changedIntent = false;
    try {
      const receipt = await c.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
        onReplaced: (replacement) => {
          changedIntent = replacement.reason !== "repriced";
          hash = replacement.transaction.hash;
          setTx({
            label,
            stage: "pending",
            message: "Waiting for the replacement transaction to confirm…",
            hash,
          });
        },
      });
      if (receipt.status !== "success")
        throw new Error(
          "Transaction reverted on chain. Refresh and review the action before trying again.",
        );
      await refresh();
      setTx({
        label,
        stage: "success",
        message: changedIntent
          ? "A replacement transaction confirmed. The original action may not have executed; review your refreshed balances."
          : `${label} confirmed. Your balances are refreshed.`,
        hash,
      });
      if (!changedIntent) after?.();
      lock.current = false;
    } catch (e) {
      if (/timeout|timed out|network|HTTP|fetch/i.test(String(e))) {
        setTx({
          label,
          stage: "pending",
          message:
            "Confirmation could not be checked. Use “Check confirmation” before submitting another transaction.",
          hash,
        });
      } else {
        setTx({ label, stage: "error", message: errorMessage(e), hash });
        lock.current = false;
      }
    } finally {
      receiptLock.current = false;
      setReceiptChecking(false);
    }
  }
  async function run(r: Review) {
    setReview(undefined);
    if (lock.current || !provider || !account || wrong) return;
    lock.current = true;
    const currentSession = session.current;
    setTx({
      label: r.label,
      stage: "simulate",
      message: `Simulating ${r.label.toLowerCase()}…`,
    });
    try {
      await assertWallet(provider, c, account);
      const fresh = await refresh();
      r.guard?.(fresh);
      const simulation = await c.client.simulateContract({
        ...r.call,
        account,
      });
      if (currentSession !== session.current)
        throw new Error("Your wallet changed. Review this action again.");
      await assertWallet(provider, c, account);
      setTx({
        label: r.label,
        stage: "sign",
        message: `Confirm ${r.label.toLowerCase()} in your wallet.`,
      });
      const wallet = createWalletClient({
        chain: c.chain,
        transport: custom(provider),
        account,
      });
      const hash = await wallet.writeContract(simulation.request);
      setTx({
        label: r.label,
        stage: "pending",
        message: `${r.label} submitted. Waiting for confirmation…`,
        hash,
      });
      await track(hash, r.label, r.after);
    } catch (e) {
      setTx({ label: r.label, stage: "error", message: errorMessage(e) });
      lock.current = false;
    }
  }
  function request(r: Review) {
    if (ready) setReview(r);
  }
  const gating = !account
    ? "Connect your wallet to manage your position."
    : wrong
      ? `Switch to ${c.deployment.network.name} to enable actions.`
      : readError
        ? "Live state is unavailable. Refresh before continuing."
        : !snapshot
          ? "Reading your position…"
          : busy
            ? "A transaction is in progress."
            : undefined;
  const actionLabel = (label: string) =>
    tx?.label === label && busy ? `${label}…` : label;
  const unit = snapshot?.symbol || "SEVEN";
  const value = (n: bigint | undefined) =>
    n === undefined ? "—" : display(n, snapshot?.decimals);
  let inputValue = 0n;
  try {
    inputValue = amount(stakeInput, snapshot?.decimals ?? 18);
  } catch {
    /* validated on submit */
  }
  const needsApproval =
    mode === "stake" && !!snapshot && inputValue > snapshot.allowance;
  function manage() {
    try {
      if (!snapshot) throw new Error("Refresh your position first.");
      const n = amount(stakeInput, snapshot.decimals);
      if (n > (mode === "stake" ? snapshot.wallet : snapshot.stake))
        throw new Error(
          `Amount exceeds your ${mode === "stake" ? "wallet balance" : "stake"}.`,
        );
      if (mode === "unstake" && snapshot.timestamp < snapshot.unlock)
        throw new Error(
          "Your stake is still locked. Wait until the unlock time.",
        );
      setStakeError("");
      const approve = mode === "stake" && snapshot.allowance < n;
      request({
        label: approve
          ? "Approve staking"
          : mode === "stake"
            ? "Stake"
            : "Unstake",
        summary: approve
          ? `Allow the staking vault to spend exactly ${stakeInput} ${unit}. You will confirm the stake separately.`
          : mode === "stake"
            ? `Stake ${stakeInput} ${unit}. Your entire position will be locked for seven days from this transaction, including any tokens already staked.`
            : `Return ${stakeInput} ${unit} to your wallet. Accrued rewards remain separately claimable.`,
        call: approve
          ? { ...c.token, functionName: "approve", args: [c.vault.address, n] }
          : { ...c.vault, functionName: mode, args: [n] },
        after: approve ? undefined : () => setStakeInput(""),
      });
    } catch (e) {
      setStakeError(errorMessage(e));
      document.getElementById("stake-amount")?.focus();
    }
  }
  function fund() {
    try {
      if (!snapshot) throw new Error("Refresh first.");
      const n = amount(fundInput, snapshot.decimals);
      if (n > snapshot.wallet)
        throw new Error("Amount exceeds your wallet balance.");
      if (!donation)
        throw new Error("Confirm that this is a non-refundable donation.");
      const approve = snapshot.allowance < n;
      setFundError("");
      request({
        label: approve ? "Approve funding" : "Fund rewards",
        summary: approve
          ? `Allow the vault to spend exactly ${fundInput} ${unit}. Funding is a separate transaction.`
          : `Donate ${fundInput} ${unit} permanently to all stakers. The transaction requires at least ${Number(minimum) / 3600} hours remaining in the stream. An active period keeps its end time.`,
        call: approve
          ? { ...c.token, functionName: "approve", args: [c.vault.address, n] }
          : {
              ...c.vault,
              functionName: "fundRewards",
              args: [n, BigInt(minimum)],
            },
        after: approve
          ? undefined
          : () => {
              setFundInput("");
              setDonation(false);
            },
      });
    } catch (e) {
      setFundError(errorMessage(e));
      document.getElementById("fund-amount")?.focus();
    }
  }
  let fundAmount = 0n;
  try {
    fundAmount = amount(fundInput, snapshot?.decimals ?? 18);
  } catch {
    /* validated on submit */
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header wrap">
        <a className="brand" href="#" aria-label="SevenDay home">
          <span className="logo-mark">7</span>SevenDay
        </a>
        <nav aria-label="Main navigation">
          <a href="#vault">Vault</a>
          <a href="#trade">Swap</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="wallet-controls">
          <span className="network">
            <i />
            {c.deployment.network.name} testnet
          </span>
          {!account && wallets.length > 1 && (
            <select
              aria-label="Choose wallet"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {wallets.map((w) => (
                <option value={w.id} key={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          {account ? (
            <>
              <button
                className="wallet-button"
                onClick={() => {
                  setProvider(undefined);
                  setAccount(undefined);
                  setWalletChain(undefined);
                  setReview(undefined);
                }}
                aria-label={`Disconnect ${getAddress(account)}`}
              >
                {short(account)} <span aria-hidden="true">×</span>
              </button>
            </>
          ) : (
            <button
              className="wallet-button"
              disabled={walletBusy}
              onClick={connect}
            >
              {walletBusy ? "Connecting…" : "Connect wallet"} <Arrow />
            </button>
          )}
        </div>
      </header>
      <main id="main" className="wrap">
        <div className="wallet-message" role="alert">
          {walletError}
        </div>
        {wrong && (
          <div className="notice warning">
            <span>Your wallet is on another network.</span>
            <button disabled={walletBusy} onClick={switchNetwork}>
              {walletBusy
                ? "Switching…"
                : `Switch to ${c.deployment.network.name}`}
            </button>
          </div>
        )}
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <p className="eyebrow">
              <span className="tiny-line" /> A shared reward. A little time.
            </p>
            <h1 id="hero-title">
              Good things
              <br />
              take <em>seven days.</em>
            </h1>
            <p className="hero-copy">
              Put your SEVEN to work in a community-funded vault. Stake for a
              week. Claim your rewards whenever you like.
            </p>
            <a className="text-link" href="#vault">
              Make time for your tokens <Arrow />
            </a>
          </div>
          <div className="time-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="day-stamp">
              <span>THE SEVENDAY VAULT</span>
              <strong>7</strong>
              <span>DAYS TO SLOW DOWN</span>
            </div>
            <span className="art-note">Time in. Rewards out.</span>
            <span className="orbit-dot" />
          </div>
        </section>
        <section className="stats" aria-label="Live vault overview">
          <Stat
            label="Current token APR"
            value={snapshot ? display(snapshot.apr, 2, 2) + "%" : "—"}
            foot="Variable, simple annualized rate"
          />
          <Stat
            label="Total staked"
            value={value(snapshot?.total)}
            unit={unit}
            foot="Principal held in the vault"
          />
          <Stat
            label="Reward reserve"
            value={value(snapshot?.reserve)}
            unit={unit}
            foot="Funded separately from principal"
          />
        </section>
        <div className="read-status">
          <span className={readError ? "error-text" : ""}>
            {readError ||
              (snapshot
                ? `Live on ${c.deployment.network.name} · Block ${snapshot.block.toLocaleString()} · ${new Date(snapshot.fetchedAt).toLocaleTimeString()}`
                : "Reading live contract state…")}
          </span>
          <button
            className="text-button"
            onClick={() => void refresh().catch(() => {})}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh state ↻"}
          </button>
        </div>
        <section
          id="vault"
          className="vault-grid"
          aria-label="Manage your stake"
        >
          <article className="panel manage-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Your next seven days</p>
                <h2>A place for your SEVEN.</h2>
              </div>
              <span className="round-icon" aria-hidden="true">
                ↗
              </span>
            </div>
            <div className="segmented" aria-label="Choose staking action">
              <button
                aria-pressed={mode === "stake"}
                onClick={() => {
                  setMode("stake");
                  setStakeError("");
                  setStakeInput("");
                }}
              >
                Stake
              </button>
              <button
                aria-pressed={mode === "unstake"}
                onClick={() => {
                  setMode("unstake");
                  setStakeError("");
                  setStakeInput("");
                }}
              >
                Unstake
              </button>
            </div>
            <Field
              id="stake-amount"
              label={mode === "stake" ? "Amount to stake" : "Amount to unstake"}
              value={stakeInput}
              onChange={(v) => {
                setStakeInput(v);
                setStakeError("");
              }}
              unit={unit}
              help={
                account
                  ? `${mode === "stake" ? "Available" : "Staked"}: ${value(mode === "stake" ? snapshot?.wallet : snapshot?.stake)} ${unit}`
                  : "Your balance appears when you connect."
              }
              error={stakeError}
              max={
                account && snapshot
                  ? () =>
                      setStakeInput(
                        formatUnits(
                          mode === "stake" ? snapshot.wallet : snapshot.stake,
                          snapshot.decimals,
                        ),
                      )
                  : undefined
              }
            />
            <div className="info-line">
              <span aria-hidden="true">◷</span>
              <p>
                {mode === "stake" ? (
                  <>
                    Every deposit starts a new <strong>7-day lock</strong> on
                    your entire stake. Rewards stay claimable.
                  </>
                ) : snapshot && snapshot.stake > 0n ? (
                  <>
                    Your principal{" "}
                    {snapshot.timestamp >= snapshot.unlock
                      ? "is unlocked."
                      : `unlocks ${date(snapshot.unlock)}.`}{" "}
                    Unstaking leaves rewards available to claim.
                  </>
                ) : (
                  "Your stake will appear here. After seven days, you can withdraw any amount."
                )}
              </p>
            </div>
            {!account ? (
              <button
                className="primary wide"
                disabled={walletBusy}
                onClick={connect}
              >
                {walletBusy ? "Connecting…" : "Connect wallet to stake"}
                <Arrow />
              </button>
            ) : (
              <button
                className="primary wide"
                disabled={
                  !ready ||
                  (mode === "unstake" &&
                    !!snapshot &&
                    (snapshot.stake === 0n ||
                      snapshot.timestamp < snapshot.unlock))
                }
                onClick={manage}
              >
                {actionLabel(
                  needsApproval
                    ? "Approve staking"
                    : mode === "stake"
                      ? "Stake"
                      : "Unstake",
                )}{" "}
                <Arrow />
              </button>
            )}
            {gating && <p className="hint">{gating}</p>}
            {needsApproval && (
              <p className="hint">
                Step 1 of 2: approve the exact amount. Then confirm your stake.
              </p>
            )}
          </article>
          <article className="panel position-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Made for the long week</p>
                <h2>Your position</h2>
              </div>
              <span className="small-badge">7-day lock</span>
            </div>
            {account ? (
              <AddressLink address={account} c={c} label="Wallet" />
            ) : (
              <p className="hint">Connect a wallet to see what’s growing.</p>
            )}
            <dl className="position-list">
              <div>
                <dt>Staked balance</dt>
                <dd>
                  {account ? value(snapshot?.stake) : "—"} <span>{unit}</span>
                </dd>
              </div>
              <div>
                <dt>Claimable rewards</dt>
                <dd>
                  {account ? value(snapshot?.earned) : "—"} <span>{unit}</span>
                </dd>
              </div>
              <div>
                <dt>Principal unlocks</dt>
                <dd className="small-value">
                  {!account
                    ? "Connect to view"
                    : snapshot?.stake === 0n
                      ? "No active stake"
                      : snapshot
                        ? date(snapshot.unlock)
                        : "Loading…"}
                </dd>
              </div>
            </dl>
            <button
              className="wide"
              disabled={!ready || !snapshot?.earned}
              onClick={() =>
                request({
                  label: "Claim rewards",
                  summary: `Claim your accrued ${unit} to your wallet. Your principal and unlock time stay the same. The confirmed amount may include rewards earned since the last refresh.`,
                  call: { ...c.vault, functionName: "claim" },
                })
              }
            >
              {actionLabel("Claim rewards")} <Arrow />
            </button>
            <p className="hint">
              Claim anytime. No need to wait for your lock to end.
            </p>
          </article>
        </section>
        <section
          className="transaction"
          aria-label="Transaction status"
          aria-live="polite"
          aria-atomic="true"
        >
          {tx && (
            <div className={`notice ${tx.stage === "error" ? "warning" : ""}`}>
              <div>
                <strong>
                  {tx.stage === "error"
                    ? "Action needs attention"
                    : tx.stage === "success"
                      ? "Transaction confirmed"
                      : tx.label}
                </strong>
                <p>{tx.message}</p>
                {tx.hash && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`${c.deployment.network.explorer}/tx/${tx.hash}`}
                  >
                    View transaction ↗
                  </a>
                )}
              </div>
              {tx.stage === "pending" && tx.hash && (
                <button
                  disabled={receiptChecking}
                  onClick={() => void track(tx.hash!, tx.label)}
                >
                  {receiptChecking
                    ? "Waiting for confirmation…"
                    : "Check confirmation"}
                </button>
              )}
            </div>
          )}
        </section>
        <section className="secondary-grid">
          <article id="trade" className="panel">
            <Swap
              c={c}
              snapshot={snapshot}
              pool={pool}
              poolError={poolError}
              getPool={getPool}
              ready={ready}
              account={account}
              wrong={wrong}
              request={request}
              busy={busy}
              tx={tx}
              gating={gating}
            />
          </article>
          <article className="panel funding">
            <p className="eyebrow">Keep the rewards flowing</p>
            <h2>A vault funded by anyone.</h2>
            <p>
              Contribute SEVEN to the shared reward stream. Rewards go to
              stakers, second by second, in proportion to their stake.
            </p>
            <details>
              <summary>
                Fund rewards <span aria-hidden="true">+</span>
              </summary>
              <div className="details-content">
                <Field
                  id="fund-amount"
                  label="Reward donation"
                  value={fundInput}
                  onChange={(v) => {
                    setFundInput(v);
                    setFundError("");
                  }}
                  unit={unit}
                  error={fundError}
                  help={`Wallet balance: ${account ? value(snapshot?.wallet) : "—"} ${unit}`}
                />
                <label className="select-label" htmlFor="minimum-duration">
                  Minimum reward stream remaining
                </label>
                <select
                  id="minimum-duration"
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                >
                  <option value="604800">7 days — requires a new period</option>
                  <option value="86400">1 day</option>
                  <option value="3600">1 hour</option>
                  <option value="0">Any duration — may be only seconds</option>
                </select>
                <p className="hint">
                  An active reward period keeps its end time. Funding reverts if
                  less than your selected minimum remains when mined.
                </p>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={donation}
                    onChange={(e) => setDonation(e.target.checked)}
                  />
                  I understand this is a non-refundable donation.
                </label>
                <button className="wide" disabled={!ready} onClick={fund}>
                  {actionLabel(
                    snapshot && fundAmount > snapshot.allowance
                      ? "Approve funding"
                      : "Fund rewards",
                  )}
                </button>
                <p className="hint">
                  Approval and funding are separate transactions. {gating}
                </p>
              </div>
            </details>
            <dl className="compact-list">
              <div>
                <dt>Reward period ends</dt>
                <dd>{snapshot ? date(snapshot.finish) : "—"}</dd>
              </div>
              <div>
                <dt>Queued rewards</dt>
                <dd>
                  {value(snapshot?.queued)} {unit}
                </dd>
              </div>
              <div>
                <dt>Current emission</dt>
                <dd>
                  {snapshot
                    ? display(
                        snapshot.timestamp < snapshot.finish
                          ? snapshot.rate
                          : 0n,
                        snapshot.decimals,
                        8,
                      )
                    : "—"}{" "}
                  {unit}/s
                </dd>
              </div>
            </dl>
            <button
              className="wide"
              disabled={
                !ready ||
                !snapshot ||
                snapshot.timestamp < snapshot.finish ||
                snapshot.queued < snapshot.duration
              }
              onClick={() =>
                request({
                  label: "Restart rewards",
                  summary:
                    "Start a new seven-day stream using queued rewards. No tokens are taken from your wallet; you only pay gas.",
                  call: { ...c.vault, functionName: "restartRewards" },
                })
              }
            >
              {actionLabel("Restart rewards")}
            </button>
            <p className="hint">
              Available after the period ends, when the queue can fund at least
              one base unit per second.
            </p>
          </article>
        </section>
        <section id="how-it-works" className="how">
          <div>
            <p className="eyebrow">Simple by design</p>
            <h2>
              Your tokens.
              <br />A shared rhythm.
            </h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Stake for seven days</h3>
                <p>
                  Approve the vault, then stake SEVEN. Each addition resets the
                  lock on your whole position.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Share in the stream</h3>
                <p>
                  Anyone can fund rewards. Your share follows your stake,
                  accruing every second while the period is active.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Claim on your schedule</h3>
                <p>
                  Rewards are always claimable. Withdraw your principal once the
                  seven-day lock ends.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <aside className="fine-print">
          <p>
            <strong>Know what the numbers mean.</strong> APR is a simple
            annualized token rate at the current stake and emission rate, with
            no compounding. It is variable, not a promise; the current stream
            lasts at most seven days. No USD price source is configured. All
            values are in token units.
          </p>
          <p>
            This is a Sepolia testnet deployment. The vault is ownerless, with
            no pause or rescue function. Reward accounting is separate from
            staked principal.
          </p>
        </aside>
      </main>
      <footer className="wrap">
        <div>
          <a className="brand" href="#">
            <span className="logo-mark">7</span>SevenDay
          </a>
          <p>A little time, together.</p>
        </div>
        <div className="contract-links">
          <span>Verified deployment</span>
          <div>
            Token <AddressLink address={c.token.address} c={c} label="Token" />
          </div>
          <div>
            Vault <AddressLink address={c.vault.address} c={c} label="Vault" />
          </div>
          <a href="./imd-deployment.json">Deployment manifest ↗</a>
        </div>
      </footer>
      {review && (
        <ReviewDialog
          review={review}
          onClose={() => setReview(undefined)}
          onConfirm={() => void run(review)}
        />
      )}
    </>
  );
}

function Swap({
  c,
  snapshot,
  pool,
  poolError,
  getPool,
  ready,
  account,
  wrong,
  request,
  busy,
  tx,
  gating,
}: {
  c: Config;
  snapshot?: Snapshot;
  pool?: PoolKey;
  poolError: string;
  getPool: () => void;
  ready: boolean;
  account?: Address;
  wrong: boolean;
  request: (r: Review) => void;
  busy: boolean;
  tx?: Tx;
  gating?: string;
}) {
  const [buy, setBuy] = useState(true);
  const [input, setInput] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<{
    out: bigint;
    minimum: bigint;
    input: bigint;
    expires: number;
    approval: bigint;
    permit: bigint;
    expiration: number;
    account: Address;
  }>();
  const [, tick] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setQuote(undefined);
    setError("");
  }, [input, buy, slippage, account, wrong]);
  useEffect(() => {
    const timer = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const symbol = snapshot?.symbol || "SEVEN";
  const from = buy ? c.deployment.network.nativeCurrency.symbol : symbol;
  const to = buy ? symbol : c.deployment.network.nativeCurrency.symbol;
  const decimals = buy
    ? c.deployment.network.nativeCurrency.decimals
    : (snapshot?.decimals ?? 18);
  const outDecimals = buy
    ? (snapshot?.decimals ?? 18)
    : c.deployment.network.nativeCurrency.decimals;
  const valid = quote && Date.now() < quote.expires;
  const approval = !!quote && !buy && quote.approval < quote.input;
  const permit =
    !!quote &&
    !buy &&
    (quote.permit < quote.input ||
      quote.expiration < Math.floor(Date.now() / 1000) + 60);
  const action = approval
    ? "Approve swap token"
    : permit
      ? "Approve router permission"
      : "Swap";
  async function getQuote() {
    if (!account || !snapshot || !pool) return;
    setQuoteBusy(true);
    setError("");
    setQuote(undefined);
    const current = ++generation.current;
    try {
      const n = amount(input, decimals);
      if (n >= 2n ** 128n)
        throw new Error("Amount is too large for this pool.");
      if (n > (buy ? snapshot.native : snapshot.wallet))
        throw new Error("Amount exceeds your wallet balance.");
      if (
        !/^\d+(\.\d{1,2})?$/.test(slippage) ||
        Number(slippage) < 0.1 ||
        Number(slippage) > 5
      )
        throw new Error(
          "Choose slippage from 0.1% to 5%, with at most two decimal places.",
        );
      const result = await c.client.simulateContract({
        address: c.deployment.network.uniswapV4.quoter,
        abi: protocol.quoter,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: pool,
            zeroForOne:
              pool.currency0.toLowerCase() ===
              (buy ? zeroAddress : c.token.address).toLowerCase(),
            exactAmount: n,
            hookData: "0x",
          },
        ],
        account,
      });
      const out = result.result[0];
      if (out >= 2n ** 128n)
        throw new Error(
          "Quote exceeds this router’s amount limit. Use a smaller amount.",
        );
      if (out <= 0n)
        throw new Error(
          "No output is available for this trade. Try another amount.",
        );
      const min =
        (out * (10000n - BigInt(Math.round(Number(slippage) * 100)))) / 10000n;
      if (min <= 0n) throw new Error("Amount is too small after slippage.");
      const [allowance, permission] = buy
        ? [0n, [0n, 0, 0] as const]
        : await Promise.all([
            c.client.readContract({
              ...c.token,
              functionName: "allowance",
              args: [account, c.deployment.network.uniswapV4.permit2],
            }) as unknown as Promise<bigint>,
            c.client.readContract({
              address: c.deployment.network.uniswapV4.permit2,
              abi: protocol.permit2,
              functionName: "allowance",
              args: [
                account,
                c.token.address,
                c.deployment.network.uniswapV4.universalRouter,
              ],
            }),
          ]);
      if (current === generation.current)
        setQuote({
          input: n,
          out,
          minimum: min,
          expires: Date.now() + 60000,
          approval: allowance,
          permit: permission[0],
          expiration: permission[1],
          account,
        });
    } catch (e) {
      if (current === generation.current) setError(errorMessage(e));
    } finally {
      setQuoteBusy(false);
    }
  }
  function execute() {
    if (!quote || !pool || !valid) return;
    const expiration = Math.floor(Date.now() / 1000) + 1200;
    const deadline = BigInt(
      !buy && !permit ? Math.min(expiration, quote.expiration) : expiration,
    );
    const call = approval
      ? {
          ...c.token,
          functionName: "approve",
          args: [c.deployment.network.uniswapV4.permit2, quote.input],
        }
      : permit
        ? {
            address: c.deployment.network.uniswapV4.permit2,
            abi: protocol.permit2,
            functionName: "approve",
            args: [
              c.token.address,
              c.deployment.network.uniswapV4.universalRouter,
              quote.input,
              Number(deadline),
            ],
          }
        : swapCall(c, pool, buy, quote.input, quote.minimum, deadline);
    request({
      label: action,
      summary: approval
        ? `Approve Permit2 to spend exactly ${input} ${from}. Router permission and the swap are separate steps.`
        : permit
          ? `Let the Universal Router spend up to ${input} ${from} through Permit2 for 20 minutes. You will confirm the swap separately.`
          : `Swap ${input} ${from} for at least ${formatUnits(quote.minimum, outDecimals)} ${to}, allowing ${slippage}% slippage. This trade expires ${date(deadline)}. ${buy ? "ETH is sent with this transaction." : "No ETH is sent except the gas fee."}`,
      call,
      guard: () => {
        if (Date.now() >= quote.expires)
          throw new Error(
            "Quote expired. Get a fresh quote before continuing.",
          );
      },
      after: () => {
        setQuote(undefined);
        if (!approval && !permit) setInput("");
      },
    });
  }
  return (
    <>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Before you settle in</p>
          <h2>Swap SEVEN</h2>
        </div>
        <span className="small-badge">Uniswap v4</span>
      </div>
      <p>Get SEVEN with testnet ETH, or swap back when you’re ready.</p>
      <div className="segmented">
        <button aria-pressed={buy} onClick={() => setBuy(true)}>
          Buy SEVEN
        </button>
        <button aria-pressed={!buy} onClick={() => setBuy(false)}>
          Sell SEVEN
        </button>
      </div>
      <Field
        id="swap-amount"
        label={`You pay in ${from}`}
        unit={from}
        value={input}
        onChange={setInput}
        help={`Balance: ${account && snapshot ? display(buy ? snapshot.native : snapshot.wallet, decimals) : "—"} ${from}. Leave ETH for gas.`}
        error={error}
      />
      <div className="slippage-row">
        <label htmlFor="slippage">Slippage tolerance (%)</label>
        <input
          id="slippage"
          inputMode="decimal"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
          aria-describedby="slippage-help"
        />
      </div>
      <p className="hint" id="slippage-help">
        0.1%–5%. Quotes expire after 60 seconds.
      </p>
      {poolError ? (
        <div className="field-error" role="alert">
          {poolError}
          <button onClick={getPool}>Retry pool verification</button>
        </div>
      ) : !pool ? (
        <p className="hint">Verifying the launch pool…</p>
      ) : (
        <p className="hint">
          Verified pool · {(pool.fee / 10000).toFixed(2)}% fee · Native ETH pair
        </p>
      )}
      {quote && (
        <div className="quote">
          <div>
            <span>Estimated receive</span>
            <strong>
              {display(quote.out, outDecimals, 6)} {to}
            </strong>
          </div>
          <div>
            <span>Minimum receive</span>
            <strong>
              {display(quote.minimum, outDecimals, 6)} {to}
            </strong>
          </div>
          <p className="hint">
            1 {from} ≈{" "}
            {display(
              (quote.out * 10n ** BigInt(decimals)) / quote.input,
              outDecimals,
              6,
            )}{" "}
            {to}.{" "}
            {valid
              ? `${Math.ceil((quote.expires - Date.now()) / 1000)}s left`
              : "Quote expired; refresh to continue."}
          </p>
        </div>
      )}
      <div className="button-row">
        <button
          className="wide"
          disabled={!ready || !pool || quoteBusy || busy}
          onClick={() => void getQuote()}
        >
          {quoteBusy ? "Getting quote…" : quote ? "Refresh quote" : "Get quote"}
        </button>
        {quote && valid && (
          <button
            className="wide"
            disabled={!ready || quoteBusy}
            onClick={execute}
          >
            {busy && tx?.label === action ? `${action}…` : action}
          </button>
        )}
      </div>
      <p className="hint">
        {gating ||
          (!buy
            ? "Token approval → router permission → swap. Each step is confirmed separately."
            : "Buying with ETH needs no token approval.")}
      </p>
    </>
  );
}

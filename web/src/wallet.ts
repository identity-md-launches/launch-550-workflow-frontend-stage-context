import type { Address } from "viem";
import type { Config } from "./config";
export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, fn: (value: unknown) => void) => void;
  removeListener?: (event: string, fn: (value: unknown) => void) => void;
};
export type Wallet = { name: string; id: string; provider: Provider };
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export async function switchChain(provider: Provider, c: Config) {
  const params = [{ chainId: `0x${c.deployment.chainId.toString(16)}` }];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      e.code !== 4902 &&
      e.data?.originalError?.code !== 4902 &&
      !/unknown chain|unrecognized chain|not added/i.test(e.message ?? "")
    )
      throw error;
    if (!c.deployment.walletAddChain)
      throw new Error(
        "This network is not configured for wallet installation.",
      );
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [c.deployment.walletAddChain],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params });
  }
}
export async function assertWallet(
  provider: Provider,
  c: Config,
  account: Address,
) {
  const chain = Number(await provider.request({ method: "eth_chainId" }));
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];
  if (chain !== c.deployment.chainId)
    throw new Error(
      `Switch to ${c.deployment.network.name} before continuing.`,
    );
  if (accounts[0]?.toLowerCase() !== account.toLowerCase())
    throw new Error("Your wallet account changed. Reconnect and try again.");
}

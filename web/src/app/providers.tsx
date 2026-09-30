"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { connectorsForWallets, darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet, metaMaskWallet, rabbyWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { defineChain } from "viem";
import { createConfig, http, WagmiProvider } from "wagmi";
import { mainnet } from "wagmi/chains";

import { CHAIN_ID, PUBLIC_RPC_URL } from "@/lib/config";

const fork = defineChain({
  id: CHAIN_ID,
  name: "mainnet fork",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [PUBLIC_RPC_URL] } },
});
const chain = CHAIN_ID === 1 ? mainnet : fork;

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: projectId
        ? [metaMaskWallet, rabbyWallet, coinbaseWallet, rainbowWallet, walletConnectWallet]
        : [injectedWallet, rabbyWallet, coinbaseWallet],
    },
  ],
  { appName: "silverchat", projectId: projectId ?? "silverchat" },
);

// One block every 12s; polling faster only burns the RPC.
const config = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(PUBLIC_RPC_URL) },
  pollingInterval: 12_000,
  ssr: true,
});

const theme = darkTheme({ accentColor: "#e9e4da", accentColorForeground: "#141312", borderRadius: "none", fontStack: "system" });
theme.colors.modalBackground = "#2b2926";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>
        <RainbowKitProvider theme={theme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

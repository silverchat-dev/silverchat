// the zkAPI SDK is plain JavaScript; Zinc uses this much of it
declare module "@openanonymity/zkapi-browser-sdk/configure" {
  export function configureBrowserSdk(o: { configUrl?: string; workerUrl?: string }): void;
}
declare module "@openanonymity/zkapi-browser-sdk/build" {
  export function buildBrowserSdkAssets(o: { outDir: string; network: "mainnet" | "sepolia"; publicPath: string; build: unknown }): Promise<unknown>;
}
declare module "@openanonymity/zkapi-browser-sdk/client" {
  type Status = (s: { message?: string } | string) => void;
  export type Snapshot = {
    wallet: { has_note?: boolean; note?: { note_id: number; status: number; current_balance?: number | string; amount?: number | string; expiry?: number } } | null;
    deposits: { status: string; phase?: string; amount?: string }[];
    withdrawal: { status?: string; phase?: string; deadline?: number } | null;
    withdrawals: { recordId: string; mode: "mutual" | "escape"; phase: string; challengeDeadline?: number }[];
    loading: boolean;
    lastError: { message?: string } | string | null;
    initialized: boolean;
  };
  const client: {
    setWalletProvider(p: unknown): void;
    init(): Promise<void>;
    refresh(o?: { quiet?: boolean }): Promise<unknown>;
    snapshot(): Snapshot;
    subscribe(l: (s: Snapshot) => void): () => void;
    readonly hasNote: boolean;
    formatBillingAmount(units: number | string): string;
    formatMoney(units: number | string): string;
    prepareDepositQuote(eth: string, o: { from: string }): Promise<{ operationId: string }>;
    deposit(eth: string, onStatus: Status, o?: { preparedOperationId?: string }): Promise<unknown>;
    recoverBrowserDeposit(onStatus?: Status): Promise<unknown>;
    acquireInferenceAccess(sessionId: string, o: { spendingLimitUsd?: number; signal?: AbortSignal; onProgress?: (p: { message?: string }) => void }): Promise<{ apiKey: string; release: () => void }>;
    withdraw(mode: "mutual" | "escape", onStatus: Status, o?: { destination?: string }): Promise<unknown>;
    finalizeEscape(recordId: string, onStatus: Status): Promise<unknown>;
  };
  export default client;
}

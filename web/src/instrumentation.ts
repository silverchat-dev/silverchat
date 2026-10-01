export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_WORKERS !== "1") return;

  const { indexTick } = await import("./lib/server/indexer");
  const { priceTick } = await import("./lib/server/pricer");
  const { finalizeTick } = await import("./lib/server/finalizer");
  const { predictTick } = await import("./lib/server/predict");

  const loop = (name: string, fn: () => Promise<void>, everyMs: number) => {
    let failures = 0;
    const run = () =>
      fn()
        .then(() => {
          failures = 0;
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
          console.error(`[${name}]${++failures >= 3 ? ` failing ${failures}x:` : ""}`, msg);
        })
        // while it keeps failing, wait longer each time, up to 5 minutes, so a rate-limited RPC gets room
        .finally(() => setTimeout(run, failures >= 3 ? Math.min(everyMs * 2 ** (failures - 2), 300_000) : everyMs));
    setTimeout(run, 3000);
  };

  // 3 blocks a tick, well inside one 10-block log request
  loop("indexer", indexTick, 36_000);
  loop("pricer", priceTick, 120_000);
  loop("finalizer", finalizeTick, 30_000);
  loop("keeper", predictTick, 60_000);
}

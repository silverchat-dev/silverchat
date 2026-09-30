export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_WORKERS !== "1") return;

  const { indexTick } = await import("./lib/server/indexer");
  const { priceTick } = await import("./lib/server/pricer");

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
        .finally(() => setTimeout(run, everyMs));
    setTimeout(run, 3000);
  };

  loop("indexer", indexTick, 12_000);
  loop("pricer", priceTick, 60_000);
}

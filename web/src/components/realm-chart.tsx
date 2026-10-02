"use client";

import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

const FRAMES = [
  ["1m", 60],
  ["5m", 300],
  ["15m", 900],
  ["1h", 3600],
  ["4h", 14_400],
  ["1D", 86_400],
] as const;

const UP = "#7fb08c";
const DOWN = "#c4655b";
const usdFmt = (n: number) => (Math.abs(n) < 1e-15 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toPrecision(4));

/** A token's price (or market cap) in dollars, candles from its indexed trades, with volume under them. */
export function RealmChart({ token, symbol, trades, age }: { token: string; symbol: string; trades: number; age: number }) {
  // a young token opens on minutes, so its first trades are not one candle
  const [tf, setTf] = useState<number>(age < 6 * 3600 ? 60 : age < 3 * 86_400 ? 900 : 3600);
  const [cap, setCap] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  const data = useQuery({
    queryKey: ["realmCandles", token, tf],
    queryFn: async () => (await (await fetch(`/api/realm/token/${token}/candles?tf=${tf}`)).json()).candles as Candle[],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#a7a9ac", fontFamily: "ui-monospace, monospace", fontSize: 11 },
      grid: { vertLines: { color: "rgba(233,228,218,0.06)" }, horzLines: { color: "rgba(233,228,218,0.06)" } },
      rightPriceScale: { borderColor: "rgba(233,228,218,0.15)" },
      timeScale: { borderColor: "rgba(233,228,218,0.15)", timeVisible: true, secondsVisible: false, barSpacing: 8, minBarSpacing: 3, rightOffset: 4 },
      crosshair: { horzLine: { color: "#a7a9ac" }, vertLine: { color: "#a7a9ac" } },
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c || !data.data) return;
    const k = cap ? 1e9 : 1;
    const candles = c.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: { type: "custom", formatter: (p: number) => `$${usdFmt(p)}`, minMove: 1e-12 },
    });
    // volume on its own hidden scale at the bottom, so it never stretches the price scale down to zero
    const volume = c.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale("volume").applyOptions({ visible: false, scaleMargins: { top: 0.82, bottom: 0 } });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
    candles.setData(data.data.map((x) => ({ time: x.time as UTCTimestamp, open: x.open * k, high: x.high * k, low: x.low * k, close: x.close * k })));
    volume.setData(data.data.map((x) => ({ time: x.time as UTCTimestamp, value: x.volume, color: x.close >= x.open ? `${UP}66` : `${DOWN}66` })));
    // the latest 100 candles at a fixed width, ending at the right edge as on any exchange; a young token's few candles
    // sit on the right with space to their left, never one candle stretched over the whole chart
    const n = data.data.length;
    c.timeScale().setVisibleLogicalRange({ from: n - 100, to: n + 3 });
    return () => {
      c.removeSeries(candles);
      c.removeSeries(volume);
    };
  }, [data.data, cap]);

  const last = data.data?.at(-1);
  const first = data.data?.[0];
  const change = last && first ? (last.close / first.open - 1) * 100 : null;

  return (
    <section className="space-y-4 border border-paper/15 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-sm">${symbol} · dollars</h2>
        <div className="flex gap-1 font-mono text-xs">
          {(["Price", "Market cap"] as const).map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setCap(label === "Market cap")}
              aria-pressed={cap === (label === "Market cap")}
              className="border border-paper/25 px-3 py-1.5 aria-pressed:bg-paper aria-pressed:text-developer"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
        {FRAMES.map(([label, secs]) => (
          <button key={label} type="button" onClick={() => setTf(secs)} aria-pressed={tf === secs} className="px-2.5 py-1 text-silver aria-pressed:bg-paper/15 aria-pressed:text-paper">
            {label}
          </button>
        ))}
        {last && (
          <span className="ml-auto text-silver">
            {cap ? "cap" : "close"} ${usdFmt(last.close * (cap ? 1e9 : 1))}
            {change !== null && <span className={change >= 0 ? "text-[#7fb08c]" : "text-[#c4655b]"}> {change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>}
          </span>
        )}
      </div>
      <div ref={box} className="h-80 w-full sm:h-96" />
      {trades === 0 && <p className="font-mono text-xs text-silver">No trades yet: the chart starts at the opening price.</p>}
    </section>
  );
}

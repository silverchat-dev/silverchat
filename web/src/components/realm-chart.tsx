"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
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

// the chart is drawn in the page's own inks, read from the theme: a rising candle is solid ink, a falling one a hollow
// outline in the soft ink. The green is kept for the one thing to do.
const ink = (el: HTMLElement, name: string) => getComputedStyle(el).getPropertyValue(name).trim() || getComputedStyle(el).color;
/** The same colour, faded: works for the theme's "#rrggbb" and for "rgb(r, g, b)". */
function fade(c: string, a: number) {
  const hex = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const [r, g, b] = hex ? hex.slice(1).map((x) => parseInt(x, 16)) : (c.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  return `rgba(${r},${g},${b},${a})`;
}
const usdFmt = (n: number) => (Math.abs(n) < 1e-15 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toPrecision(4));

/** A token's price (or market cap) in dollars, candles from its indexed trades, with volume under them. */
export function RealmChart({ token, symbol, trades, age }: { token: string; symbol: string; trades: number; age: number }) {
  // a young token opens on minutes, so its first trades are not one candle
  const [tf, setTf] = useState<number>(age < 6 * 3600 ? 60 : age < 3 * 86_400 ? 900 : 3600);
  const [cap, setCap] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<{ c: IChartApi; candles: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram">; PAPER: string; SILVER: string } | null>(null);
  // the view is set once per timeframe; a refresh keeps wherever the reader scrolled or zoomed
  const framed = useRef<number | null>(null);

  const data = useQuery({
    queryKey: ["realmCandles", token, tf],
    queryFn: async () => (await (await fetch(`/api/realm/token/${token}/candles?tf=${tf}`)).json()).candles as Candle[],
    refetchInterval: 30_000,
  });

  // one chart and its two series for the life of the component; removing the chart removes them too
  useEffect(() => {
    if (!box.current) return;
    const PAPER = ink(box.current, "--color-paper");
    const SILVER = ink(box.current, "--color-silver");
    const mono = getComputedStyle(box.current).getPropertyValue("--font-mono").trim() || "ui-monospace, monospace";
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: SILVER, fontFamily: mono, fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: fade(PAPER, 0.08), style: 2 } },
      rightPriceScale: { borderColor: fade(PAPER, 0.25) },
      timeScale: { borderColor: fade(PAPER, 0.25), timeVisible: true, secondsVisible: false, barSpacing: 8, minBarSpacing: 3, rightOffset: 4 },
      crosshair: { horzLine: { color: SILVER, labelBackgroundColor: PAPER }, vertLine: { color: SILVER, labelBackgroundColor: PAPER } },
    });
    const candles = c.addSeries(CandlestickSeries, {
      upColor: PAPER,
      downColor: "transparent",
      borderUpColor: PAPER,
      borderDownColor: SILVER,
      wickUpColor: PAPER,
      wickDownColor: SILVER,
      priceFormat: { type: "custom", formatter: (p: number) => `$${usdFmt(p)}`, minMove: 1e-12 },
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
    // volume on its own hidden scale at the bottom, so it never stretches the price scale down to zero
    const volume = c.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale("volume").applyOptions({ visible: false, scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = { c, candles, volume, PAPER, SILVER };
    return () => {
      chart.current = null;
      c.remove();
    };
  }, []);

  useEffect(() => {
    const s = chart.current;
    if (!s || !data.data) return;
    const k = cap ? 1e9 : 1;
    s.candles.setData(data.data.map((x) => ({ time: x.time as UTCTimestamp, open: x.open * k, high: x.high * k, low: x.low * k, close: x.close * k })));
    s.volume.setData(data.data.map((x) => ({ time: x.time as UTCTimestamp, value: x.volume, color: x.close >= x.open ? fade(s.PAPER, 0.3) : fade(s.SILVER, 0.22) })));
    if (framed.current !== tf) {
      // the latest 100 candles at a fixed width, ending at the right edge as on any exchange
      const n = data.data.length;
      s.c.timeScale().setVisibleLogicalRange({ from: n - 100, to: n + 3 });
      framed.current = tf;
    }
  }, [data.data, cap, tf]);

  const last = data.data?.at(-1);
  const first = data.data?.[0];
  const change = last && first ? (last.close / first.open - 1) * 100 : null;

  // the tap area is a full 44 px on a phone, the ink fill only as tall as the word
  const toggle = "group inline-flex min-h-11 items-center font-mono text-[12px] tracking-[0.04em] text-silver transition-colors hover:text-paper aria-pressed:text-developer sm:min-h-9";
  const fill = "rounded-full px-2.5 py-1 transition-colors group-aria-pressed:bg-paper";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div role="group" aria-label="Timeframe" className="-mx-1 flex flex-wrap">
          {FRAMES.map(([name, secs]) => (
            <button key={name} type="button" onClick={() => setTf(secs)} aria-pressed={tf === secs} className={toggle}>
              <span className={fill}>{name}</span>
            </button>
          ))}
        </div>
        <div role="group" aria-label={`$${symbol} in dollars`} className="-mx-1 flex">
          {(["Price", "Market cap"] as const).map((name) => (
            <button key={name} type="button" onClick={() => setCap(name === "Market cap")} aria-pressed={cap === (name === "Market cap")} className={toggle}>
              <span className={fill}>{name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-silver tabular-nums">
        <span>${symbol} · dollars</span>
        {last && (
          <span>
            {cap ? "cap" : "close"} <span className="text-paper">${usdFmt(last.close * (cap ? 1e9 : 1))}</span>
            {change !== null && (
              <span className={change >= 0 ? "text-paper" : "text-silver"}>
                {" "}
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            )}
          </span>
        )}
      </p>
      <div ref={box} className="h-72 w-full sm:h-80" />
      {trades === 0 && <p className="font-mono text-[11px] text-silver">No trades yet: the chart starts at the opening price.</p>}
    </div>
  );
}

/**
 * cbBTC minute-bar trading bot for agent-fun/bars-replay/v1 (make.fun btc-race).
 *
 * Self-contained: Node 22, no imports beyond node:readline. Speaks
 * newline-delimited JSON on stdin/stdout: hello once, one batch per minute,
 * one reply per batch, then done. Deterministic: no clock, no randomness, no
 * files, no network; the same bars always produce the same orders.
 *
 * Strategy (long only, one position, $1,000 paper start):
 *   Buy a sharp dip: the latest close sits at least 1.6% below the highest
 *   close of the trailing 240 bars and the fall has stabilised (the lowest
 *   close of the last 10 bars is no lower than the lowest of the last 30, or
 *   the close just rose). A full-size round trip costs roughly 26-36 bps in
 *   fee, slippage and price impact, so entries demand a dislocation well
 *   above that. Sell on a +2.0% take-profit over the average entry price, a
 *   -0.9% stop-loss, or after 360 bars. Two guards protect the unseen race
 *   window: no new position in the last 60 bars (a position needs time to
 *   work before the end-of-window flatten), and a circuit breaker that
 *   flattens and stops trading if equity falls 3% below its peak.
 */

import { createInterface } from "node:readline";

// Strategy parameters (fractions are of price / equity).
const W = 240; // trailing window (bars) for the reference high
const E_DROP = 0.016; // required fall from the trailing high to call it a dip
const STAB = 10; // stabilisation lookback (bars)
const TP = 0.020; // take-profit over average entry price
const SL = 0.009; // stop-loss under average entry price
const MAX_HOLD = 360; // bars, then sell whatever the price
const COOLDOWN = 10; // bars to wait after an exit before re-entering
const BREAKER = 0.03; // equity fall from peak that stops trading for the window
const LATE = 60; // no new entries in the last this many bars of the window
const N_BARS = 1440; // bars in a window
const MAX_SLIP = 300; // max_slippage_bps sent on every order
const MIN_NOTIONAL = 1_000_000; // 1 USDC in quote units

interface Order {
  side: string;
  notional?: number;
  qty?: number;
}

class Bot {
  closes: number[] = []; // closes in USDC, one per bar seen
  entrySeq: number | null = null; // seq of the batch that first showed the fill
  entryPx: number | null = null; // average entry price (USDC) from cost / qty
  coolUntil = -1;
  peakEq: number | null = null;
  stopped = false;

  decide(seq: number, closeRaw: number, cash: number, qty: number, cost: number, equity: number): Order[] {
    const px = closeRaw / 1e5; // price_scale 5
    this.closes.push(px);
    if (this.peakEq === null || equity > this.peakEq) this.peakEq = equity;
    const orders: Order[] = [];
    if (qty > 0 && this.entryPx === null) {
      this.entryPx = cost / 1e6 / (qty / 1e8); // quote units -> USDC, qty at 1e8 scale
      this.entrySeq = seq;
    }
    if (qty > 0) {
      const r = px / (this.entryPx as number) - 1.0;
      if (
        r >= TP ||
        r <= -SL ||
        seq - (this.entrySeq as number) >= MAX_HOLD ||
        (this.peakEq !== null && equity < this.peakEq * (1.0 - BREAKER))
      ) {
        orders.push({ side: "sell", qty });
        this.entryPx = null;
        this.entrySeq = null;
        this.coolUntil = seq + COOLDOWN;
      }
      return orders;
    }
    if (this.stopped) return orders;
    if (this.peakEq !== null && equity < this.peakEq * (1.0 - BREAKER)) {
      this.stopped = true;
      return orders;
    }
    if (seq < this.coolUntil || this.closes.length <= W) return orders;
    if (seq >= N_BARS - LATE) return orders;
    let hi = 0;
    for (let i = this.closes.length - W; i < this.closes.length; i++) {
      if (this.closes[i] > hi) hi = this.closes[i];
    }
    if (px <= hi * (1.0 - E_DROP)) {
      let loShort = Infinity;
      let loLong = Infinity;
      for (let i = this.closes.length - STAB; i < this.closes.length; i++) {
        if (this.closes[i] < loShort) loShort = this.closes[i];
      }
      for (let i = this.closes.length - STAB * 3; i < this.closes.length; i++) {
        if (this.closes[i] < loLong) loLong = this.closes[i];
      }
      if (loShort >= loLong || px > this.closes[this.closes.length - 2]) {
        let notional = equity; // frac 1.0 of equity, capped by cash below
        if (notional > cash) notional = cash;
        if (notional >= MIN_NOTIONAL) {
          orders.push({ side: "buy", notional });
          this.entrySeq = seq + 1; // fills at the next bar's open
          this.entryPx = null;
        }
      }
    }
    return orders;
  }
}

async function main(): Promise<void> {
  const bot = new Bot();
  let symbol = "";
  let warmup = 0;
  let nextId = 1;
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    const msg = JSON.parse(text);
    if (msg.type === "hello") {
      symbol = msg.symbols[0].symbol;
      warmup = msg.warmup_bars ?? 0;
      continue;
    }
    if (msg.type === "done") break;
    if (msg.type !== "batch") continue;
    const seq: number = msg.seq;
    const account = msg.account;
    const cash = Number(account.cash_quote_units);
    const equity = Number(account.equity_quote_units);
    let qty = 0;
    let cost = 0;
    for (const p of account.positions) {
      if (p.symbol === symbol) {
        qty = Number(p.qty);
        cost = Number(p.cost_quote_units);
      }
    }
    let closeRaw: number | null = null;
    for (const bar of msg.bars) {
      if (bar.symbol === symbol) closeRaw = Number(bar.c);
    }
    const orders: unknown[] = [];
    if (closeRaw !== null && seq >= warmup) {
      for (const o of bot.decide(seq, closeRaw, cash, qty, cost, equity)) {
        const wire: Record<string, unknown> = {
          side: o.side,
          client_id: "o" + nextId,
          symbol,
        };
        nextId += 1;
        if (o.side === "buy") wire["notional_quote_units"] = String(o.notional);
        else wire["qty"] = String(o.qty);
        wire["max_slippage_bps"] = MAX_SLIP;
        orders.push(wire);
      }
    } else if (closeRaw !== null) {
      bot.closes.push(closeRaw / 1e5); // warm-up: build history, never order
    }
    process.stdout.write(JSON.stringify({ type: "reply", seq, orders }) + "\n");
  }
}

main();

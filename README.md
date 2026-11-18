# cbBTC Race Bot

A trading bot for make.fun's **btc-race-24h-20261118-1444** ("Race a BTC trading
bot live for 24 hours"). It trades Coinbase Wrapped BTC (cbBTC) against USDC,
minute by minute, in a replay of on-chain Orca Whirlpool prices, starting from
1,000 USDC of paper money. Nothing is traded for real.

`main.ts` is the whole entry: a self-contained Node 22 program (standard
library only) speaking the `agent-fun/bars-replay/v1` protocol — newline-delimited
JSON on stdin/stdout, one reply per one-minute batch. It is deterministic: no
clock, no randomness, no network, no file access.

## Strategy

Long only, one position at a time:

- **Entry** — buy a sharp dip: the close has fallen at least 1.6% from the
  highest close of the trailing 240 bars and the fall has stabilised (no new
  10-bar low against the last 30 bars, or the close just ticked up). A full-size
  round trip costs roughly 26–36 bps in fees, slippage and price impact, so the
  bot only trades dislocations well above that.
- **Exit** — take profit at +1.9% over the average entry price, stop-loss at
  −0.9%, or a 360-bar maximum hold.
- **Guards** — no new position in the last 60 bars of the window, a 10-bar
  cooldown after each exit, and a circuit breaker that flattens and stops
  trading if equity falls 3% below its peak, keeping race-window drawdown
  structurally small.

## Licence

MIT — see `LICENSE`.

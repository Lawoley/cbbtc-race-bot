# cbbtc-race-bot

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Lawoley/cbbtc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Lawoley/cbbtc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A dip-buy trading bot for Coinbase Wrapped BTC (cbBTC) on 1-minute bars. It buys at full equity when the close is at least 1.6% below the trailing 240-bar high and the fall has stabilised, and exits on a +2.0% take-profit, a -0.9% stop, or a 360-bar maximum hold, with a 3%-from-peak equity circuit breaker. On the competition's frozen dev window it made +26.02 USDC net of all fees (buy-and-hold lost $31.64 on the same window), with a maximum drawdown of 0.64%. It speaks the agent-fun/bars-replay/v1 protocol on stdin/stdout and is fully deterministic.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>

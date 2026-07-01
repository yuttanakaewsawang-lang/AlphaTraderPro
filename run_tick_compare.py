"""
เทียบ Baseline vs Opt3 Swing SL ด้วย tick-mode (real ticks) — จับ wick/spread/slippage จริง
2 เดือนล่าสุด. Metric อิงเงินจริง (profit $) + R
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import load_strategy_config
from backtest import run_backtest
from main import initialize_mt5
from datetime import datetime

SYMBOL = "XAUUSD."
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"


def month_keys(n):
    now = datetime.now(); out = []
    for back in range(n - 1, -1, -1):
        y, m = now.year, now.month - back
        while m <= 0: m += 12; y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def run(cfg, months):
    rs, profits = [], []
    for mo in months:
        r = run_backtest(SYMBOL, month=mo, config=cfg, use_real_ticks=True)
        if r:
            for t in r.get("trades", []):
                rs.append(t.get("r", 0)); profits.append(t.get("profit", 0))
    return rs, profits


def stats(rs, profits):
    n = len(rs)
    if n == 0:
        return "no trades"
    wins = sum(1 for x in rs if x > 0)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    return (f"trades={n:4d}  WR={wins/n*100:5.1f}%  P&L={sum(rs):+7.1f}R  "
            f"profit=${sum(profits):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R")


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(2)

    print(f"\n{'='*88}")
    print(f"TICK-MODE Compare - {SYMBOL}  ({months[0]} to {months[-1]})  [real fills: wick+spread+slip]")
    print(f"{'='*88}")

    for label, ov in [("Baseline (0.3, row1)", {}), ("Opt3 Swing SL", {"use_swing_sl": 1})]:
        cfg = {**base, **ov}
        print(f"\n[{label}]")
        rs, pr = run(cfg, months)
        print("  " + stats(rs, pr))
    print(f"\n{'='*88}\n")


if __name__ == "__main__":
    main()

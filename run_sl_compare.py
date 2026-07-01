"""
เปรียบเทียบแนวทางวาง SL — อิง config จริงจาก DB, ข้อมูล MT5 6 เดือน:
  Baseline   : ปัจจุบัน (row1 high/low, min_sl_atr=0.3)
  Opt1-*     : ขยาย min_sl_atr floor (0.8 / 1.0 / 1.2 / 1.5 / 2.0)
  Opt2-Zone  : SL อิงขอบโซน (use_zone_sl=1)
  Opt3-Swing : SL อิง swing high/low ล่าสุด (use_swing_sl=1)
Metrics: trades, WR, P&L(R), avg SL dist, expectancy(R/trade), maxDD(R)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import load_strategy_config
from backtest import run_backtest
from main import initialize_mt5
from datetime import datetime

SYMBOL = "XAUUSD."
MONTHS = 6
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"


def month_keys(n):
    now = datetime.now(); out = []
    for back in range(n - 1, -1, -1):
        y, m = now.year, now.month - back
        while m <= 0: m += 12; y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def run_cfg(cfg, months):
    all_r = []
    for mo in months:
        r = run_backtest(SYMBOL, month=mo, config=cfg)
        if r:
            all_r += [t.get("r", 0) for t in r.get("trades", [])]
    return all_r


def stats(rs):
    n = len(rs)
    if n == 0:
        return dict(trades=0, wr=0, pnl=0, exp=0, dd=0)
    wins = sum(1 for x in rs if x > 0)
    pnl = sum(rs)
    # max drawdown ของ equity curve (R)
    cum = 0; peak = 0; dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    return dict(trades=n, wr=wins / n * 100, pnl=pnl, exp=pnl / n, dd=dd)


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(MONTHS)

    variants = [
        ("Baseline (0.3, row1)",  {}),
        ("Opt1 min_sl 0.8",       {"min_sl_atr": 0.8}),
        ("Opt1 min_sl 1.0",       {"min_sl_atr": 1.0}),
        ("Opt1 min_sl 1.2",       {"min_sl_atr": 1.2}),
        ("Opt1 min_sl 1.5",       {"min_sl_atr": 1.5}),
        ("Opt1 min_sl 2.0",       {"min_sl_atr": 2.0}),
        ("Opt2 Zone SL",          {"use_zone_sl": 1}),
        ("Opt2 Zone + min 1.0",   {"use_zone_sl": 1, "min_sl_atr": 1.0}),
        ("Opt3 Swing SL",         {"use_swing_sl": 1}),
        ("Opt3 Swing + min 1.0",  {"use_swing_sl": 1, "min_sl_atr": 1.0}),
    ]

    print(f"\n{'='*82}")
    print(f"SL Comparison - {SYMBOL}  ({months[0]} to {months[-1]})")
    print(f"{'='*82}")
    print(f"{'Variant':24s} | {'Trades':>6s} | {'WR%':>5s} | {'P&L(R)':>8s} | {'Exp(R)':>7s} | {'MaxDD(R)':>8s}")
    print(f"{'-'*82}")
    for label, ov in variants:
        cfg = {**base, **ov}
        s = stats(run_cfg(cfg, months))
        print(f"{label:24s} | {s['trades']:6d} | {s['wr']:5.1f} | {s['pnl']:+8.1f} | {s['exp']:+7.3f} | {s['dd']:8.1f}")
    print(f"{'='*82}\n")


if __name__ == "__main__":
    main()

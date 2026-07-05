"""
จูน GBPUSD: spread จริง 6 points (เดิมจำลอง 11) × timeframe M5/M15 × TP 3.5R/2.5R
ฐาน config XAUUSD ปัจจุบัน · tick-mode 4 เดือน
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import load_strategy_config
from backtest import run_backtest
from main import initialize_mt5
from datetime import datetime

SYMBOL = "GBPUSD."
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"


def month_keys(n):
    now = datetime.now(); out = []
    for back in range(n - 1, -1, -1):
        y, m = now.year, now.month - back
        while m <= 0: m += 12; y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def run(cfg, months):
    rs, pr = [], []
    for mo in months:
        r = run_backtest(SYMBOL, month=mo, config=cfg, use_real_ticks=True)
        if r:
            for t in r.get("trades", []):
                rs.append(t.get("r", 0)); pr.append(t.get("profit", 0))
    return rs, pr


def line(label, rs, pr):
    n = len(rs)
    if n == 0:
        print(f"  {label:34s} | no trades"); return
    wins = sum(1 for x in rs if x > 0)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    print(f"  {label:34s} | trades={n:4d}  WR={wins/n*100:5.1f}%  "
          f"P&L={sum(rs):+7.1f}R  profit=${sum(pr):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R", flush=True)


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config("XAUUSD.") or {}
    base["start_balance"] = 10000
    base["spread_points"] = 6.0   # spread จริง GBPUSD (วัด 2026-07-03)
    months = month_keys(4)

    print(f"\n{'='*104}")
    print(f"GBPUSD tune - spread จริง 6pts  ({months[0]} to {months[-1]})  [tick-mode]")
    print(f"{'='*104}", flush=True)

    variants = [
        ("M5/M5  TP 3.5R (config เดิม)",  {}),
        ("M15/M15 TP 3.5R",               {"zone_timeframe": "M15", "entry_timeframe": "M15"}),
        ("M5/M5  TP 2.5R",                {"tp_ratio_rr": 2.5}),
        ("M15/M15 TP 2.5R",               {"zone_timeframe": "M15", "entry_timeframe": "M15", "tp_ratio_rr": 2.5}),
    ]
    for label, ov in variants:
        cfg = {**base, **ov}
        rs, pr = run(cfg, months)
        line(label, rs, pr)
    print(f"{'='*104}\n")


if __name__ == "__main__":
    main()

"""
เปรียบเทียบ Trend Filter:
  A: EMA 50       (trend_filter_mode=0)
  B: HH/HL struct (trend_filter_mode=1)
  C: ปิด filter   (use_trend_filter=0)
อิง config จริงจาก DB, ข้อมูล MT5 ย้อนหลัง 6 เดือน
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import load_strategy_config, load_settings
from backtest import run_backtest
from main import initialize_mt5
from datetime import datetime

SYMBOL  = "XAUUSD."
MONTHS  = 6


def month_keys(n):
    now = datetime.now()
    out = []
    for back in range(n - 1, -1, -1):
        y, m = now.year, now.month - back
        while m <= 0: m += 12; y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def run_mode(symbol, month, cfg):
    r = run_backtest(symbol, month=month, config=cfg)
    if not r:
        return None
    t = r.get("trades", [])
    wins  = sum(1 for x in t if x.get("r", 0) > 0)
    total = len(t)
    pnl   = sum(x.get("r", 0) for x in t)
    return {"trades": total, "wins": wins, "pnl": round(pnl, 2)}


def print_summary(label, rows):
    total_t = sum(r["trades"] for r in rows if r)
    total_w = sum(r["wins"]   for r in rows if r)
    total_p = sum(r["pnl"]    for r in rows if r)
    wr = (total_w / total_t * 100) if total_t else 0
    print(f"  {label:30s} | trades={total_t:4d}  wins={total_w:4d}  WR={wr:5.1f}%  P&L={total_p:+.2f}R")


def main():
    tp = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"
    if not initialize_mt5(terminal_path=tp):
        print("MT5 init failed"); return

    base_cfg = load_strategy_config(SYMBOL) or {}
    base_cfg["start_balance"] = 10000
    base_cfg["use_trend_filter"] = 1

    months = month_keys(MONTHS)
    print(f"\n{'='*70}")
    print(f"Trend Filter Comparison - {SYMBOL}  ({months[0]} to {months[-1]})")
    print(f"{'='*70}")

    modes = [
        ("A: EMA 50",        {"trend_filter_mode": 0}),
        ("B: HH/HL struct",  {"trend_filter_mode": 1, "swing_lookback": 2}),
        ("C: No filter",     {"use_trend_filter": 0}),
    ]

    for label, overrides in modes:
        cfg = {**base_cfg, **overrides}
        rows = []
        month_stats = []
        for mo in months:
            r = run_mode(SYMBOL, mo, cfg)
            rows.append(r)
            t = r["trades"] if r else 0
            p = r["pnl"]    if r else 0.0
            month_stats.append(f"{mo}: {t}T {p:+.1f}R")
        print(f"\n[{label}]")
        for s in month_stats:
            print(f"    {s}")
        print_summary("TOTAL", rows)

    print(f"\n{'='*70}\n")


if __name__ == "__main__":
    main()

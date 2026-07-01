"""
เทียบ Timeframe combinations — อิง config จริง, ข้อมูล MT5 6 เดือน (bar-mode)
โฟกัส zone_timeframe (โครงสร้าง) x entry_timeframe (แท่งยืนยัน)
Metrics: trades, WR, P&L(R), expectancy(R/ไม้), maxDD(R)
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
    rs = []
    for mo in months:
        r = run_backtest(SYMBOL, month=mo, config=cfg)
        if r:
            rs += [t.get("r", 0) for t in r.get("trades", [])]
    return rs


def stats(rs):
    n = len(rs)
    if n == 0:
        return dict(trades=0, wr=0, pnl=0, exp=0, dd=0)
    wins = sum(1 for x in rs if x > 0)
    pnl = sum(rs)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    return dict(trades=n, wr=wins / n * 100, pnl=pnl, exp=pnl / n, dd=dd)


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(MONTHS)
    cur_zone = base.get("zone_timeframe", "M5")
    cur_entry = base.get("entry_timeframe", "M5")

    combos = [
        (f"Current ({cur_zone}/{cur_entry})", {}),
        ("M5 zone / M5 entry",   {"zone_timeframe": "M5",  "entry_timeframe": "M5"}),
        ("M5 zone / M1 entry",   {"zone_timeframe": "M5",  "entry_timeframe": "M1"}),
        ("M15 zone / M15 entry", {"zone_timeframe": "M15", "entry_timeframe": "M15"}),
        ("M15 zone / M5 entry",  {"zone_timeframe": "M15", "entry_timeframe": "M5"}),
        ("M30 zone / M5 entry",  {"zone_timeframe": "M30", "entry_timeframe": "M5"}),
    ]

    print(f"\n{'='*80}")
    print(f"Timeframe Comparison - {SYMBOL}  ({months[0]} to {months[-1]})  [bar-mode, 6mo]")
    print(f"{'='*80}")
    print(f"{'Combo':24s} | {'Trades':>6s} | {'WR%':>5s} | {'P&L(R)':>8s} | {'Exp(R)':>7s} | {'MaxDD':>7s}")
    print(f"{'-'*80}")
    for label, ov in combos:
        s = stats(run_cfg({**base, **ov}, months))
        print(f"{label:24s} | {s['trades']:6d} | {s['wr']:5.1f} | {s['pnl']:+8.1f} | {s['exp']:+7.3f} | {s['dd']:7.1f}")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    main()

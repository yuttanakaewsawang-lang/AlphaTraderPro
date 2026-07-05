"""
เทียบ zone_expiry_bars (M5) — อิง config จริงจาก DB, bar-mode 6 เดือน
zone_expiry_bars = จำนวนแท่งที่รอ retest หลัง zone broken ก่อนจะ expire
บน M5: 50 bars = 250 นาที (~4.2 ชม.)
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
    cur = base.get("zone_expiry_bars", 50)

    values = [10, 20, 30, 50, 75, 100, 150, 200]
    print(f"\n{'='*88}")
    print(f"Zone Expiry (BARS) Comparison - {SYMBOL} M5 ({months[0]} to {months[-1]}) [bar-mode, 6mo]")
    print(f"current DB value = {cur} bars ({cur*5} min = {cur*5/60:.1f} hr)")
    print(f"{'='*88}")
    print(f"{'Bars':>6s} | {'~Time':>9s} | {'Trades':>6s} | {'WR%':>5s} | {'P&L(R)':>8s} | {'Exp(R)':>7s} | {'MaxDD':>7s}")
    print(f"{'-'*88}")
    for v in values:
        cfg = {**base, "zone_expiry_bars": v}
        s = stats(run_cfg(cfg, months))
        mark = " <-- current" if v == cur else ""
        mins = v * 5
        tstr = f"{mins}m" if mins < 60 else f"{mins/60:.1f}h"
        print(f"{v:6d} | {tstr:>9s} | {s['trades']:6d} | {s['wr']:5.1f} | {s['pnl']:+8.1f} | {s['exp']:+7.3f} | {s['dd']:7.1f}{mark}")
    print(f"{'='*88}\n")


if __name__ == "__main__":
    main()

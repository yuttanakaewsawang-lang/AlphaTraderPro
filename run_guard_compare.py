"""
เทียบความเข้ม Zone Entry Guard: max_entry_zone_atr 0.3 (default) vs ผ่อนขึ้น vs ปิด guard
config จริงจาก DB · tick-mode 4 เดือน (fill จริง)
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
        print(f"  {label:30s} | no trades"); return
    wins = sum(1 for x in rs if x > 0)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    print(f"  {label:30s} | trades={n:4d}  WR={wins/n*100:5.1f}%  "
          f"P&L={sum(rs):+7.1f}R  profit=${sum(pr):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R")


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(4)

    print(f"\n{'='*100}")
    print(f"Zone Entry Guard: max_entry_zone_atr - {SYMBOL}  ({months[0]} to {months[-1]})  [tick-mode]")
    print(f"{'='*100}")

    variants = [
        ("Guard 0.3xATR (default)", {"entry_mode": 1, "max_entry_zone_atr": 0.3}),
        ("Guard 0.5xATR",           {"entry_mode": 1, "max_entry_zone_atr": 0.5}),
        ("Guard 0.8xATR",           {"entry_mode": 1, "max_entry_zone_atr": 0.8}),
        ("Guard 1.2xATR",           {"entry_mode": 1, "max_entry_zone_atr": 1.2}),
        ("Guard OFF (entry_mode=0)", {"entry_mode": 0}),
    ]
    for label, ov in variants:
        cfg = {**base, **ov}
        rs, pr = run(cfg, months)
        line(label, rs, pr)
    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()

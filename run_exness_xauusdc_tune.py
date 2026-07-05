"""
จูน config XAUUSDc บน Exness — ฐาน config ปัจจุบัน (ที่ validate บน IUX) + spread จริง 240pts
แกนที่ไล่: tp_ratio_rr / max_entry_zone_atr (guard) / min_sl_atr / timeframe
tick-mode 4 เดือน · ดึงข้อมูลจาก Exness terminal
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import load_strategy_config
from backtest import run_backtest
from main import initialize_mt5
from datetime import datetime

SYMBOL = "XAUUSDc"
TP = r"C:\Program Files\MetaTrader 5 EXNESS\terminal64.exe"


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
          f"P&L={sum(rs):+7.1f}R  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R", flush=True)


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config("XAUUSD.") or {}
    base["start_balance"] = 10000
    base["tp_ratio_rr"] = 3.5
    base["spread_points"] = 240.0  # spread จริง XAUUSDc (วัด 2026-07-03)
    months = month_keys(4)

    print(f"\n{'='*100}")
    print(f"XAUUSDc (Exness) config tune  ({months[0]} to {months[-1]})  [tick-mode, spread 240pts]")
    print(f"{'='*100}", flush=True)

    variants = [
        ("baseline (M5 TP3.5 g0.3 sl0.5)", {}),
        ("TP 2.5R",                        {"tp_ratio_rr": 2.5}),
        ("TP 4.5R",                        {"tp_ratio_rr": 4.5}),
        ("guard 0.2xATR",                  {"max_entry_zone_atr": 0.2}),
        ("guard 0.5xATR",                  {"max_entry_zone_atr": 0.5}),
        ("min_sl 0.3xATR",                 {"min_sl_atr": 0.3}),
        ("min_sl 0.8xATR",                 {"min_sl_atr": 0.8}),
        ("M15/M15 TP3.5",                  {"zone_timeframe": "M15", "entry_timeframe": "M15"}),
    ]
    for label, ov in variants:
        cfg = {**base, **ov}
        rs, pr = run(cfg, months)
        line(label, rs, pr)
    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()

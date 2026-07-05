"""
ตรวจ config ปัจจุบันตามภาพ (buffer_atr=0.15, min_sl_atr=1.2, use_swing_sl=1, zone_expiry=50)
เทียบกับ min_sl_atr ค่าอื่นๆ (ตอนที่ Swing SL เปิดอยู่ด้วย) — tick-mode 4 เดือน (fill จริง)
เพราะ min_sl_atr + swing_sl ใช้ max() ร่วมกัน อาจซ้ำซ้อนกันจนกว้างเกินจำเป็น
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import load_strategy_config
from backtest import run_backtest
from main import initialize_mt5
from datetime import datetime

SYMBOL = "XAUUSD."
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"

# ค่าตามภาพจริงที่ user ใช้ (ทับ DB ของเครื่องนี้ที่ไม่ตรงกัน)
CURRENT_CONFIG = {
    "zone_expiry_bars": 50,
    "zone_atr_mult": 0.3,
    "min_candle_atr": 0.3,
    "max_candle_atr": 2.5,
    "buffer_atr": 0.15,
    "min_sl_atr": 1.2,
    "max_ob_zone_atr": 5.0,
    "use_swing_sl": 1,
    "zone_timeframe": "M5",
    "entry_timeframe": "M5",
}


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
        print(f"  {label:26s} | no trades"); return
    wins = sum(1 for x in rs if x > 0)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    print(f"  {label:26s} | trades={n:4d}  WR={wins/n*100:5.1f}%  "
          f"P&L={sum(rs):+7.1f}R  profit=${sum(pr):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R")


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    base.update(CURRENT_CONFIG)
    months = month_keys(4)

    print(f"\n{'='*96}")
    print(f"Current Live Config Check - {SYMBOL} M5  ({months[0]} to {months[-1]})  [tick-mode, real fills]")
    print(f"{'='*96}")

    variants = [
        ("Current (min_sl=1.2, swing=ON)", {}),
        ("min_sl=0.3, swing=ON",           {"min_sl_atr": 0.3}),
        ("min_sl=0.5, swing=ON",           {"min_sl_atr": 0.5}),
        ("min_sl=0.8, swing=ON",           {"min_sl_atr": 0.8}),
        ("min_sl=0 (off), swing=ON",       {"min_sl_atr": 0}),
    ]
    for label, ov in variants:
        cfg = {**base, **ov}
        rs, pr = run(cfg, months)
        line(label, rs, pr)
    print(f"{'='*96}\n")


if __name__ == "__main__":
    main()

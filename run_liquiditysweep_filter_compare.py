"""
ทดลอง: เพิ่ม filter "Liquidity Sweep" (double-top/double-bottom) ก่อนยอมรับ zone break
แนวคิดจากภาพ pattern (Double Top/Bottom, H&S) — ก่อน zone จะ "broken" (BOS จริง) ต้องเห็น
equal-high/equal-low ก่อนหน้า (liquidity pool) ที่เพิ่งถูก sweep มา ถึงจะยอมรับว่าเป็น breakout
ของจริง (สอดคล้องแนวคิด SMC liquidity grab) — ถ้าไม่เจอ sweep ก่อนหน้า = breakout เปล่าๆ ข้ามทิ้ง

engine เดียวกันทุกอย่างกับ baseline ต่างแค่เงื่อนไข accept ใน _update_zone (ไม่แก้ Strategy.py/backtest.py จริง)
config จริงจาก DB · tick-mode 4 เดือน (fill จริง)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backtest
from backtest import run_backtest, _reset_zone
from database import load_strategy_config
from Strategy import SMCStrategy
from market_structure import analyze_structure
from main import initialize_mt5
from datetime import datetime
import pandas as pd

SYMBOL = "XAUUSD."
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"

TOLERANCE_ATR = 0.3   # สอง swing สูง/ต่ำถือว่า "เท่ากัน" (liquidity pool) ถ้าห่างกันไม่เกิน N x ATR
LOOKBACK_BARS = 40    # ค้นหา swing ย้อนหลังกี่แท่งก่อนจุด break

_update_zone_baseline = backtest._update_zone


def _has_liquidity_sweep(window, atr, swing_type):
    """เช็คว่ามี equal-high/equal-low (double top/bottom) 2 จุดล่าสุดก่อนแท่งปัจจุบันไหม"""
    if not pd.notna(atr) or atr <= 0:
        return False
    sub = window.iloc[-LOOKBACK_BARS:] if len(window) > LOOKBACK_BARS else window
    st = analyze_structure(sub, swing_lookback=2)
    pts = [s for s in st["swings"] if s["type"] == swing_type]
    if len(pts) < 2:
        return False
    s1, s2 = pts[-2], pts[-1]
    return abs(s1["price"] - s2["price"]) <= atr * TOLERANCE_ATR


def _update_zone_sweep_filtered(df_zone, idx, zone, cfg):
    close_0 = df_zone['close'].iloc[idx]
    bar_time = df_zone['time'].iloc[idx]
    window = df_zone.iloc[:idx + 1]
    atr = df_zone['_atr'].iloc[idx]

    if not zone["is_broken"]:
        swing_low = SMCStrategy.find_recent_swing_low(window, 15)
        swing_high = SMCStrategy.find_recent_swing_high(window, 15)
        point = df_zone.attrs["point"]
        width = 100 * point
        mult = cfg.get("zone_atr_mult", 0.0)
        if mult and mult > 0 and pd.notna(atr) and atr > 0:
            width = atr * mult

        if swing_low > 0 and close_0 < swing_low:
            # SBR (sell) — ต้องเห็น double-top (equal highs) sweep มาก่อนถึงยอมรับว่า break จริง
            if _has_liquidity_sweep(window, atr, "high"):
                zone.update({"high_limit": swing_low + width, "low_limit": swing_low,
                              "zone_type": 0, "is_broken": True, "is_retested": False,
                              "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
        elif swing_high > 0 and close_0 > swing_high:
            # RBS (buy) — ต้องเห็น double-bottom (equal lows) sweep มาก่อน
            if _has_liquidity_sweep(window, atr, "low"):
                zone.update({"high_limit": swing_high, "low_limit": swing_high - width,
                              "zone_type": 1, "is_broken": True, "is_retested": False,
                              "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
    else:
        if zone["zone_type"] == 0 and close_0 > zone["high_limit"]:
            _reset_zone(zone)
        elif zone["zone_type"] == 1 and close_0 < zone["low_limit"]:
            _reset_zone(zone)

        if zone["is_broken"] and not zone["is_retested"] and not zone.get("from_cache"):
            if zone.get("broken_bar_idx", -1) >= 0:
                if idx - zone["broken_bar_idx"] >= cfg["zone_expiry_bars"]:
                    _reset_zone(zone)


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
        print(f"  {label:38s} | no trades"); return
    wins = sum(1 for x in rs if x > 0)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    print(f"  {label:38s} | trades={n:4d}  WR={wins/n*100:5.1f}%  "
          f"P&L={sum(rs):+7.1f}R  profit=${sum(pr):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R")


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(12)

    print(f"\n{'='*100}")
    print(f"Baseline SMC zone entry vs + Liquidity-Sweep (double-top/bottom) filter - {SYMBOL} "
          f"({months[0]} to {months[-1]})  [tick-mode]")
    print(f"{'='*100}")

    backtest._update_zone = _update_zone_baseline
    rs, pr = run(base, months)
    line("Baseline (no sweep filter)", rs, pr)

    backtest._update_zone = _update_zone_sweep_filtered
    rs, pr = run(base, months)
    line(f"+ Liquidity Sweep filter (tol={TOLERANCE_ATR}xATR)", rs, pr)
    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()

"""
ทดสอบรวม Liquidity Sweep filter (double-top/bottom) + Volume Spike filter เข้าด้วยกัน
เทียบกับ baseline และแต่ละตัวเดี่ยว ๆ — ทั้งสองตัวตอนทดสอบแยกกันปรับปรุงกำไร/expectancy
โดยไม่ลด trade count เลย จึงน่าจะได้ผลบวกซ้อนกันถ้ารวม
engine เดียวกันทุกอย่าง ต่างแค่เงื่อนไข accept ใน _update_zone — ไม่แก้ Strategy.py/backtest.py จริง
config จริงจาก DB · tick-mode 12 เดือน (fill จริง)
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

_update_zone_baseline = backtest._update_zone

TOLERANCE_ATR = 0.3
LOOKBACK_BARS = 40
VOL_LOOKBACK = 20
VOL_MULT = 1.3


def _has_liquidity_sweep(window, atr, swing_type):
    if not pd.notna(atr) or atr <= 0:
        return False
    sub = window.iloc[-LOOKBACK_BARS:] if len(window) > LOOKBACK_BARS else window
    st = analyze_structure(sub, swing_lookback=2)
    pts = [s for s in st["swings"] if s["type"] == swing_type]
    if len(pts) < 2:
        return False
    s1, s2 = pts[-2], pts[-1]
    return abs(s1["price"] - s2["price"]) <= atr * TOLERANCE_ATR


def _volume_ok(df_zone, idx):
    if 'tick_volume' not in df_zone.columns or idx < VOL_LOOKBACK:
        return True
    vol_now = df_zone['tick_volume'].iloc[idx]
    vol_avg = df_zone['tick_volume'].iloc[idx - VOL_LOOKBACK:idx].mean()
    return vol_avg > 0 and vol_now > vol_avg * VOL_MULT


def _make_update_zone(use_sweep, use_volume):
    def _update_zone_variant(df_zone, idx, zone, cfg):
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
                ok = True
                if use_sweep:
                    ok = ok and _has_liquidity_sweep(window, atr, "high")
                if use_volume:
                    ok = ok and _volume_ok(df_zone, idx)
                if ok:
                    zone.update({"high_limit": swing_low + width, "low_limit": swing_low,
                                  "zone_type": 0, "is_broken": True, "is_retested": False,
                                  "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
            elif swing_high > 0 and close_0 > swing_high:
                ok = True
                if use_sweep:
                    ok = ok and _has_liquidity_sweep(window, atr, "low")
                if use_volume:
                    ok = ok and _volume_ok(df_zone, idx)
                if ok:
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

    return _update_zone_variant


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
          f"P&L={sum(rs):+7.1f}R  profit=${sum(pr):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R")


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(12)

    print(f"\n{'='*100}")
    print(f"Combined filter test - {SYMBOL}  ({months[0]} to {months[-1]})  [tick-mode, 12 months]")
    print(f"{'='*100}")

    backtest._update_zone = _update_zone_baseline
    rs, pr = run(base, months)
    line("0. Baseline", rs, pr)

    backtest._update_zone = _make_update_zone(use_sweep=True, use_volume=False)
    rs, pr = run(base, months)
    line("1. Liquidity Sweep only", rs, pr)

    backtest._update_zone = _make_update_zone(use_sweep=False, use_volume=True)
    rs, pr = run(base, months)
    line("2. Volume Spike only", rs, pr)

    backtest._update_zone = _make_update_zone(use_sweep=True, use_volume=True)
    rs, pr = run(base, months)
    line("3. Sweep + Volume Spike combined", rs, pr)

    backtest._update_zone = _update_zone_baseline
    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()

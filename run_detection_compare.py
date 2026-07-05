"""
เทียบผลกระทบการแก้ v1.0.80: zone break detection close_1 (เก่า, ช้ากว่า live 1 แท่ง)
vs close_0 (ใหม่, ตรง live) — engine เดียวกันทุกอย่าง ต่างแค่บรรทัด detection
config จริงจาก DB · tick-mode 4 เดือน (fill จริง)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backtest
from backtest import run_backtest, _reset_zone
from database import load_strategy_config
from Strategy import SMCStrategy
from main import initialize_mt5
from datetime import datetime
import pandas as pd

SYMBOL = "XAUUSD."
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"

_update_zone_new = backtest._update_zone  # โค้ดปัจจุบัน (close_0)


def _update_zone_old(df_zone, idx, zone, cfg):
    """สำเนา _update_zone ก่อนแก้ — detection ใช้ close_1 (แท่งก่อนแท่งปิดล่าสุด)"""
    close_0 = df_zone['close'].iloc[idx]
    close_1 = df_zone['close'].iloc[idx - 1]
    bar_time = df_zone['time'].iloc[idx]
    window = df_zone.iloc[:idx + 1]

    if not zone["is_broken"]:
        swing_low = SMCStrategy.find_recent_swing_low(window, 15)
        swing_high = SMCStrategy.find_recent_swing_high(window, 15)
        point = df_zone.attrs["point"]
        width = 100 * point
        mult = cfg.get("zone_atr_mult", 0.0)
        if mult and mult > 0:
            atr = df_zone['_atr'].iloc[idx]
            if pd.notna(atr) and atr > 0:
                width = atr * mult

        if swing_low > 0 and close_1 < swing_low:
            zone.update({"high_limit": swing_low + width, "low_limit": swing_low,
                          "zone_type": 0, "is_broken": True, "is_retested": False,
                          "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
        elif swing_high > 0 and close_1 > swing_high:
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
        print(f"  {label:32s} | no trades"); return
    wins = sum(1 for x in rs if x > 0)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    print(f"  {label:32s} | trades={n:4d}  WR={wins/n*100:5.1f}%  "
          f"P&L={sum(rs):+7.1f}R  profit=${sum(pr):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R")


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(4)

    print(f"\n{'='*100}")
    print(f"Zone detection close_1 (old) vs close_0 (new/live) - {SYMBOL}  ({months[0]} to {months[-1]})  [tick-mode]")
    print(f"{'='*100}")

    backtest._update_zone = _update_zone_old
    rs, pr = run(base, months)
    line("OLD detection (close_1, lag 1 bar)", rs, pr)

    backtest._update_zone = _update_zone_new
    rs, pr = run(base, months)
    line("NEW detection (close_0 = live)", rs, pr)
    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()

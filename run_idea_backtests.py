"""
ไล่ backtest ไอเดียเพิ่ม edge ที่แนะนำไว้ (SMC + XAUUSD) ทีละตัว เทียบกับ baseline เดียวกัน
engine เดียวกันทุกอย่าง ต่างแค่จุดที่ monkeypatch — ไม่แก้ Strategy.py/backtest.py จริง
config จริงจาก DB · tick-mode 12 เดือน (fill จริง)

ไอเดียที่ทดสอบ:
  1. Killzone       — จำกัดเทรดเฉพาะ London Open (07-10 UTC) + NY Open (12-15 UTC) แทนเต็ม session
  2. CHoCH-only     — ยอมรับ zone break เฉพาะที่ "เปลี่ยนทิศทาง" จากโซนก่อนหน้า (skip continuation)
  3. HTF trend align — เปิด use_trend_filter=1 (HH/HL บน H1 ที่มีอยู่แล้วในระบบ แค่ default ปิดอยู่)
  4. Fib OTE zone   — แทนที่ zone band แบบ ATR แบน ด้วย retracement 61.8%-79% ของ impulse leg จริง
  5. Volume spike   — ยอมรับ zone break เฉพาะแท่งที่ tick_volume > ค่าเฉลี่ย 20 แท่งก่อนหน้า x1.3
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backtest
from backtest import run_backtest, _reset_zone
from database import load_strategy_config
from Strategy import SMCStrategy
from main import initialize_mt5
from filters import _hour_in_range
from datetime import datetime
import pandas as pd

SYMBOL = "XAUUSD."
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"

_update_zone_baseline = backtest._update_zone
_in_active_session_baseline = backtest.in_active_session

KILLZONES = {"LondonOpen": (7, 10), "NYOpen": (12, 15)}


def _in_active_session_killzone(now_utc, sessions_csv):
    hour = now_utc.hour
    return any(_hour_in_range(hour, *win) for win in KILLZONES.values())


def _make_choch_only_update_zone():
    state = {"last_type": -1}

    def _update_zone_choch(df_zone, idx, zone, cfg):
        close_0 = df_zone['close'].iloc[idx]
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

            if swing_low > 0 and close_0 < swing_low and state["last_type"] != 0:
                zone.update({"high_limit": swing_low + width, "low_limit": swing_low,
                              "zone_type": 0, "is_broken": True, "is_retested": False,
                              "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
                state["last_type"] = 0
            elif swing_high > 0 and close_0 > swing_high and state["last_type"] != 1:
                zone.update({"high_limit": swing_high, "low_limit": swing_high - width,
                              "zone_type": 1, "is_broken": True, "is_retested": False,
                              "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
                state["last_type"] = 1
        else:
            if zone["zone_type"] == 0 and close_0 > zone["high_limit"]:
                _reset_zone(zone)
            elif zone["zone_type"] == 1 and close_0 < zone["low_limit"]:
                _reset_zone(zone)

            if zone["is_broken"] and not zone["is_retested"] and not zone.get("from_cache"):
                if zone.get("broken_bar_idx", -1) >= 0:
                    if idx - zone["broken_bar_idx"] >= cfg["zone_expiry_bars"]:
                        _reset_zone(zone)

    return _update_zone_choch


def _update_zone_fib_ote(df_zone, idx, zone, cfg):
    """แทนที่ zone band แบบ ATR แบน ด้วยแถบ retracement 61.8%-79% ของ impulse leg (swing_high<->swing_low)"""
    close_0 = df_zone['close'].iloc[idx]
    bar_time = df_zone['time'].iloc[idx]
    window = df_zone.iloc[:idx + 1]

    if not zone["is_broken"]:
        swing_low = SMCStrategy.find_recent_swing_low(window, 15)
        swing_high = SMCStrategy.find_recent_swing_high(window, 15)

        if swing_low > 0 and close_0 < swing_low and swing_high > swing_low:
            leg = swing_high - swing_low
            ote_low = swing_low + leg * 0.618
            ote_high = swing_low + leg * 0.79
            zone.update({"high_limit": ote_high, "low_limit": ote_low,
                          "zone_type": 0, "is_broken": True, "is_retested": False,
                          "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
        elif swing_high > 0 and close_0 > swing_high and swing_high > swing_low:
            leg = swing_high - swing_low
            ote_high = swing_high - leg * 0.618
            ote_low = swing_high - leg * 0.79
            zone.update({"high_limit": ote_high, "low_limit": ote_low,
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


VOL_LOOKBACK = 20
VOL_MULT = 1.3


def _update_zone_volume_spike(df_zone, idx, zone, cfg):
    close_0 = df_zone['close'].iloc[idx]
    bar_time = df_zone['time'].iloc[idx]
    window = df_zone.iloc[:idx + 1]

    def _volume_ok():
        if 'tick_volume' not in df_zone.columns or idx < VOL_LOOKBACK:
            return True
        vol_now = df_zone['tick_volume'].iloc[idx]
        vol_avg = df_zone['tick_volume'].iloc[idx - VOL_LOOKBACK:idx].mean()
        return vol_avg > 0 and vol_now > vol_avg * VOL_MULT

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

        if swing_low > 0 and close_0 < swing_low and _volume_ok():
            zone.update({"high_limit": swing_low + width, "low_limit": swing_low,
                          "zone_type": 0, "is_broken": True, "is_retested": False,
                          "broken_time": bar_time, "broken_bar_idx": idx, "from_cache": False})
        elif swing_high > 0 and close_0 > swing_high and _volume_ok():
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
        print(f"  {label:34s} | no trades"); return
    wins = sum(1 for x in rs if x > 0)
    cum = peak = dd = 0
    for x in rs:
        cum += x; peak = max(peak, cum); dd = min(dd, cum - peak)
    print(f"  {label:34s} | trades={n:4d}  WR={wins/n*100:5.1f}%  "
          f"P&L={sum(rs):+7.1f}R  profit=${sum(pr):+8.2f}  exp={sum(rs)/n:+.3f}R  maxDD={dd:6.1f}R")


def reset_patches():
    backtest._update_zone = _update_zone_baseline
    backtest.in_active_session = _in_active_session_baseline


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(12)

    print(f"\n{'='*100}")
    print(f"Idea backtests - {SYMBOL}  ({months[0]} to {months[-1]})  [tick-mode, 12 months]")
    print(f"{'='*100}")

    reset_patches()
    rs, pr = run(base, months)
    line("0. Baseline (config จริงปัจจุบัน)", rs, pr)

    reset_patches()
    backtest.in_active_session = _in_active_session_killzone
    rs, pr = run(base, months)
    line("1. Killzone (London/NY Open only)", rs, pr)

    reset_patches()
    backtest._update_zone = _make_choch_only_update_zone()
    rs, pr = run(base, months)
    line("2. CHoCH-only (skip continuation BOS)", rs, pr)

    reset_patches()
    cfg3 = dict(base); cfg3["use_trend_filter"] = 1
    rs, pr = run(cfg3, months)
    line("3. HTF trend align (use_trend_filter=1)", rs, pr)

    reset_patches()
    backtest._update_zone = _update_zone_fib_ote
    rs, pr = run(base, months)
    line("4. Fib OTE zone (61.8%-79% retracement)", rs, pr)

    reset_patches()
    backtest._update_zone = _update_zone_volume_spike
    rs, pr = run(base, months)
    line(f"5. Volume spike (>{VOL_MULT}x avg{VOL_LOOKBACK})", rs, pr)

    reset_patches()
    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()

"""
Backtest ไอเดีย entry ใหม่จากงานวิจัยต่างประเทศ (ICT/SMC) เทียบกับ baseline (zone + OB/FVG ปัจจุบัน)
engine เดิม (run_backtest) ใช้กับ #1-#3 ผ่าน monkeypatch analyze_structure (ไม่แก้ backtest.py/Strategy.py จริง)
#4 Turtle Soup เป็น engine แยกทั้งหมด (สร้างใหม่ ไม่ผูกกับ zone logic เดิม) ใช้ _simulate_managed_trade
เดียวกันเพื่อให้ fill/cost สมจริงเท่ากัน

ไอเดียที่ทดสอบ:
  1. + Breaker Block  — เพิ่ม breaker_blocks (OB ที่พลิกขั้ว) เข้าไปในพูล OB entry เดิม
  2. + FVG entry เปิด (full range) — enable_fvg_entry=1 (default ปิดอยู่) วัดผลเดี่ยว ๆ
  3. + FVG entry เปิด (50% midpoint only) — จำกัด trigger/SL ให้แคบเหลือแค่กลางช่องว่าง (Consequent Encroachment)
  4. Turtle Soup (standalone) — sweep Asian high/low + MSS + reversal entry (ICT stop-hunt reversal)
     ** simplification: เข้าตลาดทันทีที่ MSS ยืนยัน ไม่รอ retest เข้า FVG/OB ตามตำรา (เพื่อจำกัด scope) **
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backtest
from backtest import run_backtest, _get_candles_range, _simulate_managed_trade, tf_seconds, tf_to_const
from market_structure import analyze_structure
from filters import in_active_session, in_news_window, symbol_currencies
from database import load_strategy_config
from main import initialize_mt5
import MetaTrader5 as mt5
from datetime import datetime, timezone
import pandas as pd

SYMBOL = "XAUUSD."
TP = r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"

_analyze_structure_orig = analyze_structure


def month_keys(n):
    now = datetime.now(); out = []
    for back in range(n - 1, -1, -1):
        y, m = now.year, now.month - back
        while m <= 0: m += 12; y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


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


# ── #1: Breaker Block merged into OB pool ──────────────────────────────────
def _analyze_with_breaker(df, swing_lookback=2):
    st = _analyze_structure_orig(df, swing_lookback=swing_lookback)
    st["order_blocks"] = list(st["order_blocks"]) + list(st["breaker_blocks"])
    return st


# ── #3: FVG shrunk to 50% midpoint band ────────────────────────────────────
def _analyze_with_fvg_midpoint(df, swing_lookback=2):
    st = _analyze_structure_orig(df, swing_lookback=swing_lookback)
    band_pct = 0.1  # เหลือแค่ 10% ตรงกลางช่องว่างเป็นแถบ trigger/SL
    for fvg in st["fvgs"]:
        top, bot = fvg["top"], fvg["bottom"]
        mid = (top + bot) / 2.0
        half = (top - bot) * band_pct / 2.0
        fvg["top"] = mid + half
        fvg["bottom"] = mid - half
    return st


def run_via_backtest(cfg, months):
    rs, pr = [], []
    for mo in months:
        r = run_backtest(SYMBOL, month=mo, config=cfg, use_real_ticks=True)
        if r:
            for t in r.get("trades", []):
                rs.append(t.get("r", 0)); pr.append(t.get("profit", 0))
    return rs, pr


# ── #4: Turtle Soup standalone engine ──────────────────────────────────────
ASIAN_START, ASIAN_END = 23, 8   # UTC, ข้ามเที่ยงคืน
MSS_MAX_BARS = 12                # ยกเลิก setup ถ้าไม่เกิด MSS ภายในกี่แท่ง
WICK_DOMINANCE = 0.5             # wick ฝั่ง sweep ต้องเป็นสัดส่วนอย่างน้อยเท่านี้ของ range แท่ง


def run_turtle_soup(symbol, cfg, month, point, symbol_info, broker_offset_hours=None):
    year, mon = (int(p) for p in month.split("-"))
    month_start = pd.Timestamp(year=year, month=mon, day=1)
    month_end = month_start + pd.DateOffset(months=1)
    date_from = (month_start - pd.Timedelta(days=3)).to_pydatetime()
    date_to = month_end.to_pydatetime()

    zone_tf_label = cfg["zone_timeframe"]
    df = _get_candles_range(symbol, tf_to_const(zone_tf_label), date_from, date_to)
    if df is None or len(df) < 100:
        return [], []

    df_m15 = _get_candles_range(symbol, mt5.TIMEFRAME_M15, date_from, date_to)
    swings = analyze_structure(df_m15)["swings"] if df_m15 is not None and len(df_m15) >= 10 else []

    tick_size = symbol_info.trade_tick_size or point
    value_per_point = symbol_info.trade_tick_value * (point / tick_size) if tick_size else 0.0
    pip_size = point
    spread_points = cfg.get("spread_points", 0)
    commission_per_lot = cfg.get("commission_per_lot", 0.0)

    balance = float(cfg.get("start_balance", 10000))
    running_balance = balance
    risk_pct = cfg["risk_percent"] / 100.0

    hours = df['time'].dt.hour.values
    highs, lows, closes, opens, times = df['high'].values, df['low'].values, df['close'].values, df['open'].values, df['time']

    asian_high = asian_low = None
    cur_day = None
    pending = None
    in_position_until = None
    daily_count = {}
    rs, pr = [], []

    for i in range(2, len(df)):
        now = times.iloc[i]
        day_key = now.date().isoformat()
        # อัปเดต asian range แบบ rolling: รวมแท่งที่ hour อยู่ใน [23,24) หรือ [0,8) UTC
        h = hours[i - 1]
        in_asian_hours = (h >= ASIAN_START) or (h < ASIAN_END)
        if in_asian_hours:
            if asian_high is None or h == ASIAN_START:
                asian_high, asian_low = highs[i - 1], lows[i - 1]
            else:
                asian_high = max(asian_high, highs[i - 1])
                asian_low = min(asian_low, lows[i - 1])

        if in_position_until is not None and now < in_position_until:
            continue
        in_position_until = None

        if asian_high is None or in_asian_hours:
            continue  # เทรดเฉพาะช่วงหลัง Asian ปิด (London/NY)

        now_utc_dt = now.to_pydatetime().replace(tzinfo=timezone.utc)
        if not in_active_session(now_utc_dt, cfg.get("trade_sessions", "")):
            continue
        if in_news_window(now_utc_dt, cfg.get("news_filter_minutes", 0), symbol_currencies(symbol)):
            continue
        if daily_count.get(day_key, 0) >= cfg["max_trades_per_day"]:
            continue

        row1_high, row1_low, row1_close, row1_open = highs[i - 1], lows[i - 1], closes[i - 1], opens[i - 1]
        rng = row1_high - row1_low

        # ── ตรวจ MSS ของ pending setup ก่อน ──
        if pending is not None:
            pending["bars_left"] -= 1
            if pending["dir"] == "sell" and row1_close < pending["mss_level"]:
                entry_price = df['open'].iloc[i]
                sl_price = pending["spike_extreme"] + 0.15 * (rng if rng > 0 else point * 100)
                sl_dist = sl_price - entry_price
                if sl_dist > 0:
                    tp_price = entry_price - sl_dist * cfg["tp_ratio_rr"]
                    pos = {"type": "SELL", "sl": sl_price, "tp": tp_price, "entry_price": entry_price, "entry_time": now}
                    risk_amount = running_balance * risk_pct
                    sim = _simulate_managed_trade(symbol, pos, cfg, swings, value_per_point, point, pip_size,
                                                   risk_amount, spread_points, commission_per_lot)
                    if sim is not None:
                        rs.append(sim["r"]); pr.append(sim["profit"])
                        running_balance = max(running_balance + sim["profit"], 0.01)
                        daily_count[day_key] = daily_count.get(day_key, 0) + 1
                        in_position_until = sim["exit_time"]
                pending = None
            elif pending["dir"] == "buy" and row1_close > pending["mss_level"]:
                entry_price = df['open'].iloc[i]
                sl_price = pending["spike_extreme"] - 0.15 * (rng if rng > 0 else point * 100)
                sl_dist = entry_price - sl_price
                if sl_dist > 0:
                    tp_price = entry_price + sl_dist * cfg["tp_ratio_rr"]
                    pos = {"type": "BUY", "sl": sl_price, "tp": tp_price, "entry_price": entry_price, "entry_time": now}
                    risk_amount = running_balance * risk_pct
                    sim = _simulate_managed_trade(symbol, pos, cfg, swings, value_per_point, point, pip_size,
                                                   risk_amount, spread_points, commission_per_lot)
                    if sim is not None:
                        rs.append(sim["r"]); pr.append(sim["profit"])
                        running_balance = max(running_balance + sim["profit"], 0.01)
                        daily_count[day_key] = daily_count.get(day_key, 0) + 1
                        in_position_until = sim["exit_time"]
                pending = None
            elif pending["bars_left"] <= 0:
                pending = None
            continue

        # ── ตรวจหา spike ใหม่ (sweep Asian high/low ด้วย wick เด่นชัด) ──
        if rng <= 0:
            continue
        if row1_high > asian_high and row1_close < asian_high:
            upper_wick = row1_high - max(row1_open, row1_close)
            if upper_wick / rng >= WICK_DOMINANCE:
                pending = {"dir": "sell", "spike_extreme": row1_high, "mss_level": row1_low, "bars_left": MSS_MAX_BARS}
                continue
        if row1_low < asian_low and row1_close > asian_low:
            lower_wick = min(row1_open, row1_close) - row1_low
            if lower_wick / rng >= WICK_DOMINANCE:
                pending = {"dir": "buy", "spike_extreme": row1_low, "mss_level": row1_high, "bars_left": MSS_MAX_BARS}

    return rs, pr


RETEST_MAX_BARS = 15  # หมดอายุถ้าไม่ retest เข้า FVG/OB ภายในกี่แท่งหลัง MSS


def _find_retest_zone(df, spike_idx, mss_idx, direction, swing_lookback=2):
    """หา FVG/OB ที่เกิดจากแรง impulse ของ MSS (start_time หลัง spike) ตามตำรา ICT
    เอาตัวใหม่สุด (start_time มากสุด) — คืน dict {top, bottom} หรือ None ถ้าไม่มี displacement/FVG เกิดขึ้น"""
    lo = max(0, spike_idx - 10)
    window = df.iloc[lo:mss_idx + 1].reset_index(drop=True)
    if len(window) < swing_lookback * 2 + 2:
        return None
    st = analyze_structure(window, swing_lookback=swing_lookback)
    spike_time = int(df['time'].iloc[spike_idx].value // 10**9)
    want_dir = "bearish" if direction == "sell" else "bullish"
    cands = [z for z in st["order_blocks"] if z["direction"] == want_dir and not z["mitigated"] and z["start_time"] >= spike_time]
    cands += [z for z in st["fvgs"] if z["direction"] == want_dir and not z["mitigated"] and z["start_time"] >= spike_time]
    if not cands:
        return None
    z = max(cands, key=lambda z: z["start_time"])
    return {"top": z["top"], "bottom": z["bottom"]}


def run_turtle_soup_full(symbol, cfg, month, point, symbol_info):
    """Turtle Soup เต็มรูปแบบตามตำรา ICT: sweep -> MSS -> รอ retest เข้า FVG/OB ที่เพิ่งเกิด ค่อยเข้า
    (ต่างจาก run_turtle_soup ที่เข้าตลาดทันทีตอน MSS ยืนยัน)"""
    year, mon = (int(p) for p in month.split("-"))
    month_start = pd.Timestamp(year=year, month=mon, day=1)
    month_end = month_start + pd.DateOffset(months=1)
    date_from = (month_start - pd.Timedelta(days=3)).to_pydatetime()
    date_to = month_end.to_pydatetime()

    zone_tf_label = cfg["zone_timeframe"]
    df = _get_candles_range(symbol, tf_to_const(zone_tf_label), date_from, date_to)
    if df is None or len(df) < 100:
        return [], []

    df_m15 = _get_candles_range(symbol, mt5.TIMEFRAME_M15, date_from, date_to)
    swings = analyze_structure(df_m15)["swings"] if df_m15 is not None and len(df_m15) >= 10 else []

    tick_size = symbol_info.trade_tick_size or point
    value_per_point = symbol_info.trade_tick_value * (point / tick_size) if tick_size else 0.0
    pip_size = point
    spread_points = cfg.get("spread_points", 0)
    commission_per_lot = cfg.get("commission_per_lot", 0.0)

    balance = float(cfg.get("start_balance", 10000))
    running_balance = balance
    risk_pct = cfg["risk_percent"] / 100.0

    hours = df['time'].dt.hour.values
    highs, lows, closes, opens, times = df['high'].values, df['low'].values, df['close'].values, df['open'].values, df['time']

    asian_high = asian_low = None
    pending = None       # รอ MSS
    retest = None        # MSS ยืนยันแล้ว รอ retest เข้า FVG/OB
    in_position_until = None
    daily_count = {}
    rs, pr = [], []

    for i in range(2, len(df)):
        now = times.iloc[i]
        day_key = now.date().isoformat()
        h = hours[i - 1]
        in_asian_hours = (h >= ASIAN_START) or (h < ASIAN_END)
        if in_asian_hours:
            if asian_high is None or h == ASIAN_START:
                asian_high, asian_low = highs[i - 1], lows[i - 1]
            else:
                asian_high = max(asian_high, highs[i - 1])
                asian_low = min(asian_low, lows[i - 1])

        if in_position_until is not None and now < in_position_until:
            continue
        in_position_until = None

        if asian_high is None or in_asian_hours:
            continue

        now_utc_dt = now.to_pydatetime().replace(tzinfo=timezone.utc)
        if not in_active_session(now_utc_dt, cfg.get("trade_sessions", "")):
            continue
        if in_news_window(now_utc_dt, cfg.get("news_filter_minutes", 0), symbol_currencies(symbol)):
            continue
        if daily_count.get(day_key, 0) >= cfg["max_trades_per_day"]:
            continue

        row1_high, row1_low, row1_close, row1_open = highs[i - 1], lows[i - 1], closes[i - 1], opens[i - 1]
        rng = row1_high - row1_low

        # ── retest: รอราคาย่อกลับเข้า FVG/OB ที่เกิดจาก MSS ──
        if retest is not None:
            retest["bars_left"] -= 1
            touched = row1_high >= retest["bottom"] and row1_low <= retest["top"]
            if touched:
                entry_price = df['open'].iloc[i]
                if retest["dir"] == "sell":
                    sl_price = retest["spike_extreme"] + 0.15 * (rng if rng > 0 else point * 100)
                    sl_dist = sl_price - entry_price
                    side = "SELL"
                else:
                    sl_price = retest["spike_extreme"] - 0.15 * (rng if rng > 0 else point * 100)
                    sl_dist = entry_price - sl_price
                    side = "BUY"
                if sl_dist > 0:
                    tp_price = (entry_price - sl_dist * cfg["tp_ratio_rr"]) if side == "SELL" else (entry_price + sl_dist * cfg["tp_ratio_rr"])
                    pos = {"type": side, "sl": sl_price, "tp": tp_price, "entry_price": entry_price, "entry_time": now}
                    risk_amount = running_balance * risk_pct
                    sim = _simulate_managed_trade(symbol, pos, cfg, swings, value_per_point, point, pip_size,
                                                   risk_amount, spread_points, commission_per_lot)
                    if sim is not None:
                        rs.append(sim["r"]); pr.append(sim["profit"])
                        running_balance = max(running_balance + sim["profit"], 0.01)
                        daily_count[day_key] = daily_count.get(day_key, 0) + 1
                        in_position_until = sim["exit_time"]
                retest = None
            elif retest["bars_left"] <= 0:
                retest = None
            continue

        # ── ตรวจ MSS ของ pending setup ──
        if pending is not None:
            pending["bars_left"] -= 1
            mss_hit = ((pending["dir"] == "sell" and row1_close < pending["mss_level"]) or
                       (pending["dir"] == "buy" and row1_close > pending["mss_level"]))
            if mss_hit:
                zone = _find_retest_zone(df, pending["spike_idx"], i - 1, pending["dir"])
                if zone is not None:
                    retest = {"dir": pending["dir"], "top": zone["top"], "bottom": zone["bottom"],
                              "spike_extreme": pending["spike_extreme"], "bars_left": RETEST_MAX_BARS}
                # ไม่มี displacement/FVG เกิดขึ้น -> ทิ้ง setup ตามกฎ ICT ("skip if no FVG formed post-sweep")
                pending = None
            elif pending["bars_left"] <= 0:
                pending = None
            continue

        # ── ตรวจหา spike ใหม่ ──
        if rng <= 0:
            continue
        if row1_high > asian_high and row1_close < asian_high:
            upper_wick = row1_high - max(row1_open, row1_close)
            if upper_wick / rng >= WICK_DOMINANCE:
                pending = {"dir": "sell", "spike_extreme": row1_high, "mss_level": row1_low,
                           "spike_idx": i - 1, "bars_left": MSS_MAX_BARS}
                continue
        if row1_low < asian_low and row1_close > asian_low:
            lower_wick = min(row1_open, row1_close) - row1_low
            if lower_wick / rng >= WICK_DOMINANCE:
                pending = {"dir": "buy", "spike_extreme": row1_low, "mss_level": row1_high,
                           "spike_idx": i - 1, "bars_left": MSS_MAX_BARS}

    return rs, pr


def run_turtle_soup_full_months(cfg, months):
    symbol_info = mt5.symbol_info(SYMBOL)
    point = symbol_info.point
    rs_all, pr_all = [], []
    for mo in months:
        rs, pr = run_turtle_soup_full(SYMBOL, cfg, mo, point, symbol_info)
        rs_all += rs; pr_all += pr
    return rs_all, pr_all


def run_turtle_soup_months(cfg, months):
    symbol_info = mt5.symbol_info(SYMBOL)
    point = symbol_info.point
    rs_all, pr_all = [], []
    for mo in months:
        rs, pr = run_turtle_soup(SYMBOL, cfg, mo, point, symbol_info)
        rs_all += rs; pr_all += pr
    return rs_all, pr_all


def main():
    if not initialize_mt5(terminal_path=TP):
        print("MT5 init failed"); return
    base = load_strategy_config(SYMBOL) or {}
    base["start_balance"] = 10000
    months = month_keys(12)

    print(f"\n{'='*100}")
    print(f"New entry ideas (ICT/SMC research) - {SYMBOL}  ({months[0]} to {months[-1]})  [tick-mode, 12 months]")
    print(f"{'='*100}")

    backtest.analyze_structure = _analyze_structure_orig
    rs, pr = run_via_backtest(base, months)
    line("0. Baseline", rs, pr)

    backtest.analyze_structure = _analyze_with_breaker
    rs, pr = run_via_backtest(base, months)
    line("1. + Breaker Block (merged into OB)", rs, pr)
    backtest.analyze_structure = _analyze_structure_orig

    cfg2 = dict(base); cfg2["enable_fvg_entry"] = 1
    rs, pr = run_via_backtest(cfg2, months)
    line("2. + FVG entry ON (full range)", rs, pr)

    backtest.analyze_structure = _analyze_with_fvg_midpoint
    rs, pr = run_via_backtest(cfg2, months)
    line("3. + FVG entry ON (50% midpoint only)", rs, pr)
    backtest.analyze_structure = _analyze_structure_orig

    rs, pr = run_turtle_soup_months(base, months)
    line("4. Turtle Soup - simplified (immediate entry)", rs, pr)

    rs, pr = run_turtle_soup_full_months(base, months)
    line("5. Turtle Soup - full (wait FVG/OB retest)", rs, pr)

    print(f"{'='*100}\n")


if __name__ == "__main__":
    main()

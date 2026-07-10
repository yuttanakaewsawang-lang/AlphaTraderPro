"""
เทียบ "เล่นเฉพาะมีเทรน" 3 แบบ — tick-mode พ.ค.+มิ.ย. 2026, config live จริง ณ 2026-07-09
(M1/M1, risk 1%, guard ON, retest ON, RR 2.5, trailing ON — ชุดเดียวกับ run_risk1_200.py)

  A: baseline — trend filter OFF (config จริงปัจจุบัน)
  B: A + use_trend_filter=1 (HH/HL บน TF คู่ M5 ตามที่เพิ่งแก้) — gate จริงใน engine
  C: post-hoc Market Context gate บนไม้ของ A — จำลอง "SW งดเล่น" หลายเงื่อนไข
     (approximation: ตัดไม้ออกจากผล A ตรงๆ ไม่ได้ re-run engine — ไม้ที่ถูกตัดจะไม่ปลด
      in_position/zone ให้ไม้ใหม่แบบ gate จริง แต่ตอบคำถามหลักได้: loss กระจุกใน SW ไหม)

Market Context ที่ใช้ = ตัวเดียวกับ Dashboard (compute_market_context) คำนวณ ณ เวลาเข้าไม้:
  ctx1 = บน M1 (TF ที่เล่น), ctx5 = บน M5 (TF คู่ใหม่) — slice ให้แท่งสุดท้ายคือแท่ง forming
  ณ จังหวะเข้า เหมือนที่ live เห็นเป๊ะ (ฟังก์ชันตัดแท่งสุดท้ายทิ้งเองทุกปัจจัย)

technical notes เดิม: แยก zone cache ต่อ variant | เวลา trade ถูก shift เป็นไทย (7-offset ชม.)
ต้องลบกลับเป็นเวลา server ก่อน map แท่ง
"""
import sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta
import pandas as pd

from database import load_settings
import backtest
from backtest import run_backtest, _get_candles_range
from main import initialize_mt5, tf_to_const
from market_structure import compute_market_context

SYMBOL = "XAUUSD."
MONTHS = ["2026-05", "2026-06"]

LIVE_NOW = {
    "zone_timeframe": "M1", "entry_timeframe": "M1",
    "tp_ratio_rr": 2.5, "use_trend_filter": 0, "trend_filter_mode": 1,
    "zone_expiry_bars": 50, "max_trades_per_day": 10, "risk_percent": 1.0,
    "zone_atr_mult": 0.3, "min_candle_atr": 0.3, "max_candle_atr": 2.5,
    "buffer_atr": 0.15, "sl_offset_atr": 0.0, "be_offset_atr": 0.0,
    "enable_ob_entry": 1, "enable_fvg_entry": 0,
    "spread_points": 11.0, "commission_per_lot": 0.0,
    "use_partial_tp": 1, "partial_tp_trigger_pct": 50.0, "partial_tp_close_pct": 50.0,
    "trail_trigger_pct": 50.0, "trail_mode": 1, "trail_candle_offset_pips": 30.0,
    "use_breakeven": 1, "be_trigger_pct": 40.0, "be_offset_pips": 20.0,
    "enable_trailing": 1, "sl_offset_pips": 20.0,
    "trade_sessions": "", "news_filter_minutes": 30,
    "require_engulfing": 0, "require_retest": 1, "use_swing_sl": 1,
    "entry_mode": 1, "max_entry_zone_atr": 0.3,
    "min_sl_atr": 0.5, "max_ob_zone_atr": 5.0,
    "enable_liquidity_sweep": 1, "sweep_tolerance_atr": 0.3, "sweep_lookback_bars": 40,
}

VARIANTS = [
    ("A: baseline (trend OFF)",       {}),
    ("B: trend filter ON (HH/HL@M5)", {"use_trend_filter": 1}),
]


def fetch_range_chunked(symbol, tf_const, date_from, date_to, chunk_days=30):
    """copy_rates_range ยาวเกิน (M1 ~75 วัน = ~77k แท่ง) คืน None — ดึงเป็นก้อน ~30 วันแล้วต่อกัน"""
    dfs = []
    cur = date_from
    while cur < date_to:
        nxt = min(cur + timedelta(days=chunk_days), date_to)
        d = _get_candles_range(symbol, tf_const, cur, nxt)
        if d is not None:
            dfs.append(d)
        cur = nxt
    if not dfs:
        return None
    return (pd.concat(dfs).drop_duplicates(subset="time")
            .sort_values("time").reset_index(drop=True))


def subset_stats(trades):
    """n / win% / sumR / expectancy / maxDD(R) ของชุดไม้ (เรียงตามเวลา, win = r > 0)"""
    ts = sorted(trades, key=lambda t: t["time"])
    n = len(ts)
    if n == 0:
        return {"n": 0, "wr": 0.0, "sum_r": 0.0, "exp_r": 0.0, "dd_r": 0.0}
    wins = sum(1 for t in ts if t["r"] > 0)
    cum = peak = 0.0
    dd = 0.0
    for t in ts:
        cum += t["r"]
        peak = max(peak, cum)
        dd = max(dd, peak - cum)
    return {"n": n, "wr": wins / n * 100.0, "sum_r": cum,
            "exp_r": cum / n, "dd_r": dd}


def fmt(name, s):
    return (f"  {name:<44} {s['n']:>5} {s['wr']:>6.1f}% {s['sum_r']:>+9.2f} "
            f"{s['exp_r']:>+7.3f} {s['dd_r']:>8.2f}")


def main():
    settings = load_settings()
    terminal_path = settings.get("terminal_path") or r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"
    if not initialize_mt5(login=settings.get("login"), password=settings.get("password"),
                          server=settings.get("server"), terminal_path=terminal_path):
        print("MT5 initialize failed"); sys.exit(1)

    from main import broker_utc_offset_hours
    offset = broker_utc_offset_hours(SYMBOL)
    print(f"broker offset = {offset}", flush=True)

    # ── ส่วนที่ 1: รัน engine จริง A vs B ─────────────────────────────────────
    results = {}
    base_cache = tempfile.mkdtemp(prefix="apollo_trend_cache_")
    for name, over in VARIANTS:
        backtest._ZONE_CACHE_DIR = os.path.join(base_cache, name[:1])
        all_trades = []
        for month in MONTHS:
            cfg = dict(LIVE_NOW); cfg.update(over)
            print(f"[{month}] {name} ...", end=" ", flush=True)
            r = run_backtest(symbol=SYMBOL, month=month, config=cfg,
                             use_real_ticks=True, broker_offset_hours=offset)
            results[(month, name)] = r
            if r.get("success"):
                print(f"OK trades={r['total_trades']} wr={r['win_rate']:.1f}% "
                      f"R={r['total_r']:+.1f} maxDD={r['max_drawdown_pct']:.1f}%", flush=True)
                all_trades.extend(r.get("trades", []))
            else:
                print("ERROR:", r.get("error"), flush=True)
        results[("ALL", name)] = all_trades

    # ── ส่วนที่ 2: Market Context ณ เวลาเข้าไม้ของทุกไม้ variant A ────────────
    a_trades = results[("ALL", VARIANTS[0][0])]
    date_from = datetime(2026, 4, 20)
    date_to = datetime(2026, 7, 3)
    df_m1 = fetch_range_chunked(SYMBOL, tf_to_const("M1"), date_from, date_to)
    df_m5 = fetch_range_chunked(SYMBOL, tf_to_const("M5"), date_from, date_to)
    if df_m1 is None or df_m5 is None:
        print("candle fetch for context failed"); sys.exit(1)
    s_m1 = pd.Series(df_m1['time'].values)
    s_m5 = pd.Series(df_m5['time'].values)

    shift_back = timedelta(hours=7 - offset)   # เวลา trade เป็นไทย → server
    n_none = 0
    for t in a_trades:
        server_ts = pd.Timestamp(datetime.fromisoformat(t["time"]) - shift_back)
        for tf_key, df, tv in (("ctx1", df_m1, s_m1), ("ctx5", df_m5, s_m5)):
            j = int(tv.searchsorted(server_ts, side="right")) - 1
            if j < 130:
                t[tf_key] = None; n_none += 1
            else:
                t[tf_key] = compute_market_context(df.iloc[j - 119: j + 1])
    print(f"context computed for {len(a_trades)} trades (missing window: {n_none})", flush=True)

    def _dir(t, key):
        c = t.get(key)
        return c["direction"] if c else "N/A"

    def _aligned(t, key):
        d = _dir(t, key)
        return (d == "BULLISH" and t["type"] == "BUY") or (d == "BEARISH" and t["type"] == "SELL")

    GATES = [
        ("C1: ตัด SW บน M1 (TF ที่เล่น)",            lambda t: _dir(t, "ctx1") != "SIDEWAYS"),
        ("C2: ตัด SW บน M5 (TF คู่)",                lambda t: _dir(t, "ctx5") != "SIDEWAYS"),
        ("C3: ต้อง align ทิศกับ ctx M1",             lambda t: _aligned(t, "ctx1")),
        ("C4: ต้อง align ทิศกับ ctx M5",             lambda t: _aligned(t, "ctx5")),
        ("C5: align M5 + conf>=70",                  lambda t: _aligned(t, "ctx5") and (t["ctx5"] or {}).get("confidence", 0) >= 70),
    ]

    # ── รายงาน ────────────────────────────────────────────────────────────────
    W = 96
    print("\n" + "=" * W)
    print("  engine จริง (tick-mode รวม 2 เดือน):")
    print(f"  {'Variant':<44} {'ไม้':>5} {'Win%':>7} {'TotalR':>9} {'ExpR':>7} {'maxDD_R':>8}")
    print("-" * W)
    for name, _ in VARIANTS:
        print(fmt(name, subset_stats(results[("ALL", name)])))
    print("-" * W)
    print("  post-hoc gate บนไม้ของ A (จำลองตัดไม้ ไม่ได้ re-run engine):")
    for gname, gfn in GATES:
        print(fmt(gname, subset_stats([t for t in a_trades if gfn(t)])))
    print("-" * W)
    print("  breakdown ไม้ของ A แยกตาม Market Context ณ ตอนเข้า (ctx บน M5 TF คู่):")
    for d in ("BULLISH", "BEARISH", "SIDEWAYS", "N/A"):
        for side in ("BUY", "SELL"):
            sub = [t for t in a_trades if _dir(t, "ctx5") == d and t["type"] == side]
            if sub:
                print(fmt(f"   M5 {d:<9} + {side}", subset_stats(sub)))
    print("-" * W)
    print("  breakdown เดียวกันบน M1 (TF ที่เล่น):")
    for d in ("BULLISH", "BEARISH", "SIDEWAYS", "N/A"):
        for side in ("BUY", "SELL"):
            sub = [t for t in a_trades if _dir(t, "ctx1") == d and t["type"] == side]
            if sub:
                print(fmt(f"   M1 {d:<9} + {side}", subset_stats(sub)))
    print("-" * W)
    print("  รายเดือน (engine):")
    for month in MONTHS:
        for name, _ in VARIANTS:
            r = results[(month, name)]
            if r.get("success"):
                print(f"  {month}  {name:<40} ไม้ {r['total_trades']:>4}  Win {r['win_rate']:>5.1f}%  "
                      f"R {r['total_r']:>+8.2f}  DD {r['max_drawdown_pct']:>5.1f}%")
    print("=" * W)


if __name__ == "__main__":
    main()

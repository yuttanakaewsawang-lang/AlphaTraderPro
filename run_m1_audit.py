"""
ตรวจจุดเข้า M1 (config จริงจาก production DB ณ 2026-07-09) — tick-mode เทียบ:
  A: LIVE M1 ตามจริง (retest=0, guard=0, trend=0, trailing=1, RR=2.0, risk=3%)
  B: A + ปิด trailing
  C: A + เปิด Zone Entry Guard (entry_mode=1)
  D: A + เปิด require_retest
  E: A + ปิด trailing + guard + retest (ชุดแนะนำ)
  F: M5/M5 recommended baseline (risk 3% ให้เทียบ $ ได้)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import load_settings
from backtest import run_backtest
from main import initialize_mt5

SYMBOL = "XAUUSD."
MONTHS = ["2026-05", "2026-06"]

# config จริงจาก %APPDATA%\ApolloAutoTrade\trading_data.db (instance หลัก IUX, 2026-07-09)
LIVE_M1 = {
    "zone_timeframe": "M1", "entry_timeframe": "M1",
    "tp_ratio_rr": 2.0, "use_trend_filter": 0, "trend_filter_mode": 1,
    "zone_expiry_bars": 50, "max_trades_per_day": 10, "risk_percent": 3.0,
    "zone_atr_mult": 0.3, "min_candle_atr": 0.3, "max_candle_atr": 2.5,
    "buffer_atr": 0.15, "enable_ob_entry": 1, "enable_fvg_entry": 0,
    "spread_points": 11.0, "commission_per_lot": 0.0,
    "use_partial_tp": 1, "partial_tp_trigger_pct": 40.0, "partial_tp_close_pct": 50.0,
    "trail_trigger_pct": 50.0, "trail_mode": 1, "trail_candle_offset_pips": 30.0,
    "use_breakeven": 1, "be_trigger_pct": 40.0, "be_offset_pips": 20.0,
    "enable_trailing": 1, "sl_offset_pips": 20.0,
    "trade_sessions": "", "news_filter_minutes": 30,
    "require_engulfing": 0, "require_retest": 0, "use_swing_sl": 1,
    "entry_mode": 0, "max_entry_zone_atr": 0.3,
    "min_sl_atr": 0.5, "max_ob_zone_atr": 5.0,
    "enable_liquidity_sweep": 1, "sweep_tolerance_atr": 0.3, "sweep_lookback_bars": 40,
}

VARIANTS = [
    ("A: LIVE M1 ตามจริง",        {}),
    ("B: A + trailing OFF",        {"enable_trailing": 0}),
    ("C: A + Zone Guard ON",       {"entry_mode": 1}),
    ("D: A + Retest ON",           {"require_retest": 1}),
    ("E: A + B+C+D รวม",           {"enable_trailing": 0, "entry_mode": 1, "require_retest": 1}),
    ("F: M5 baseline (risk3%)",    {"zone_timeframe": "M5", "entry_timeframe": "M5",
                                    "tp_ratio_rr": 3.5, "enable_trailing": 0,
                                    "entry_mode": 1, "require_retest": 1}),
]


def main():
    settings = load_settings()
    terminal_path = settings.get("terminal_path") or r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"
    if not initialize_mt5(login=settings.get("login"), password=settings.get("password"),
                          server=settings.get("server"), terminal_path=terminal_path):
        print("MT5 initialize failed"); sys.exit(1)

    from main import broker_utc_offset_hours
    offset = broker_utc_offset_hours(SYMBOL)
    print(f"broker offset = {offset}")

    results = {}
    for month in MONTHS:
        for name, over in VARIANTS:
            cfg = dict(LIVE_M1); cfg.update(over)
            print(f"[{month}] {name} ...", end=" ", flush=True)
            r = run_backtest(symbol=SYMBOL, month=month, config=cfg,
                             use_real_ticks=True, broker_offset_hours=offset)
            results[(month, name)] = r
            if r.get("success"):
                print(f"OK  trades={r['total_trades']} wr={r['win_rate']:.1f}% "
                      f"R={r['total_r']:+.1f} ${r['total_profit']:+.2f} maxDD={r['max_drawdown_pct']:.1f}%")
            else:
                print("ERROR:", r.get("error"))

    W = 100
    print("\n" + "=" * W)
    print(f"  {'เดือน':<9} {'Variant':<28} {'ไม้':>5} {'Win%':>7} {'TotalR':>9} {'Profit':>11} {'MaxDD%':>8} {'ExpR':>7}")
    print("-" * W)
    for month in MONTHS:
        for name, _ in VARIANTS:
            r = results[(month, name)]
            if r.get("success"):
                print(f"  {month:<9} {name:<28} {r['total_trades']:>5} {r['win_rate']:>6.1f}% "
                      f"{r['total_r']:>+9.2f} {r['total_profit']:>+11.2f} {r['max_drawdown_pct']:>8.1f} {r['expectancy_r']:>+7.3f}")
            else:
                print(f"  {month:<9} {name:<28}  ERROR: {r.get('error')}")
        print()
    print("-" * W)
    print("  รวม 2 เดือน:")
    for name, _ in VARIANTS:
        rs = [results[(m, name)] for m in MONTHS if results[(m, name)].get("success")]
        t = sum(r["total_trades"] for r in rs)
        w = sum(r["wins"] for r in rs)
        p = sum(r["total_profit"] for r in rs)
        tr = sum(r["total_r"] for r in rs)
        wr = f"{w/t*100:.1f}%" if t else "-"
        print(f"  {name:<28} ไม้ {t:>5}  Win {wr:>7}  R {tr:>+9.2f}  ${p:>+10.2f}")
    print("=" * W)


if __name__ == "__main__":
    main()

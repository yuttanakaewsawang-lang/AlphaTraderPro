"""
Backtest ทุน $200 ด้วย config จริงจาก production DB ณ 2026-07-09 (หลัง user ปรับตาม audit:
risk 1%, guard ON, retest ON, RR 2.5, M1/M1, trailing ON) — tick-mode พ.ค.+มิ.ย. 2026

Variants:
  A: config จริงปัจจุบัน (risk 1%)
  B: A + trailing OFF (ข้อแนะนำเดียวจาก audit ที่ยังไม่ได้เปิดใช้)
  C: A แต่ risk 3% (เทียบ DD แบบที่ตั้งไว้เดิมก่อนปรับ)

แต่ละ variant รายงาน 2 ชั้น:
  - engine (lot เศษส่วนอุดมคติ ตามที่ backtest.py คิด)
  - quantized (จำลอง lot จริง: ปัด volume_step + floor volume_min เหมือน
    Strategy.calculate_lot_size — ชี้ว่า min lot 0.01 ทำ risk จริงเพี้ยนจาก 1% แค่ไหน)

หมายเหตุ technical:
  - `start_balance` ไม่อยู่ใน DEFAULT_CONFIG → โดน cfg.update กรองทิ้ง (กับดัก v1.0.98)
    แก้โดย inject key ลง backtest.DEFAULT_CONFIG ก่อนเรียก
  - แยก zone cache dir ต่อ variant กัน state ปนข้าม variant (บทเรียนรอบ retest-semantic)
"""
import sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import load_settings
import backtest
from backtest import run_backtest, DEFAULT_CONFIG
from main import initialize_mt5

SYMBOL = "XAUUSD."
MONTHS = ["2026-05", "2026-06"]
START_BALANCE = 200.0

# config จริงจาก %APPDATA%\ApolloAutoTrade\trading_data.db อ่านสด 2026-07-09
# (เฉพาะ key ที่ backtest รู้จัก)
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
    ("A: config จริง risk 1%", {}),
    ("B: A + trailing OFF",    {"enable_trailing": 0}),
    ("C: A แต่ risk 3%",       {"risk_percent": 3.0}),
]


def quantized_replay(trades, risk_pct, point, vpp, lot_step, min_lot, max_lot):
    """เดินตามลำดับไม้จริง แต่คิด lot แบบ live (ปัด step + floor min) จากทุน $200 compound"""
    bal = START_BALANCE
    peak = bal
    max_dd_pct = 0.0
    floored = 0          # ไม้ที่ lot คำนวณได้ < min lot โดนดันขึ้น 0.01
    over_risk = 0        # ไม้ที่ risk จริงเกินเป้า > 20%
    lots = []
    for t in sorted(trades, key=lambda x: x["time"]):
        sl_dist = abs(t["entry"] - t["sl"])
        if sl_dist <= 0 or vpp <= 0:
            continue
        sl_pts = sl_dist / point
        risk = bal * risk_pct / 100.0
        lot_ideal = risk / (sl_pts * vpp)
        lot = round(lot_ideal / lot_step) * lot_step
        if lot < min_lot:
            lot = min_lot
            if lot_ideal < min_lot:
                floored += 1
        if lot > max_lot:
            lot = max_lot
        lot = round(lot, 2)
        actual_risk = lot * sl_pts * vpp
        if actual_risk > risk * 1.2:
            over_risk += 1
        bal = max(bal + t["r"] * actual_risk, 0.01)
        lots.append(lot)
        if bal > peak:
            peak = bal
        dd = (peak - bal) / peak * 100.0
        if dd > max_dd_pct:
            max_dd_pct = dd
    return {"final": bal, "max_dd_pct": max_dd_pct, "floored": floored,
            "over_risk": over_risk, "n": len(lots),
            "lot_min": min(lots) if lots else 0, "lot_max": max(lots) if lots else 0}


def main():
    # กับดัก v1.0.98: key นอก DEFAULT_CONFIG โดนกรองทิ้งเงียบๆ — inject ก่อน
    DEFAULT_CONFIG["start_balance"] = 0.0

    settings = load_settings()
    terminal_path = settings.get("terminal_path") or r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"
    if not initialize_mt5(login=settings.get("login"), password=settings.get("password"),
                          server=settings.get("server"), terminal_path=terminal_path):
        print("MT5 initialize failed"); sys.exit(1)

    import MetaTrader5 as mt5
    from main import broker_utc_offset_hours
    offset = broker_utc_offset_hours(SYMBOL)
    print(f"broker offset = {offset}")

    info = mt5.symbol_info(SYMBOL)
    point = info.point
    tick_size = info.trade_tick_size or point
    vpp = info.trade_tick_value * (point / tick_size) if tick_size else 0.0
    lot_step, min_lot, max_lot = info.volume_step, info.volume_min, info.volume_max
    print(f"point={point} vpp={vpp} lot_step={lot_step} min_lot={min_lot}")

    results = {}
    base_cache = tempfile.mkdtemp(prefix="apollo_r1_cache_")
    for name, over in VARIANTS:
        # แยก zone cache ต่อ variant กัน state เดือนก่อนปนข้าม variant
        backtest._ZONE_CACHE_DIR = os.path.join(base_cache, name[:1])
        all_trades = []
        for month in MONTHS:
            cfg = dict(LIVE_NOW); cfg.update(over)
            cfg["start_balance"] = START_BALANCE
            print(f"[{month}] {name} ...", end=" ", flush=True)
            r = run_backtest(symbol=SYMBOL, month=month, config=cfg,
                             use_real_ticks=True, broker_offset_hours=offset)
            results[(month, name)] = r
            if r.get("success"):
                print(f"OK trades={r['total_trades']} wr={r['win_rate']:.1f}% "
                      f"R={r['total_r']:+.1f} ${r['total_profit']:+.2f} maxDD={r['max_drawdown_pct']:.1f}%")
                all_trades.extend(r.get("trades", []))
            else:
                print("ERROR:", r.get("error"))
        results[("ALL", name)] = all_trades

    W = 108
    print("\n" + "=" * W)
    print(f"  ทุนเริ่ม ${START_BALANCE:.0f} | tick-mode | {' + '.join(MONTHS)}")
    print(f"  {'เดือน':<9} {'Variant':<26} {'ไม้':>5} {'Win%':>7} {'TotalR':>9} {'Engine$':>10} {'EngDD%':>7}")
    print("-" * W)
    for month in MONTHS:
        for name, _ in VARIANTS:
            r = results[(month, name)]
            if r.get("success"):
                print(f"  {month:<9} {name:<26} {r['total_trades']:>5} {r['win_rate']:>6.1f}% "
                      f"{r['total_r']:>+9.2f} {r['total_profit']:>+10.2f} {r['max_drawdown_pct']:>7.1f}")
            else:
                print(f"  {month:<9} {name:<26}  ERROR: {r.get('error')}")
        print()
    print("-" * W)
    print("  รวม 2 เดือน — จำลอง lot จริง (ปัด 0.01 step, floor min lot) compound จาก $200:")
    print(f"  {'Variant':<26} {'ไม้':>5} {'ทุนจบ':>10} {'กำไร':>10} {'MaxDD%':>8} {'lot range':>12} {'floor0.01':>10} {'risk>เป้า':>10}")
    for name, over in VARIANTS:
        risk_pct = over.get("risk_percent", LIVE_NOW["risk_percent"])
        q = quantized_replay(results[("ALL", name)], risk_pct, point, vpp, lot_step, min_lot, max_lot)
        profit = q["final"] - START_BALANCE
        print(f"  {name:<26} {q['n']:>5} {q['final']:>10.2f} {profit:>+10.2f} {q['max_dd_pct']:>8.1f} "
              f"{q['lot_min']:>5.2f}-{q['lot_max']:<5.2f} {q['floored']:>10} {q['over_risk']:>10}")
    print("=" * W)


if __name__ == "__main__":
    main()

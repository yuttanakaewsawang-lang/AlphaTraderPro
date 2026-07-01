"""
วิเคราะห์ SL distance distribution จาก backtest 3 เดือน
เพื่อหาค่า min_sl_points / max_sl_points ที่เหมาะสม
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import load_strategy_config
from backtest import run_backtest
from datetime import datetime

SYMBOL = "XAUUSD."
MONTHS_BACK = 3


def month_keys(n):
    now = datetime.now()
    out = []
    for back in range(n - 1, -1, -1):
        y, m = now.year, now.month - back
        while m <= 0:
            m += 12
            y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def analyze_sl(symbol, months, cfg):
    all_trades = []
    point = 0.01  # XAUUSD 1 point = 0.01 USD

    for month in months:
        print(f"  [{month}]...", end=" ", flush=True)
        r = run_backtest(symbol=symbol, month=month, config=cfg)
        if not r.get("success"):
            print(f"ERROR: {r.get('error', '?')}")
            continue
        print(f"OK  ({r['total_trades']} ไม้)")
        for t in r.get("trades", []):
            sl_dist = abs(t["entry"] - t["sl"]) / point
            all_trades.append({
                "month": month,
                "type": t["type"],
                "result": t["result"],
                "sl_dist_pts": round(sl_dist, 1),
                "pattern": t.get("pattern", "ZONE"),
            })

    return all_trades


def percentile(vals, pct):
    if not vals:
        return 0
    s = sorted(vals)
    idx = min(int(len(s) * pct / 100), len(s) - 1)
    return s[idx]


def print_analysis(trades):
    if not trades:
        print("ไม่มีข้อมูล trade")
        return

    dists = [t["sl_dist_pts"] for t in trades]
    win_t = [t for t in trades if t["result"] == "TP"]
    loss_t = [t for t in trades if t["result"] in ("SL", "TRAIL")]
    wd = [t["sl_dist_pts"] for t in win_t]
    ld = [t["sl_dist_pts"] for t in loss_t]

    print("\n" + "=" * 62)
    print(f"  SL DISTANCE ANALYSIS  |  {SYMBOL}  |  {MONTHS_BACK} เดือน")
    print("=" * 62)
    print(f"  ไม้ทั้งหมด: {len(trades)}   Win: {len(win_t)}   Loss: {len(loss_t)}")
    print()
    print(f"  {'Stat':20} {'ALL':>8} {'WIN':>8} {'LOSS':>8}")
    print(f"  {'-'*44}")

    def fmt(v):
        return f"{v:>8.0f}" if isinstance(v, (int, float)) else f"{'- ':>8}"

    for label, pct in [("Min", 0), ("P10", 10), ("P25", 25),
                        ("Median", 50), ("P75", 75), ("P90", 90), ("Max", 100)]:
        pv = percentile(dists, pct) if pct < 100 else max(dists)
        pw = percentile(wd, pct) if wd and pct < 100 else (max(wd) if wd else "-")
        pl = percentile(ld, pct) if ld and pct < 100 else (max(ld) if ld else "-")
        print(f"  {label+' (pts)':20}{fmt(pv)}{fmt(pw)}{fmt(pl)}")

    print()
    print("  Histogram (จำนวนไม้ต่อ SL range):")
    buckets = [0, 100, 150, 200, 250, 300, 400, 500, 9999]
    labels  = ["<100", "100-150", "150-200", "200-250", "250-300", "300-400", "400-500", ">500"]
    for i in range(len(labels)):
        lo, hi = buckets[i], buckets[i + 1]
        group = [t for t in trades if lo <= t["sl_dist_pts"] < hi]
        w = sum(1 for t in group if t["result"] == "TP")
        bar = "█" * len(group)
        wr = f"  Win {w}/{len(group)}" if group else ""
        print(f"  {labels[i]:>10}: {bar:<25} {len(group):>3} ไม้{wr}")

    # คำนวณแนะนำ
    p10 = percentile(dists, 10)
    p90 = percentile(dists, 90)
    sug_min = round(p10 / 10) * 10
    sug_max = round(p90 / 10) * 10

    # วิเคราะห์ loss ที่จะโดน filter
    if ld:
        cut_min = sum(1 for d in ld if d < sug_min)
        cut_max = sum(1 for d in ld if d > sug_max)
        kept    = len(ld) - cut_min - cut_max
    else:
        cut_min = cut_max = kept = 0

    if wd:
        skip_min = sum(1 for d in wd if d < sug_min)
        skip_max = sum(1 for d in wd if d > sug_max)
    else:
        skip_min = skip_max = 0

    print()
    print("=" * 62)
    print("  แนะนำค่า config (อิง P10–P90):")
    print(f"    min_sl_points = {sug_min:.0f}")
    print(f"    max_sl_points = {sug_max:.0f}")
    print()
    print("  ผลของการกรอง:")
    print(f"    Loss ที่จะหลุด:  {cut_min} ไม้ (SL < {sug_min:.0f})  +  {cut_max} ไม้ (SL > {sug_max:.0f})")
    print(f"    Win ที่จะหลุด:   {skip_min} ไม้ (SL < {sug_min:.0f})  +  {skip_max} ไม้ (SL > {sug_max:.0f})")
    print(f"    Loss ที่เหลือ:   {kept} ไม้")
    print()

    # สรุปคำแนะนำ
    if cut_min + cut_max == 0:
        print("  → SL ทุกไม้อยู่ใน range → min/max ไม่ช่วย (ตั้ง 0 ทั้งคู่ดีกว่า)")
    elif (cut_min + cut_max) > (skip_min + skip_max):
        print("  → กรองได้ loss มากกว่า win → แนะนำใช้ค่าข้างบน")
    else:
        print("  → กรอง loss น้อย แต่เสีย win เยอะ → ระวังก่อนใช้ ควรทดสอบ backtest อีกรอบ")

    print("  (min_sl_points=0 / max_sl_points=0 = ปิดการกรอง)")
    print("=" * 62)
    print()


def main():
    cfg = load_strategy_config(SYMBOL)
    if not cfg:
        print(f"ไม่พบ config สำหรับ {SYMBOL}")
        sys.exit(1)

    months = month_keys(MONTHS_BACK)
    print(f"\nSL Distance Analysis  |  {SYMBOL}")
    print(f"Config: TF={cfg['zone_timeframe']}/{cfg['entry_timeframe']}  RR={cfg['tp_ratio_rr']}  buffer_atr={cfg['buffer_atr']}")
    print(f"เดือน: {', '.join(months)}\n")

    trades = analyze_sl(SYMBOL, months, cfg)
    print_analysis(trades)


if __name__ == "__main__":
    main()

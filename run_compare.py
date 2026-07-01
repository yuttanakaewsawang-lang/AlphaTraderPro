"""
เปรียบเทียบ min_sl_atr อิง config จริงจาก DB + MT5 data ย้อนหลัง 12 เดือน:
  A (เก่า): min_sl_atr=0 (ไม่มี minimum SL)
  B (ใหม่): min_sl_atr=0.3 (SL ต้องห่างอย่างน้อย 0.3*ATR)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import load_strategy_config, load_settings
from backtest import run_backtest
from main import initialize_mt5
from datetime import datetime

SYMBOL = "XAUUSD."
MONTHS_BACK = 12


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


def run_mode(symbol, month, cfg, min_sl_atr):
    c = dict(cfg)
    c["min_sl_atr"] = min_sl_atr
    c["use_zone_sl"] = 0
    c["use_entry_guards"] = 1
    return run_backtest(symbol=symbol, month=month, config=c)


def print_row(month, label, r):
    if not r or not r.get("success"):
        print(f"  {month:<8} {label:<28}  ERROR: {r.get('error','?') if r else '?'}")
        return None
    wr  = f"{r['win_rate']*100:.1f}%"
    pnl = f"${r['total_profit']:+.2f}"
    dd  = f"{r['max_drawdown_pct']:.1f}%"
    exp = f"{r['expectancy_r']:.2f}R"
    print(f"  {month:<8} {label:<28} {r['total_trades']:>4} {wr:>6} {pnl:>10} {dd:>8} {exp:>6}")
    return r


def summarize(label, results_list):
    trades = wins = 0
    profit = 0.0
    dds = []
    for r in results_list:
        if r and r.get("success"):
            trades += r["total_trades"]
            wins   += r["wins"]
            profit += r["total_profit"]
            dds.append(r["max_drawdown_pct"])
    wr    = f"{wins/trades*100:.1f}%" if trades else "-"
    maxdd = f"{max(dds):.1f}%" if dds else "-"
    return trades, wr, profit, maxdd


def main():
    settings = load_settings()
    terminal_path = settings.get("terminal_path") or r"C:\Program Files\IUX Markets MT5 Terminal\terminal64.exe"
    ok = initialize_mt5(
        login=settings.get("login"),
        password=settings.get("password"),
        server=settings.get("server"),
        terminal_path=terminal_path,
    )
    if not ok:
        print("MT5 initialize failed")
        sys.exit(1)

    cfg = load_strategy_config(SYMBOL)
    if not cfg:
        print(f"ไม่พบ config สำหรับ {SYMBOL}")
        sys.exit(1)

    months = month_keys(MONTHS_BACK)
    print(f"\nMin SL ATR Comparison  |  {SYMBOL}")
    print(f"Config: TF={cfg['zone_timeframe']}/{cfg['entry_timeframe']}  RR={cfg['tp_ratio_rr']}  "
          f"buffer_atr={cfg['buffer_atr']}  OB={'ON' if cfg['enable_ob_entry'] else 'OFF'}  "
          f"Session={cfg.get('trade_sessions') or 'ทุกเวลา'}")
    print(f"เดือน: {', '.join(months)}\n")

    res_a, res_b = {}, {}
    for month in months:
        print(f"  [{month}] A: min_sl_atr=0 (เก่า)...", end=" ", flush=True)
        res_a[month] = run_mode(SYMBOL, month, cfg, min_sl_atr=0)
        print("OK" if res_a[month].get("success") else f"ERROR: {res_a[month].get('error','?')}")

        print(f"  [{month}] B: min_sl_atr=0.3 (ใหม่)...", end=" ", flush=True)
        res_b[month] = run_mode(SYMBOL, month, cfg, min_sl_atr=0.3)
        print("OK" if res_b[month].get("success") else f"ERROR: {res_b[month].get('error','?')}")

    print()
    W = 82
    print("=" * W)
    print(f"  {'เดือน':<8} {'Mode':<28} {'ไม้':>4} {'Win%':>6} {'Profit':>10} {'MaxDD%':>8} {'ExpR':>6}")
    print("-" * W)
    for month in months:
        print_row(month, "A: min_sl=0 (เก่า)", res_a[month])
        print_row(month, "B: min_sl=0.3*ATR (ใหม่)", res_b[month])
        print()
    print("-" * W)
    print("  รวม 12 เดือน:")
    for label, results in [("A: min_sl=0 (เก่า)      ", res_a), ("B: min_sl=0.3*ATR (ใหม่)", res_b)]:
        t, wr, profit, maxdd = summarize(label, results.values())
        print(f"  {label}  ไม้: {t:>3}  Win: {wr:>6}  Profit: ${profit:+.2f}  MaxDD: {maxdd}")
    print("=" * W)

    t_a, _, p_a, _ = summarize("A", res_a.values())
    t_b, _, p_b, _ = summarize("B", res_b.values())
    d = p_b - p_a
    print(f"\n  Delta (B - A):  ไม้ {t_b-t_a:+d}  |  Profit {d:+.2f} USD")
    if d > 0:
        print("  >> min_sl_atr=0.3 ให้ผลดีกว่า")
    elif d < 0:
        print("  >> ไม่มี min_sl ให้ผลดีกว่า")
    else:
        print("  >> ผลเท่ากัน")
    print()


if __name__ == "__main__":
    main()

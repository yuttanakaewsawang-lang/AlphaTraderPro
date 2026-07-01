"""ทดสอบผลของ Rule Filter ต่อ config ใหม่ (RR=3.5 eng0 ret1 fvg0) — 12 เดือน tick-mode
- A: trend OFF, ไม่กรอง (best ที่เจอ)
- B: trend ON  (= ผลของ EMA50 block ที่ Rule Filter แอบทำ)
- C: trend OFF + simulate_review (ส่วน stats/expectancy ของ Rule Filter)"""
from datetime import datetime
from main import initialize_mt5
from backtest import run_backtest
from database import load_strategy_config

SYMBOL = "XAUUSD."


def months_list(n):
    now = datetime.now(); out = []
    for back in range(n - 1, -1, -1):
        y, m = now.year, now.month - back
        while m <= 0: m += 12; y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


MONTHS = months_list(12)


def run_all(cfg, label, sim_review=False):
    cum_r = cum_p = 0.0; tot = wins = neg = 0
    f_r = f_p = f_tr = 0
    for mth in MONTHS:
        r = run_backtest(SYMBOL, month=mth, config=cfg, use_real_ticks=True, simulate_review=sim_review)
        if not r["success"]:
            continue
        cum_r += r["total_r"]; cum_p += r["total_profit"]
        tot += r["total_trades"]; wins += r["wins"]
        if r["total_r"] < 0: neg += 1
        if sim_review and r.get("review"):
            f_r += r["review"]["filtered_total_r"]
            f_p += r["review"]["filtered_total_profit"]
            f_tr += r["review"]["filtered_trades"]
    wr = round(wins / tot * 100, 1) if tot else 0
    print(f"{label:>34} | trades={tot:>4} win%={wr:>5} | R={round(cum_r,2):>7} profit={round(cum_p,2):>9} | neg={neg}/12")
    if sim_review:
        print(f"{'  └ หลังกรอง stats (Rule Filter)':>34} | trades={f_tr:>4} {'':>11} | R={round(f_r,2):>7} profit={round(f_p,2):>9}")


if __name__ == "__main__":
    if not initialize_mt5():
        print("MT5 init failed"); raise SystemExit(1)
    base = load_strategy_config(SYMBOL) or {}
    new = dict(base)
    new.update({"tp_ratio_rr": 3.5, "require_engulfing": 0, "require_retest": 1, "enable_fvg_entry": 0})

    print("\nConfig ใหม่ RR=3.5 eng=0 ret=1 — ผลของ Rule Filter\n" + "=" * 95)
    a = dict(new); a["use_trend_filter"] = 0
    run_all(a, "A) trend OFF, ไม่กรอง (best)")
    b = dict(new); b["use_trend_filter"] = 1
    run_all(b, "B) trend ON (= EMA50 block ของ Rule)")
    c = dict(new); c["use_trend_filter"] = 0
    run_all(c, "C) trend OFF + stats filter", sim_review=True)
    print("=" * 95)

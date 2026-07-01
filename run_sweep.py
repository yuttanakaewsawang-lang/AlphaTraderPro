"""Sweep โซน/แท่งเข้า: zone_atr_mult (ความกว้างกล่องโซน) x buffer_atr (ระยะ SL)
config ใหม่ RR=3.5 eng0 trend0, bar-mode จัดอันดับ + train/validate"""
from datetime import datetime
from itertools import product
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


ALL = months_list(12)
TRAIN, VALID = ALL[:8], ALL[8:]


def ev(cfg, months):
    rs = 0.0; tot = wins = neg = 0
    for mth in months:
        r = run_backtest(SYMBOL, month=mth, config=cfg, use_real_ticks=False)
        if not r["success"]:
            continue
        rs += r["total_r"]; tot += r["total_trades"]; wins += r["wins"]
        if r["total_r"] < 0: neg += 1
    return {"r": round(rs, 1), "tr": tot, "win": round(wins/tot*100,1) if tot else 0,
            "exp": round(rs/tot,3) if tot else 0, "neg": neg}


if __name__ == "__main__":
    if not initialize_mt5():
        print("MT5 init failed"); raise SystemExit(1)
    base = load_strategy_config(SYMBOL) or {}
    base.update({"use_trend_filter": 0, "tp_ratio_rr": 3.5, "require_engulfing": 0,
                 "require_retest": 1, "enable_fvg_entry": 0, "enable_ob_entry": 1})
    cur_mult = base.get("zone_atr_mult"); cur_buf = base.get("buffer_atr")
    print(f"ปัจจุบัน zone_atr_mult={cur_mult} buffer_atr={cur_buf}\n")

    MULT = [0.3, 0.5, 0.7, 1.0]
    BUF = [0.05, 0.1, 0.2]
    rows = []
    for m, b in product(MULT, BUF):
        cfg = dict(base); cfg["zone_atr_mult"] = m; cfg["buffer_atr"] = b
        f = ev(cfg, ALL)
        rows.append((f["r"], m, b, f))
    rows.sort(key=lambda x: x[0], reverse=True)
    print(f"{'zmult':>6} {'buf':>5} | {'R':>7} {'trades':>6} {'win%':>5} {'exp':>6} {'neg':>3}")
    print("-" * 48)
    for r12, m, b, f in rows:
        print(f"{m:>6} {b:>5} | {f['r']:>7} {f['tr']:>6} {f['win']:>5} {f['exp']:>6} {f['neg']:>3}")

    print("\n=== Train(8)/Validate(4) ของ Top 3 ===")
    for r12, m, b, f in rows[:3]:
        tr = ev({**base, "zone_atr_mult": m, "buffer_atr": b}, TRAIN)
        va = ev({**base, "zone_atr_mult": m, "buffer_atr": b}, VALID)
        print(f"zmult={m} buf={b} | train R={tr['r']:>6} exp={tr['exp']:>6} | valid R={va['r']:>6} exp={va['exp']:>6} neg={va['neg']}/4")

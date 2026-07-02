# AlphaTraderPro — Project Rules

## Stack
- **Frontend:** React + TypeScript + Vite + TailwindCSS → `frontend/dist/`
- **Backend:** FastAPI (port 8000) + MetaTrader5 Python + SQLite
- **Desktop:** PyWebView 6.2.1 wrapping `http://127.0.0.1:8000`
- **Exe:** PyInstaller via `run_app.spec` → `dist/AlphaTraderPro.exe`
- **Data dir (exe):** `%APPDATA%\AlphaTraderPro\` — app.db, license.json, dist/, logs/

## Key Files
| File | Role |
|------|------|
| `run_app.py` | Entry point — uvicorn thread + PyWebView window |
| `backend/app.py` | All FastAPI routes |
| `Strategy.py` | SMC logic — zone detection, entry signals, order management |
| `backtest.py` | Backtest engine (bar-mode + tick-mode) |
| `bot_messages.py` | Discord message variants (Breaking News style, randomized) |
| `notifications.py` | Discord embed sender |
| `database.py` | SQLite — settings, history, running state |
| `main.py` | MT5 helpers — initialize_mt5, place_order, get_candles |
| `license_manager.py` | HMAC license — MachineGuid-based |
| `version.py` | APP_VERSION + update manifest URL |
| `release.ps1` | Release automation |

## Release Commands
```powershell
# Frontend-only change (React/TS):
.\release.ps1 -Patch -Notes "..."

# Any Python change (backend/Strategy/main):
.\release.ps1 -Notes "..."
```
- Auto-increments PATCH version, builds, pushes GitHub Release
- **Close exe first** — running exe locks dist/AlphaTraderPro.exe → PermissionError

## Security — NEVER push these files
`keygen.py`, `keygen_ui.py`, `license_manager.py`, `backend/app.py`, `Strategy.py`,
`ai_strategy.py`, `backtest.py`, `find_best_config.py`, `main.py`, `notifications.py`,
`database.py`, `filters.py`, `market_structure.py`, `calendar_feed.py`,
`run_app.py`, `run_app.spec`, `start.bat`, `version.py`

## Config — 4 sources must stay in sync
When changing any strategy default, update **all four**:
1. `Strategy.py` → `SMCStrategy.__init__`
2. `database.py` → `init_db()` CREATE TABLE defaults
3. `backtest.py` → `DEFAULT_CONFIG`
4. `frontend/src/components/StrategyView.tsx` → `RECOMMENDED_DEFAULTS`

Missing one = live/UI/reset drift (caused bugs before).

## MT5 Terminal (VPS Rule)
- `initialize_mt5()` **requires** `terminal_path` — raises RuntimeError if missing
- After `mt5.initialize(path=...)`, verify `terminal_info().path` matches expected dir
- If mismatch → `mt5.shutdown()` + raise error → never silently connect to wrong terminal

## Candle Index Convention
```python
df.iloc[-1]  # forming candle — NEVER use for signals
df.iloc[-2]  # row1: last closed bar (use for entry signal)
df.iloc[-3]  # row2: bar before that (use for engulfing check)
```

## Common Pitfalls
- `encoding="ascii"` in bat files → never put Thai text → UnicodeEncodeError (fixed v1.0.28)
- `display:none` chart container → chart loses dimensions on remount → use absolute overlay instead
- `mt5.initialize()` without path on VPS with 2 terminals → connects to wrong one
- Order ซ้ำแท่งเดียว → ต้อง lock `_last_entry_bar_time` จาก `row1['time']`
- 4 config sources ไม่ sync → "Reset to Recommended" เขียนค่าเก่ากลับ DB

## Changelog Rule
**ทุกครั้งที่แก้โค้ด (logic/config/UI) ต้องเพิ่มบันทึกในหัวข้อ "Changelog" ด้านล่างนี้ทันที**
— รูปแบบ: `- YYYY-MM-DD vX.X.X: สรุปสั้นๆ ว่าแก้อะไร ทำไม (ไฟล์ที่แก้)`

## Changelog
- 2026-07-02: **UI redesign เฟส 2 (rollout)** — ปรับหน้าที่เหลือทั้งหมดให้ตรงกับ iOS palette/motion ของเฟส 1: Login/ActivateView (lucide icons แทน emoji, ios-fade-in), TitleBar/SettingsView (ปุ่มหน้าต่าง + LogOut icon), StrategyView (tab bar → iOS segmented control, RotateCcw/CheckCircle2 icons), History/Ledger/Stats (capsule badge, equity curve สี iOS), Calendar/LiveChart (accent สี iOS, filter pill), BacktestReplayView + SMCChart (แทนที่ชุดสี candlestick/zone/OB เดิม #2ECC71/#E74C3C/#F1C40F/#3498DB/#D9933B ด้วย iOS token #30D158/#FF453A/#FFD60A/#0A84FF ทั้งหมด) — พบว่า `BacktestView.tsx`, `AIView.tsx`, `NotificationsView.tsx` ไม่ถูก import ที่ไหนเลย (dead code จากการรื้อ Rule Filter/BacktestReplay เดิม) เลยข้ามการ migrate และ flag ไว้ลบแยกต่างหาก — แก้ `Login.tsx`, `ActivateView.tsx`, `TitleBar.tsx`, `SettingsView.tsx`, `StrategyView.tsx`, `HistoryView.tsx`, `LedgerView.tsx`, `StatsView.tsx`, `CalendarView.tsx`, `LiveChartView.tsx`, `BacktestReplayView.tsx`, `SMCChart.tsx`
- 2026-07-02: **UI redesign เฟส 1 (foundation)** — เปลี่ยนโทนสีทั้งแอปจาก gold/trading-desk เดิม → iOS system color palette (systemBlue #0A84FF, systemGreen #30D158, systemRed #FF453A, systemPurple #BF5AF2 ฯลฯ), พื้นหลัง true-black #000000 + surface hierarchy ตาม iOS dark mode, เพิ่ม spring easing (`--ease-ios`) และ `.ios-fade-in`/`.ios-pressable`/`.ios-glass`/`.ios-icon-tile` helper classes, เพิ่ม border-radius `.lux-card` 12→16px (มีผลทุกหน้าที่ใช้ lux-* classes อัตโนมัติ) — apply เต็มรูปแบบใน Sidebar (แถบ nav แบบ sliding pill indicator ด้วย useLayoutEffect วัด offsetTop, ไอคอน lucide แทน emoji, app-icon brand mark) และ DashboardView (ไอคอน KPI เป็น lucide + ios-icon-tile, pipeline node สีตาม iOS palette) — หน้าอื่นยังไม่ migrate (รอเฟสถัดไป) แต่ได้ผลพลอยได้จาก token เปลี่ยนแล้วบางส่วน — เพิ่ม `server.proxy '/api' → 127.0.0.1:8000` ใน `vite.config.ts` (dev-only, ไม่กระทบ prod build) เพื่อให้ `npm run dev` คุยกับ backend จริงได้ตอน preview — แก้ `frontend/src/index.css`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/DashboardView.tsx`, `frontend/src/App.tsx`, `frontend/vite.config.ts`
- 2026-07-02 v1.0.66: Backtest Replay เปลี่ยนฐาน config จาก DEFAULT_CONFIG → **ค่าจริงจาก DB** (`strategy.get_config()` ทับบน DEFAULT ที่เติม key backtest-only) — ปรับ config ในหน้า Strategy แล้วดูผล Replay ได้ตรง live ใช้หาค่าที่กำไรสุดได้ ตัวเลือกบนหน้า Replay ยัง override ได้เหมือนเดิม — แก้ `backend/app.py`
- 2026-07-02 v1.0.66: **Config audit ครบ 45 fields** — pydantic/DB save-load round-trip ผ่านหมด (ไม่มีบั๊กแบบ v1.0.59 เหลือ) แต่พบ **10 ค่า default ไม่ sync** ระหว่าง Strategy.__init__/backtest DEFAULT_CONFIG กับ RECOMMENDED (be_trigger 80→40, be_offset 1→20, entry_tf M1→M5, max_daily_loss 5→15, max_portfolio_dd 10→20, max_trades/day 5→10, news_filter 0→30, retrain 0→30, trail_mode 0→1, trail_offset 50→30) — sync เป็นค่า RECOMMENDED ทุกแหล่งแล้ว หมายเหตุ: backtest เดิมรันด้วย max_trades/day=5 + news_filter=0 ตัวเลขสัมบูรณ์จะขยับเล็กน้อยจากนี้ (การเทียบ variant ก่อนหน้ายังใช้ได้เพราะทุกตัวใช้ base เดียวกัน) — แก้ `Strategy.py`, `backtest.py`, `database.py`
- 2026-07-02 v1.0.65: **บั๊ก News Filter** — ข่าวจาก feed ออนไลน์ (TradingView) ไม่เคยบล็อกการเทรดเลย เพราะ feed ให้ country code (`US`/`CA`/`GB`) แต่ `in_news_window` เทียบกับ currency code (`USD`/`CAD`/`GBP`) → ไม่ match สักคู่ ทำงานแค่ข่าว hardcode 13 รายการที่ tag "USD" ไว้ เพิ่มตาราง `_COUNTRY_TO_CCY` map ใน `_sync_news_filter` + ทดสอบ boundary ±30 นาทีผ่านครบ — แก้ `calendar_feed.py`
- 2026-07-02 v1.0.64: ลบเมนู "Rule Filter" (หน้า AIView) ที่หลงเหลือใน sidebar หลังถอด Rule Filter ใน v1.0.63 — แก้ `frontend/src/components/Sidebar.tsx`, `App.tsx`
- 2026-07-02 v1.0.63: **ลบ Rule Filter ทั้งระบบ** — ถอด review gate ออกจาก `_process_signal` (signal ผ่านตรง), ลบ `enable_rule_filter` จาก CONFIG_FIELDS/pydantic/DEFAULT_CONFIG/frontend (แท็บ Rule Filter หายไป), คอลัมน์ DB คงไว้เป็น dead column กัน index เลื่อน — พฤติกรรมไม่เปลี่ยนเพราะ default ปิดอยู่แล้ว; `ai_strategy.py` ยังอยู่ (backtest simulate_review + AIView ใช้) — แก้ `Strategy.py`, `backend/app.py`, `backtest.py`, `database.py`, frontend StrategyView/types
- 2026-07-02 v1.0.63: **Market Context** — อ่านบริบทตลาดจากแท่งเทียนล้วน 4 ปัจจัย (swing structure 40% / body dominance 25% / ตำแหน่ง range 20% / ATR expansion 15%) คำนวณบน TF ที่เลือกเล่น (zone_timeframe) + H1 อ้างอิง แสดงบน Dashboard แทนโหนด AI Review เดิม (pipeline node + panel breakdown) — display เท่านั้น ไม่แตะ entry logic; endpoint `GET /api/market-context` — แก้ `market_structure.py` (compute_market_context), `backend/app.py`, `frontend/src/components/DashboardView.tsx`
- 2026-07-02 v1.0.62: **Zone Entry Guard** (`entry_mode=1`, `max_entry_zone_atr=0.3`) เป็น default ใหม่ — เดิมเข้า market ทันทีที่แท่งยืนยันปิดแม้ราคาวิ่งหนีขอบโซนไปไกลแล้ว (ได้ราคาแย่ SL กว้าง) ตอนนี้ข้าม setup ที่ราคาห่างขอบโซนเกิน 0.3×ATR — tick-mode 4 เดือน: +$727 vs +$458 (+59%), WR 46.6% vs 38.8%, DD −8.0 vs −10.0 จากไม้จำนวนเท่าเดิม; ทดลอง limit ที่ขอบโซนด้วยแต่แพ้ guard (+$655 หลังแก้ fill-bias ใน sim) — แก้ครบ 5 ชั้น `Strategy.py`, `database.py`, `backend/app.py`, `backtest.py`, frontend types/StrategyView + round-trip test ผ่าน
- 2026-07-02 (backtest only): Port trailing candle mode ให้ตรง live — backtest เดิมไม่มี filter สีแท่ง (v1.0.55 แก้ live แต่ไม่ได้ port) + เพิ่ม `trail_eval_per_bar` (default 1 = ประเมิน trigger ตอนแท่งใหม่เปิด ตรง live) — ผลเทียบ tick-mode 4 เดือน: trailing OFF +$482 ชนะ ON ทุกแบบ (per-bar +$317, per-tick +$311) ยืนยัน default enable_trailing=0 ถูกแล้ว; per-tick ดีกว่า per-bar เฉพาะ DD (−9.3 vs −12.6) — แก้ `backtest.py`
- 2026-07-02 v1.0.61: **บั๊ก** OB/FVG ยิงซ้ำได้หลัง zone reset — `_used_ob_ids` เคยเก็บปนใน `_used_zone_ids` ซึ่ง `reset_zone()` ล้างทิ้งทุกครั้งที่ zone entry ยิง/zone invalidate → OB ที่เคยเปิดไม้แล้วกลับมายิงซ้ำได้ แยกเป็น `self._used_ob_ids` ที่ไม่ถูกล้างโดย reset_zone (cap 200 รายการ) — แก้ `Strategy.py`
- 2026-07-02 v1.0.61: ปรับ default config จากผล tick-mode 4 เดือน: `min_sl_atr` 0.3→0.5 (ค่า 1.2 ที่เคยแนะนำทำ WR ตก 5%+DD พุ่ง เพราะ override swing SL), `buffer_atr` 0.05→0.15, `zone_expiry_bars` frontend 100→50 (แก้ 4 sources ไม่ sync) — ยืนยันด้วย tick-mode: trades=307 WR=38.8% +$474.66 exp+0.507R maxDD −10.0R (ดีกว่า config เก่าทั้งกำไรและ DD) — แก้ `Strategy.py`, `database.py`, `backtest.py`, `frontend/src/components/StrategyView.tsx`
- 2026-07-01 v1.0.60: News filter block เดิม log ลง `live_decisions` อย่างเดียว ไม่แจ้ง Discord/notification DB เลย เพิ่ม `active_news_event()` หาว่าข่าวไหนกำลังบล็อกอยู่ (เวลา+สกุลเงิน) แล้วเรียก `notify()` (บันทึก `notification_log` + ส่ง Discord) ครั้งเดียวต่อข่าว 1 event (กันสแปมด้วย `_news_notified_key`) — แก้ `filters.py`, `Strategy.py`
- 2026-07-01 v1.0.59: **บั๊ก** Min SL ATR×/Max OB-Zone ATR×/Swing SL/Trend Filter Mode เซฟไม่ติด — กด Save แล้วเด้งกลับค่าเดิม สาเหตุ: 4 field นี้ (`min_sl_atr`, `max_ob_zone_atr`, `use_swing_sl`, `trend_filter_mode`) ถูกเพิ่มใน `Strategy.py`/`backtest.py`/frontend ตอน v1.0.53-57 แต่**ลืมเพิ่มใน 3 จุด**: (1) `StrategyConfigUpdate` pydantic model ใน `backend/app.py` → FastAPI เงียบๆ ทิ้งค่าที่ frontend ส่งมาก่อนถึง logic เลย (2) `save_strategy_config()` INSERT/UPDATE columns (3) `load_strategy_config()` SELECT columns → ต่อให้เซฟติดก็โหลดกลับไม่ได้ตอน restart แก้ครบทั้ง 3 จุด + ทดสอบ round-trip ผ่านแล้ว — แก้ `backend/app.py`, `database.py`
- 2026-07-01 v1.0.58: Account Number ในหน้า Login เปลี่ยนเป็น dropdown อัตโนมัติเมื่อมีบัญชีที่เคย login (remember=1) มากกว่า 1 บัญชี/โบรกเกอร์ — เดิมเก็บได้แค่บัญชีเดียว (`settings` table, DELETE+INSERT ทับทุกครั้ง) เพิ่มตาราง `saved_accounts` (PK=login) เก็บได้หลายบัญชี พร้อม endpoint `GET/DELETE /api/accounts` — แก้ `database.py`, `backend/app.py`, `frontend/src/components/Login.tsx`
- 2026-07-01 v1.0.57: Swing SL เป็น default (`use_swing_sl=1`) — วาง SL เหนือ/ใต้ swing high/low ล่าสุดแทน row1 เดียว ป้องกัน stop-hunt กวาด high/low แท่ง signal (ยืนยันด้วย tick-mode backtest: +37% กำไรจริง เทียบ baseline) — แก้ `Strategy.py`, `database.py`, `backtest.py`, `frontend/src/types/strategy.ts`, `frontend/src/components/StrategyView.tsx`
- 2026-07-01 v1.0.56: Fix trailing mode 1 (candle) ใช้ TF ผิด — เดิม hardcode M15 ทำให้ trail ไม่ขยับตามแท่งที่เห็นบนกราฟจริง (ถ้าเทรด M5) แก้ให้ sync ตาม `zone_timeframe` แทน (`self.assistant.trail_timeframe`) — แก้ `Strategy.py`
- 2026-07-01 v1.0.55: Trail mode 1 (candle) เดิมขยับ SL ทุกแท่งไม่ว่าสีอะไร แก้ให้เลื่อนเฉพาะแท่งฝั่งเดียวกันที่ปิดล่าสุด (BUY=แท่งเขียว, SELL=แท่งแดง) — แก้ `Strategy.py`
- 2026-07-01 v1.0.55: Trend Filter เพิ่ม mode ใหม่ HH/HL structure (`trend_filter_mode=1`) แทน EMA50 อย่างเดียว — backtest ยืนยันดีกว่า EMA50 (+39% R ใน 6 เดือน) ตั้งเป็น default — แก้ `Strategy.py`, `database.py`, `backtest.py`, frontend types/StrategyView
- 2026-07-01 v1.0.53-55: OB/FVG entry (`check_structure_entry`) เดิมเข้าได้ไม่ว่า OB/FVG ห่างจาก active zone แค่ไหน (บั๊ก: SELL เข้าตอนราคาอยู่ใน Bullish OB ไกลจาก SBR zone 124 จุด) เพิ่ม `max_ob_zone_atr` (default 5.0) ข้าม signal ถ้า OB/FVG center ห่างจากขอบ active zone เกิน N×ATR — แก้ `Strategy.py`, `database.py`, `backtest.py`, frontend
- 2026-06-30: UI ปรับจาก Glassmorphism (ม่วง/เขียว gradient) → Minimal Dark Slate (`#131722` พื้น, `#1C2233` card, border บาง 0.07 opacity) ตามคำขอ "เทาตัดเทาเข้ม" — ลบ RO skin mode ออกทั้งหมดจากโค้ด — แก้ `frontend/src/index.css`, `Sidebar.tsx`, `Login.tsx`, `SettingsView.tsx`, `App.tsx`, ลบ `useSkin.ts`

## Analysis Findings (ยังไม่ implement — รอการตัดสินใจ)
- **Trailing eval per-tick vs per-bar** (2026-07-02): ถ้าจะเปิด trailing, per-tick eval ให้ DD ดีกว่า (−9.3R vs −12.6R, กำไรพอกัน) แต่ live ยังเป็น per-bar — ยังไม่แก้เพราะ default = trailing OFF ซึ่งกำไรดีกว่า ON ~35% (+$482 vs +$317, tick-mode 4mo)
- **Timeframe M5 vs M15**: tick-mode 4 เดือน — M5/M5 กำไรรวมมากกว่า ($711 vs $315) แต่ M15/M15 expectancy/ไม้ดีกว่า (+0.894R vs +0.660R) และ DD ต่ำกว่าครึ่ง (-6.1R vs -12.4R) การผสม TF ข้ามกัน (เช่น M15 zone/M5 entry) แย่กว่าใช้ TF เดียวล้วนเสมอ — **สรุป: อยู่ M5 เดิมตามที่ user เลือก (2026-07-01)**
- **Entry timing**: เข้าที่ราคาปัจจุบัน (tick.bid/ask) ทันทีหลัง signal ยืนยันจากแท่งปิด (row1) ไม่รอแท่งถัดไปปิดซ้ำ — เหมาะกับ zone-retest/breakout style ที่ signal หมดอายุเร็ว ยังไม่ได้ backtest เทียบกับ "รอปิดแท่งถัดไป"

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
- 2026-07-01 (pending build): Account Number ในหน้า Login เปลี่ยนเป็น dropdown อัตโนมัติเมื่อมีบัญชีที่เคย login (remember=1) มากกว่า 1 บัญชี/โบรกเกอร์ — เดิมเก็บได้แค่บัญชีเดียว (`settings` table, DELETE+INSERT ทับทุกครั้ง) เพิ่มตาราง `saved_accounts` (PK=login) เก็บได้หลายบัญชี พร้อม endpoint `GET/DELETE /api/accounts` — แก้ `database.py`, `backend/app.py`, `frontend/src/components/Login.tsx`
- 2026-07-01 v1.0.57: Swing SL เป็น default (`use_swing_sl=1`) — วาง SL เหนือ/ใต้ swing high/low ล่าสุดแทน row1 เดียว ป้องกัน stop-hunt กวาด high/low แท่ง signal (ยืนยันด้วย tick-mode backtest: +37% กำไรจริง เทียบ baseline) — แก้ `Strategy.py`, `database.py`, `backtest.py`, `frontend/src/types/strategy.ts`, `frontend/src/components/StrategyView.tsx`
- 2026-07-01 v1.0.56: Fix trailing mode 1 (candle) ใช้ TF ผิด — เดิม hardcode M15 ทำให้ trail ไม่ขยับตามแท่งที่เห็นบนกราฟจริง (ถ้าเทรด M5) แก้ให้ sync ตาม `zone_timeframe` แทน (`self.assistant.trail_timeframe`) — แก้ `Strategy.py`
- 2026-07-01 v1.0.55: Trail mode 1 (candle) เดิมขยับ SL ทุกแท่งไม่ว่าสีอะไร แก้ให้เลื่อนเฉพาะแท่งฝั่งเดียวกันที่ปิดล่าสุด (BUY=แท่งเขียว, SELL=แท่งแดง) — แก้ `Strategy.py`
- 2026-07-01 v1.0.55: Trend Filter เพิ่ม mode ใหม่ HH/HL structure (`trend_filter_mode=1`) แทน EMA50 อย่างเดียว — backtest ยืนยันดีกว่า EMA50 (+39% R ใน 6 เดือน) ตั้งเป็น default — แก้ `Strategy.py`, `database.py`, `backtest.py`, frontend types/StrategyView
- 2026-07-01 v1.0.53-55: OB/FVG entry (`check_structure_entry`) เดิมเข้าได้ไม่ว่า OB/FVG ห่างจาก active zone แค่ไหน (บั๊ก: SELL เข้าตอนราคาอยู่ใน Bullish OB ไกลจาก SBR zone 124 จุด) เพิ่ม `max_ob_zone_atr` (default 5.0) ข้าม signal ถ้า OB/FVG center ห่างจากขอบ active zone เกิน N×ATR — แก้ `Strategy.py`, `database.py`, `backtest.py`, frontend
- 2026-06-30: UI ปรับจาก Glassmorphism (ม่วง/เขียว gradient) → Minimal Dark Slate (`#131722` พื้น, `#1C2233` card, border บาง 0.07 opacity) ตามคำขอ "เทาตัดเทาเข้ม" — ลบ RO skin mode ออกทั้งหมดจากโค้ด — แก้ `frontend/src/index.css`, `Sidebar.tsx`, `Login.tsx`, `SettingsView.tsx`, `App.tsx`, ลบ `useSkin.ts`

## Analysis Findings (ยังไม่ implement — รอการตัดสินใจ)
- **Timeframe M5 vs M15**: tick-mode 4 เดือน — M5/M5 กำไรรวมมากกว่า ($711 vs $315) แต่ M15/M15 expectancy/ไม้ดีกว่า (+0.894R vs +0.660R) และ DD ต่ำกว่าครึ่ง (-6.1R vs -12.4R) การผสม TF ข้ามกัน (เช่น M15 zone/M5 entry) แย่กว่าใช้ TF เดียวล้วนเสมอ — **สรุป: อยู่ M5 เดิมตามที่ user เลือก (2026-07-01)**
- **Entry timing**: เข้าที่ราคาปัจจุบัน (tick.bid/ask) ทันทีหลัง signal ยืนยันจากแท่งปิด (row1) ไม่รอแท่งถัดไปปิดซ้ำ — เหมาะกับ zone-retest/breakout style ที่ signal หมดอายุเร็ว ยังไม่ได้ backtest เทียบกับ "รอปิดแท่งถัดไป"

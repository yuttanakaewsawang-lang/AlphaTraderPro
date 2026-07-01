# Alpha Trader Pro — Architecture Overview

**AI-powered trading bot** — SMC (Smart Money Concepts) strategy + AI Review gate + backtesting engine

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    📱 FRONTEND (React/TypeScript)                │
│  Sidebar | Dashboard | Strategy | AI Review | Backtest | History │
│  (Tailwind CSS v4 + Lucide icons)                                │
└─────────────────────────┬──────────────────────────────────────┘
                          │ HTTP (axios)
                          │ JSON REST API
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│                  ⚙️ BACKEND (FastAPI + Python)                   │
│  • app.py — REST endpoints + WebSocket live prices              │
│  • Strategy.py — SMC zone detection + entry signals             │
│  • ai_strategy.py — AI Review gate (Ollama or stats-only)       │
│  • backtest.py — Tick-replay backtester + dryruns               │
│  • database.py — Schema + SQL queries (SQLite3)                 │
│  • filters.py — Trading sessions + news events                  │
│  • notifications.py — Discord alerts                            │
│  • version.py — Auto-update manifest                            │
└─────────────────────────┬──────────────────────────────────────┘
                          │ SQL (INSERT/SELECT)
                          │ File I/O (trading_data.db)
                          ↓
┌──────────────────────────────────────────────────────────────────┐
│                    📊 DATABASE (SQLite)                          │
│  %APPDATA%\AlphaTraderPro\trading_data.db                        │
│  • strategy_config — per-symbol settings                        │
│  • backtest_trades — tick-replay results                        │
│  • live_pattern_outcomes — pattern stats from live              │
│  • running_state — resume on startup                            │
│  • other: zones, order_blocks, FVGs, equity_history...          │
└──────────────────────────────────────────────────────────────────┘

External connections:
  🖥️  MT5 (MetaTrader5) ← pull prices/symbols/account/execute trades
  🔔 Discord ← alert on zone breaks, retest, AI decision, MT5 disconnect
  🌐 GitHub Releases ← download exe updates + version.json manifest
  🤖 Ollama (optional) ← qwen3 model for AI Review (if enabled)
```

---

## 📁 File Structure & Responsibilities

### **Root Level**
```
D:\ProjeckEA\
├── run_app.py                 # 🚀 Entry point: start FastAPI + open browser
├── run_app.spec               # PyInstaller spec (bundle into exe)
├── version.py                 # 📌 APP_VERSION + UPDATE_MANIFEST_URL
│
├── Strategy.py                # 🎯 SMC strategy engine
├── ai_strategy.py             # 🤖 AI Review decision gate
├── backtest.py                # 📊 Tick-replay backtester
├── database.py                # 💾 SQLite schema + queries
├── filters.py                 # 🕒 Trading sessions + news windows
├── notifications.py           # 🔔 Discord webhook
├── main.py                    # MT5 connection utilities
│
├── backend/
│   └── app.py                 # FastAPI server: 60+ endpoints
│
├── frontend/                  # React/TypeScript UI
│   ├── src/
│   │   ├── components/        # 🎨 React views
│   │   │   ├── DashboardView.tsx      # KPI + agent pipeline
│   │   │   ├── StrategyView.tsx       # Chart + config + positions
│   │   │   ├── BacktestView.tsx       # Backtester UI + dryrun
│   │   │   ├── AIReviewView.tsx       # AI decision log
│   │   │   ├── HistoryView.tsx        # Trade history + patterns
│   │   │   ├── Sidebar.tsx            # Nav + running status + version
│   │   │   └── ...
│   │   ├── types/strategy.ts  # TypeScript interfaces
│   │   ├── api.ts             # axios instance
│   │   └── index.css          # Design tokens (.lux-* classes)
│   ├── dist/                  # 📦 Build output (bundled frontend)
│   └── package.json           # npm dependencies + build scripts
│
├── installer/
│   ├── AlphaTraderPro.iss     # 📦 Inno Setup installer script
│   └── Output/                # Generated .exe installer
│
└── dist/                      # 🔧 PyInstaller output
    └── AlphaTraderPro.exe     # Standalone executable (frontend embedded)
```

---

## 🔄 Data Flow (Request → Response)

### **User clicks "Start Auto Trade"**
```
Frontend (StrategyView)
  └─→ api.post("/api/strategy/start?symbol=EURUSD")
      └─→ Backend (app.py)
          ├─ Load config from DB: strategy_config
          ├─ Create Strategy + SMCStrategy instances
          ├─ Start MT5 tick listener (WebSocket)
          ├─ Add symbol to running_state table (persist)
          └─→ Response: { success: true }
      ← Frontend updates UI: "RUNNING"
```

### **MT5 sends tick → signal detected**
```
Backend tick listener (asyncio)
  └─→ Strategy.execute_logic(tick)
      ├─ Detect SMC zone break/retest
      ├─ Check trading session filter (UTC→UTC+7)
      ├─ Check news window (±minutes)
      ├─ Check portfolio DD (kill switch)
      ├─ Generate entry signal {type, pattern, price}
      └─→ review_signal(signal, config)
          ├─ Call ai_strategy.stats_only_decision()
          │  └─ Query: pattern stats (backtest + live)
          │  └─ Check: combined_expectancy > 0? (R-weighted)
          │  └─ Return: APPROVE or REJECT
          ├─ If APPROVE → execute trade
          │  ├─ MT5.Buy/Sell(lot, price, SL, TP)
          │  └─ Log to live_pattern_outcomes
          └─ If REJECT → skip, try next
```

### **User runs Backtest**
```
Frontend (BacktestView)
  └─→ api.post("/api/backtest/run", {
        symbol, start_date, end_date, 
        spread, commission,
        simulate_review: true          # ← dry-run AI gate
      })
      └─→ Backend (backtest.py)
          ├─ Query: all bars OHLC (UTC→broker time)
          ├─ Iterate bars + simulate entries
          ├─ For each entry: _simulate_managed_trade()
          │  ├─ Tick replay: hit SL/TP? gap guard? managed close?
          │  └─ Record: profit, R, duration
          ├─ If simulate_review=true:
          │  ├─ For each trade: get_pattern_stats(exclude_month=current)
          │  ├─ Call stats_only_decision()
          │  └─ Mark trade APPROVE/REJECT
          └─→ Response: {
                trades: [...],
                total_profit, total_r, win_rate,
                review: {approved, rejected, filtered_profit}
              }
      ← Frontend: compare before/after filter
```

### **User checks for update**
```
Frontend (Sidebar)
  ├─→ api.get("/api/version")  → "1.0.0"
  └─→ api.get("/api/update/check")
      └─→ Backend
          ├─ Fetch: https://raw.githubusercontent.com/.../version.json
          ├─ Parse: {version: "1.0.1", url: "...", notes: "..."}
          ├─ Compare: is_newer("1.0.1", "1.0.0")? → True
          └─→ Response: {
                current: "1.0.0",
                latest: "1.0.1",
                has_update: true,
                url: "...",
                notes: "..."
              }
      ← Frontend: show "Update v1.0.1" button (gold, pulsing)

User clicks "Update v1.0.1"
  └─→ api.post("/api/update/apply")
      └─→ Backend
          ├─ Download exe from GitHub Releases
          ├─ Write: %APPDATA%\AlphaTraderPro\update\AlphaTraderPro_new.exe
          ├─ Spawn: apply_update.bat (detached process)
          │  ├─ Wait 2s for app to close
          │  ├─ Move new exe over old exe
          │  └─ Start app again
          └─→ Response: {success: true}
      ← App closes → updater applies swap → app restarts ✨
```

---

## 🎯 Key Components

### **Frontend (React)**
| Component | Purpose | State |
|-----------|---------|-------|
| **DashboardView** | KPI + agent pipeline (structure→SMC→AI→exec→mgmt→portfolio) | zone, account, positions, review log |
| **StrategyView** | Chart (TradingView Lite) + config editor + active positions | timeframe, zone, config, positions |
| **BacktestView** | Backtest runner + dryrun AI review + equity curve | results, trade log, spread/commission |
| **AIReviewView** | AI decision history + stats | review log, approval/rejection counts |
| **HistoryView** | All live trades + pattern tags (ZONE/FVG/OB) + Symbol | trades, pagination |
| **Sidebar** | Nav + account info + running symbols + version + update button | symbol, running status, version |

### **Backend (FastAPI)**
| Module | Key Functions | Database Tables |
|--------|---------------|-----------------|
| **app.py** | `POST /start`, `POST /stop`, `GET /account`, `POST /trade`, `POST /backtest/run`, `GET /update/check`, `POST /update/apply` | (queries via database.py) |
| **Strategy.py** | `execute_logic()` — detect zones, generate signals, apply filters | (external state only) |
| **ai_strategy.py** | `review_signal()` — gate on expectancy, call Ollama if enabled | (reads from backtest_trades, live_pattern_outcomes) |
| **backtest.py** | `run_backtest()` — tick replay, trailing/BE/partial TP, dry-run AI gate | backtest_trades (insert results) |
| **database.py** | `get_pattern_stats()`, `insert_trade()`, `get_config()`, `set_config()` | strategy_config, backtest_trades, live_pattern_outcomes, etc. |
| **filters.py** | `in_active_session()`, `in_news_window()`, `next_news_event()` | (hardcoded data) |
| **notifications.py** | `send_discord_notification()` | (external Discord webhook) |

### **Database Schema** (SQLite)
```sql
strategy_config
  ├─ symbol, timeframe, strategy_id
  ├─ [CONFIG]: enable_*_entry, risk_percent, use_breakeven, ...
  ├─ [AI Review]: enable_ai_review, final_score_override, min_review_samples
  ├─ [Filters]: trade_sessions, news_filter_minutes
  ├─ [Trailing]: trail_trigger_pct, breakeven_pct, partial_tp_trigger_pct
  └─ [Portfolio]: max_portfolio_drawdown_pct, retrain_interval_days

backtest_trades
  ├─ id, symbol, entry_time, entry_price, exit_time, exit_price
  ├─ lot, profit, r (risk-multiple), duration, signal_type, pattern
  └─ review (APPROVE/REJECT from dry-run)

live_pattern_outcomes
  ├─ symbol, pattern, signal_type, win (0/1), r
  └─ (accumulates win-rate + R-average for pattern stats)

running_state
  ├─ symbol
  └─ (tracks which symbols auto-trade is on; cleared on stop-all)

Other tables: zones, order_blocks, fvgs, equity_history, ai_review_log, ...
```

---

## 🔐 Security & Isolation

| Concern | Solution |
|---------|----------|
| **MT5 credentials** | Encrypted via DPAPI (Windows only); tied to user/machine |
| **DB location** | Moves to `%APPDATA%` when frozen → safe on Program Files |
| **Multi-symbol config** | Per-row in strategy_config; loadedSymbolRef guard prevents overwrites |
| **Backtest data leakage** | AI dryrun excludes current month → no self-fulfilling prophecy |
| **Auto-update** | .exe signed (optional); manifest from GitHub (public, checksummed if needed) |

---

## 🚀 Deployment

### **Distribution**
1. **Installer**: `AlphaTraderPro-Setup-1.0.0.exe` (Inno Setup)
   - Installs to: `C:\Program Files\AlphaTraderPro` (user tier, no admin)
   - Data: `%APPDATA%\AlphaTraderPro\` (user-writable)
2. **Standalone exe**: `AlphaTraderPro.exe` (from dist/)
   - Portable; carries frontend + Python + all deps

### **Updates (Auto-Update)**
1. Increment `APP_VERSION` in [version.py](version.py)
2. `pyinstaller run_app.spec` → build new exe
3. Upload exe to GitHub Releases (tag `v1.0.1`)
4. Update `version.json` on repo:
   ```json
   {
     "version": "1.0.1",
     "url": "https://github.com/yuttanakaewsawang-lang/AlphaTraderPro/releases/download/v1.0.1/AlphaTraderPro.exe",
     "notes": "Fixed: ..."
   }
   ```
5. User sees "Update v1.0.1" button in Sidebar → clicks → auto-installs + restarts

---

## 🛠️ Development Workflow

### **Local Setup**
```bash
# Backend
python -m venv venv
source venv/Scripts/activate  # Windows
pip install -r requirements.txt
python run_app.py  # Starts FastAPI on :8000, opens http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev  # Vite dev server :3000 (HMR)
```

### **Build**
```bash
# Frontend
npm run build  # → dist/

# Backend (exe)
pyinstaller run_app.spec  # → dist/AlphaTraderPro.exe

# Installer
"C:\Program Files\Inno Setup 7\ISCC.exe" installer/AlphaTraderPro.iss
# → installer/Output/AlphaTraderPro-Setup-1.0.0.exe
```

---

## 📊 Key Decisions

| Decision | Rationale |
|----------|-----------|
| **SQLite (not PostgreSQL)** | Portable; data stays local; single-user app |
| **Expectancy-based AI gate** | R-weighted filtering (not win-rate) matches high-RR strategies |
| **Dry-run AI Review** | Stats-only fast check; exclude current month to prevent leakage |
| **Tick replay (not bar-range)** | Precise SL/TP/trailing simulation; slow but mirrors live |
| **Session filtering on UTC** | Converted via broker offset; consistent across timezones |
| **Discord alerts (not email)** | Real-time, clickable, no spam folder |
| **Inno Setup (not NSIS/MSI)** | Simple, Unicode support, active maintenance |

---

## 📞 Common Questions

**Q: Where is my data stored?**
- `%APPDATA%\AlphaTraderPro\trading_data.db` (Windows) — persists across updates

**Q: Can I share my config?**
- ❌ No — MT5 credentials are encrypted per machine (DPAPI)
- ✅ You can export backtest results + strategy config as JSON (future feature)

**Q: How does AI Review differ from dry-run?**
- **Enable AI Review**: Calls Ollama (qwen3) + human judgment
- **Simulate AI Review** (backtest): Stats-only (expectancy gate) + simulates live review without Ollama

**Q: Can I run multiple symbols?**
- ✅ Yes — each symbol has own config (strategy_config table)
- Running state persists; auto-resume on startup

**Q: What if MT5 disconnects?**
- 🔴 Badge turns red in Sidebar + Discord alert
- ❌ Auto-trade pauses; restart MT5 + click START again

---

Generated: 2026-06-17 | Version: 1.0.0

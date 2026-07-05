"""ชุดข้อความแจ้งเตือน Discord สไตล์ Breaking News — สลับสุ่มไม่ซ้ำ"""
import random
from datetime import datetime


def _pick(pool: list[str]) -> str:
    return random.choice(pool)


def _now() -> str:
    return datetime.now().strftime("%H:%M")


# ── ONLINE / OFFLINE ──────────────────────────────────────────────────────────

def msg_online() -> str:
    return _pick([
        f"🟢 **BREAKING** | Apollo Auto Trade กลับมาแล้ว! ตลาดรอด้วยความหวาดผวา [{_now()}]",
        f"🚀 **ON AIR** | บอทตื่นแล้ว! ใครกล้าสู้กับตลาดวันนี้? [{_now()}]",
        f"⚡ **LIVE** | ระบบ Online เรียบร้อย — เงินจะเดินหรือหยุดอยู่ที่นี่ [{_now()}]",
        f"🎯 **ALERT** | Apollo Auto Trade พร้อมล่าแล้ว ตลาดไม่รู้ตัวหรอก [{_now()}]",
        f"💻 **SYSTEM UP** | บอทออนไลน์แล้ว ใครกลัวก็หลีกทาง [{_now()}]",
    ])


def msg_offline() -> str:
    return _pick([
        f"🔴 **BREAKING** | Apollo Auto Trade ออฟไลน์แล้ว — ตลาดหายใจได้แล้วนะ [{_now()}]",
        f"💤 **SIGN OFF** | บอทปิดตัวแล้ว ไปนอนพักก่อน เดี๋ยวค่อยมาใหม่ [{_now()}]",
        f"🛑 **OFF AIR** | ระบบปิดแล้ว ใครจะเทรดต่อ… ระวังด้วยนะ [{_now()}]",
        f"🌙 **SHUTDOWN** | Apollo Auto Trade ออกไปพักแล้ว ฝากตลาดไว้กับคุณ [{_now()}]",
        f"👋 **BYE** | บอทวางไม้แล้ว บัญชีวันนี้เป็นยังไงบ้าง? [{_now()}]",
    ])


# ── HEARTBEAT (30 นาที) ───────────────────────────────────────────────────────

def msg_heartbeat(balance: float, equity: float, running: list[str], positions: int) -> str:
    sym_txt = ", ".join(running) if running else "ไม่มี"
    pos_txt = f"{positions} ไม้" if positions else "ยังไม่มีไม้"
    diff = equity - balance
    diff_txt = f"+{diff:.2f}" if diff >= 0 else f"{diff:.2f}"

    return _pick([
        f"📡 **STATUS REPORT** [{_now()}]\n"
        f"Balance `{balance:,.2f}` · Equity `{equity:,.2f}` ({diff_txt})\n"
        f"รัน: {sym_txt} · {pos_txt} · บอทยังอยู่ ไม่ได้หนีไปไหน",

        f"🔭 **MARKET WATCH** [{_now()}]\n"
        f"บัญชี `{balance:,.2f}` | Floating `{diff_txt}` | {pos_txt}\n"
        f"Symbol: {sym_txt} — ยังวิ่งอยู่เต็มๆ",

        f"📊 **LIVE UPDATE** [{_now()}]\n"
        f"Equity `{equity:,.2f}` (จาก `{balance:,.2f}`) · {pos_txt}\n"
        f"บอทนั่งจ้องกราฟอยู่นะ ไม่ได้ไปไหน · รัน: {sym_txt}",

        f"🤖 **BOT CHECK-IN** [{_now()}]\n"
        f"ยังอยู่ครับ! Balance `{balance:,.2f}` Float `{diff_txt}`\n"
        f"{pos_txt} · ดูแล: {sym_txt}",

        f"📰 **BREAKING (ไม่ได้ breaking หรอก)** [{_now()}]\n"
        f"บอทยังมีชีวิตอยู่ · Equity `{equity:,.2f}` · {pos_txt}\n"
        f"รัน {sym_txt} · ถ้าไม่ได้รับข้อความนี้ค่อยตกใจ",
    ])


def msg_heartbeat_no_mt5() -> str:
    return _pick([
        f"⚠️ **ALERT** [{_now()}] แอปยังอยู่ แต่ MT5 หายไปไหน? ใครเห็นบ้าง",
        f"🔍 **MISSING** [{_now()}] MT5 ไม่ตอบสนอง — บอทกำลังตามหาอยู่",
        f"📵 **CONNECTION LOST** [{_now()}] MT5 เงียบ… ไม่ใช่สัญญาณดี",
        f"😶 **AWKWARD** [{_now()}] แอปพร้อม แต่ MT5 ไม่อยู่ ใครลืมเปิดหรือเปล่า?",
    ])


# ── MT5 CONNECTION ────────────────────────────────────────────────────────────

def msg_mt5_connected() -> str:
    return _pick([
        "🔌 **RECONNECTED** | MT5 กลับมาแล้ว! บอทกลับมาล่าได้ตามปกติ",
        "⚡ **BACK ONLINE** | MT5 ต่อได้แล้ว — เสียไปนานแค่ไหนนะ?",
        "✅ **MT5 LIVE** | การเชื่อมต่อกลับมาแล้ว บอทพร้อมทำงานเต็มที่",
        "🎉 **SIGNAL RESTORED** | MT5 online อีกครั้ง — ตลาดรู้สึกตัวได้แล้ว",
    ])


def msg_mt5_disconnected() -> str:
    return _pick([
        "⚠️ **CONNECTION LOST** | MT5 หายไปแล้ว บอทกำลังรอการเชื่อมต่อใหม่",
        "📵 **OFFLINE** | MT5 ขาดการเชื่อมต่อ — ออเดอร์จะหยุดจนกว่าจะกลับมา",
        "🔴 **SIGNAL DOWN** | MT5 ไม่ตอบสนอง บอทนั่งรออยู่อย่างอดทน",
        "😤 **NO SIGNAL** | MT5 หลุดแล้ว ใครลากสายหรือเปล่า?",
    ])


# ── ALGO TRADING ──────────────────────────────────────────────────────────────

def msg_algo_enabled() -> str:
    return _pick([
        "✅ **ALGO ON** | AutoTrading เปิดแล้ว — บอทพร้อมยิงออเดอร์เต็มที่!",
        "🟢 **GREEN LIGHT** | Algo Trading กลับมาแล้ว ไฟเขียวส่งออเดอร์ได้",
        "🚦 **GO** | AutoTrading เปิด บอทกลับมาทำงานแบบเต็มโหมด",
        "⚡ **ACTIVE** | Algo Trading ON — ใครอยู่ฝั่งตรงข้ามระวังตัวด้วย",
    ])


def msg_algo_disabled() -> str:
    return _pick([
        "🚫 **ALGO OFF** | AutoTrading ถูกปิด — บอทส่งออเดอร์ไม่ได้จนกว่าจะเปิด MT5",
        "🔴 **BLOCKED** | Algo Trading ปิดแล้ว ไปเปิด AutoTrading ใน MT5 ด่วน!",
        "⛔ **HALT** | ส่งออเดอร์ไม่ได้แล้ว — ลืมเปิด Algo Trading หรือเปล่า?",
        "😑 **LOCKED** | AutoTrading ปิด บอทนั่งดูกราฟเฉยๆ โดยไม่ทำอะไรได้เลย",
    ])


# ── BOT START / STOP ──────────────────────────────────────────────────────────

def msg_bot_started(symbol: str) -> str:
    return _pick([
        f"▶️ **GO LIVE** | {symbol} เริ่มต้นแล้ว บอทจ้องกราฟอยู่ ระวังตัวด้วย",
        f"🎯 **HUNTING** | {symbol} เปิดตัวแล้ว กำลังมองหา setup ที่ใช่",
        f"🚀 **LAUNCHED** | บอท {symbol} ออกล่าแล้ว ตลาดจะสู้ได้ไหม?",
        f"⚡ **ACTIVE** | {symbol} online บอทพร้อมเทรดเต็มโหมด",
        f"👁️ **WATCHING** | {symbol} เริ่มแล้ว บอทนั่งจ้องกราฟแบบไม่กะพริบ",
    ])


def msg_bot_stopped(symbol: str) -> str:
    return _pick([
        f"⏹️ **OFF** | {symbol} หยุดแล้ว บอทวางไม้ชั่วคราว",
        f"🛑 **PAUSED** | {symbol} หยุดทำงาน รอคำสั่งต่อไป",
        f"😴 **SLEEPING** | {symbol} ปิดตัวแล้ว บอทไปนอนพักก่อน",
        f"🏁 **STOPPED** | {symbol} หยุดแล้ว ผลลัพธ์เป็นยังไงบ้าง?",
    ])


# ── SELF-HEAL ─────────────────────────────────────────────────────────────────

def msg_selfheal_restart(symbol: str, attempt: int, max_attempts: int) -> str:
    return _pick([
        f"🔄 **AUTO-FIX** | {symbol} พัง — รีสตาร์ทอัตโนมัติ ({attempt}/{max_attempts}) บอทจะสู้ไม่ยอมแพ้",
        f"🛠️ **SELF-HEAL** | {symbol} มีปัญหา กำลังรีสตาร์ทตัวเอง (ครั้งที่ {attempt}/{max_attempts})",
        f"♻️ **REBOOT** | {symbol} ค้างแล้ว! เปิดใหม่เลย ({attempt}/{max_attempts}) — ไม่ต้องเป็นห่วง",
        f"💪 **RETRY** | {symbol} ล้มแล้วลุกขึ้นมาใหม่เลย (ครั้งที่ {attempt}/{max_attempts})",
    ])


def msg_selfheal_failed(symbol: str, max_attempts: int) -> str:
    return _pick([
        f"🚨 **SOS** | {symbol} รีสตาร์ทครบ {max_attempts} ครั้งแล้วยังพัง!! ผู้ดูแลเข้ามาด่วน!",
        f"🆘 **NEED HUMAN** | {symbol} แก้เองไม่ได้แล้ว รีสตาร์ทครบ {max_attempts} ครั้ง — ผู้ดูแลช่วยที!",
        f"🔴 **CRITICAL** | {symbol} ล้มเหลวซ้ำ {max_attempts} ครั้ง ถึงเวลาที่คนต้องเข้ามาดูแล้ว",
        f"😱 **MAYDAY** | {symbol} สู้ไม่ไหวแล้ว! ลอง {max_attempts} ครั้งก็ยังพัง ผู้ดูแลรีบมาด่วน!!",
    ])


def msg_selfheal_mt5_reconnected() -> str:
    return _pick([
        "🔌 **AUTO-FIX** | MT5 เชื่อมต่อใหม่สำเร็จ ระบบกลับมาแล้ว",
        "✅ **SELF-HEAL** | MT5 กลับมาเองแล้ว บอทฟื้นขึ้นมาได้",
        "⚡ **RECOVERED** | MT5 reconnect สำเร็จ — ไม่ต้องตกใจแล้ว",
    ])


# ── ERRORS ────────────────────────────────────────────────────────────────────

def msg_strategy_error(symbol: str, error: str) -> str:
    short_err = str(error)[:80]
    return _pick([
        f"⚠️ **ERROR** | {symbol} เจอปัญหา: `{short_err}`",
        f"🐛 **BUG ALERT** | {symbol} มีปัญหา — `{short_err}`",
        f"❌ **FAILED** | {symbol} error: `{short_err}`",
    ])


# ── PORTFOLIO KILL SWITCH ─────────────────────────────────────────────────────

def msg_portfolio_kill(reason: str) -> str:
    return _pick([
        f"🚨 **EMERGENCY STOP** | หยุดทุก symbol อัตโนมัติ! เหตุผล: {reason}",
        f"🛑 **KILL SWITCH** | ปิดหมดทุกตัวแล้ว! {reason} — ตรวจสอบบัญชีด่วน",
        f"💥 **FULL STOP** | Kill switch ทำงาน! {reason} รีบเช็คบัญชีเลย!",
    ])


# ── UPDATES ──────────────────────────────────────────────────────────────────

def msg_update_full(version: str) -> str:
    return _pick([
        f"🚀 **MAJOR UPDATE** | กำลังอัปเดต v{version} แอปจะรีสตาร์ทอัตโนมัติ รอแป๊บนึง",
        f"⬆️ **UPGRADING** | v{version} กำลังติดตั้ง — แอปจะหายไปสักครู่แล้วกลับมาใหม่",
        f"🔄 **RESTARTING** | อัปเดต v{version} รีสตาร์ทอัตโนมัติ บอทจะกลับมาไว",
    ])


# ── AUTO RETRAIN ──────────────────────────────────────────────────────────────

def msg_retrain_done(symbol: str) -> str:
    return _pick([
        f"🧠 **AI UPDATE** | {symbol} เทรนใหม่เสร็จแล้ว — AI Review อัปเดตแล้ว",
        f"🔁 **RETRAINED** | {symbol} ฝึกตัวเองใหม่เรียบร้อย สถิติสดใหม่",
        f"📈 **LEARNING** | {symbol} เรียนรู้จากตลาดอีกรอบ — AI Review พร้อมแล้ว",
    ])


# ── MANUAL TRADE ─────────────────────────────────────────────────────────────

def msg_manual_trade(order_type: str, symbol: str, lot: float, price: float) -> str:
    return _pick([
        f"🖐️ **MANUAL** | {order_type} {symbol} Lot `{lot}` @ `{price}` — เทรดมือเอง",
        f"👤 **HUMAN TRADE** | ผู้ดูแลเปิด {order_type} {symbol} `{lot}` lot @ `{price}`",
        f"🎮 **OVERRIDE** | Manual {order_type} {symbol} · Lot {lot} · Entry {price}",
    ])

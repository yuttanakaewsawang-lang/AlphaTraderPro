# ระบบ Auto-Update สำหรับ Python + React Desktop App (PyWebView + FastAPI)

เอกสารนี้อธิบายระบบอัปเดตออนไลน์แบบครบวงจร ตั้งแต่ manifest, backend API, frontend UI, bat updater, จนถึง release script สำหรับนำไปใช้กับ project อื่นที่มี stack เดียวกัน

---

## Stack ที่ใช้

- **Backend**: Python + FastAPI + PyInstaller (single exe)
- **Frontend**: React + TypeScript + Vite (build เป็น `dist/` bundle ไว้ใน exe)
- **Window**: PyWebView (แสดง React ผ่าน webview)
- **Release**: GitHub Releases + gh CLI

---

## ภาพรวมการทำงาน

```
[โปรแกรม]  →  เช็ค version.json บน GitHub
           →  มีเวอร์ชันใหม่ → แสดงปุ่ม "อัปเดต vX.X.X"
           →  กดอัปเดต → ดาวน์โหลด exe ใหม่ (SHA256 verify)
           →  เปิด bat window → ปิดตัวเอง → bat สลับ exe → เปิดโปรแกรมใหม่ → bat ปิด
```

มี 2 โหมด:
- **Full update** (`patch_only: false`) — สลับ exe ทั้งไฟล์ ใช้เมื่อ Python หรือ logic เปลี่ยน
- **Patch update** (`patch_only: true`) — แตก zip ทับ `dist/` เท่านั้น ใช้เมื่อแก้ UI อย่างเดียว ไม่ต้องรีสตาร์ท

---

## ไฟล์ที่เกี่ยวข้อง

```
project/
├── version.py          # APP_VERSION + UPDATE_MANIFEST_URL
├── version.json        # manifest สำหรับ push ขึ้น GitHub (public)
├── backend/app.py      # API endpoints: /api/update/check, /api/update/apply
├── frontend/src/components/Sidebar.tsx  # UI ปุ่มเช็ค/อัปเดต
└── release.ps1         # script ออก release อัตโนมัติ
```

---

## 1. version.py — ข้อมูลเวอร์ชันของแอป

```python
import os

APP_NAME = "MyApp"
APP_VERSION = "1.0.0"

UPDATE_MANIFEST_URL = os.environ.get(
    "MY_APP_UPDATE_URL",
    "https://raw.githubusercontent.com/<user>/<repo>/refs/heads/main/version.json",
)

def _parse(v):
    parts = []
    for p in str(v).strip().lstrip("v").split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])

def is_newer(remote, local=APP_VERSION):
    return _parse(remote) > _parse(local)
```

---

## 2. version.json — manifest บน GitHub (public repo)

```json
{
  "version": "1.0.1",
  "patch_only": false,
  "url": "https://github.com/<user>/<repo>/releases/download/v1.0.1/MyApp.exe",
  "sha256": "ABC123...",
  "notes": "สรุปสิ่งที่เปลี่ยนแปลง"
}
```

| field | ความหมาย |
|-------|-----------|
| `version` | เวอร์ชันล่าสุด (semver) |
| `patch_only` | `true` = แตก zip ทับ dist เท่านั้น, `false` = สลับ exe |
| `url` | URL ดาวน์โหลดไฟล์ (exe หรือ zip) |
| `sha256` | checksum ของไฟล์ (ป้องกันไฟล์เสียหาย) |
| `notes` | หมายเหตุแสดงในโปรแกรม |

---

## 3. Backend API (FastAPI)

เพิ่มใน `backend/app.py`:

```python
import urllib.request, json, hashlib, subprocess, threading, asyncio
import os, sys, shutil
from version import APP_VERSION, UPDATE_MANIFEST_URL, is_newer

DATA_DIR = os.path.join(os.environ.get("APPDATA", ""), "MyApp")


# --- Helper functions ---

def _fetch_manifest():
    req = urllib.request.Request(UPDATE_MANIFEST_URL, headers={"User-Agent": "MyApp"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _download_file(url, dest_path, expected_sha256=None):
    req = urllib.request.Request(url, headers={"User-Agent": "MyApp"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest_path, "wb") as f:
        f.write(resp.read())
    if expected_sha256:
        h = hashlib.sha256()
        with open(dest_path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        actual = h.hexdigest()
        if actual.lower() != str(expected_sha256).lower():
            os.remove(dest_path)
            raise ValueError(f"checksum ไม่ตรง: คาดว่า {expected_sha256}, ได้ {actual}")
    return dest_path


def _download_update(url, expected_sha256=None):
    dest_dir = os.path.join(DATA_DIR, "update")
    os.makedirs(dest_dir, exist_ok=True)
    new_path = os.path.join(dest_dir, "MyApp_new.exe")
    return _download_file(url, new_path, expected_sha256)


def _apply_patch(url, expected_sha256=None):
    """Patch update: แตก zip ทับ DATA_DIR/dist — ไม่ต้องรีสตาร์ท
    zip structure: dist/index.html, dist/assets/..."""
    dest_dir = os.path.join(DATA_DIR, "update")
    os.makedirs(dest_dir, exist_ok=True)
    zip_path = os.path.join(dest_dir, "patch.zip")
    _download_file(url, zip_path, expected_sha256)

    extract_dir = os.path.join(dest_dir, "patch_extracted")
    if os.path.exists(extract_dir):
        shutil.rmtree(extract_dir)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)

    src_dist = os.path.join(extract_dir, "dist")
    if os.path.isdir(src_dist):
        dst_dist = os.path.join(DATA_DIR, "dist")
        if os.path.exists(dst_dist):
            shutil.rmtree(dst_dist)
        shutil.copytree(src_dist, dst_dist)

    os.remove(zip_path)
    shutil.rmtree(extract_dir, ignore_errors=True)


def _spawn_updater(new_path):
    """เขียน bat → ปิด exe เก่า → สลับ exe → เปิดใหม่ → รอโปรแกรมขึ้น → ปิด bat"""
    target = sys.executable
    exe_name = os.path.basename(target)  # เช่น MyApp.exe
    log_path = os.path.join(DATA_DIR, "update", "update_log.txt")
    bat_path = os.path.join(DATA_DIR, "update", "apply_update.bat")
    bat = (
        "@echo off\r\n"
        "title MyApp Updater\r\n"
        f'echo [UPDATE] Starting updater > "{log_path}"\r\n'
        "echo Installing update, please wait...\r\n"
        "timeout /t 3 /nobreak >nul\r\n"
        f'taskkill /F /IM "{exe_name}" >nul 2>&1\r\n'
        "timeout /t 2 /nobreak >nul\r\n"
        "echo Copying new file...\r\n"
        "set RETRY=0\r\n"
        ":move_retry\r\n"
        f'move /Y "{new_path}" "{target}" >nul 2>&1\r\n'
        "if errorlevel 1 (\r\n"
        "  set /a RETRY+=1\r\n"
        f'  echo [UPDATE] Move failed retry %RETRY% >> "{log_path}"\r\n'
        "  if %RETRY% lss 10 (timeout /t 2 /nobreak >nul & goto move_retry)\r\n"
        f'  start "" "{new_path}"\r\n'
        "  goto wait_launch\r\n"
        ")\r\n"
        f'echo [UPDATE] Success, launching >> "{log_path}"\r\n'
        "echo Launching new version...\r\n"
        f'start "" "{target}"\r\n'
        ":wait_launch\r\n"
        "echo Waiting for app to start...\r\n"
        ":wait_loop\r\n"
        f'tasklist /FI "IMAGENAME eq {exe_name}" 2>nul | find /I "{exe_name}" >nul\r\n'
        "if errorlevel 1 (timeout /t 1 /nobreak >nul & goto wait_loop)\r\n"
        f'echo [UPDATE] App started >> "{log_path}"\r\n'
        "echo Update complete! Closing...\r\n"
        "timeout /t 2 /nobreak >nul\r\n"
        'del "%~f0"\r\n'
    )
    with open(bat_path, "w", encoding="ascii") as f:
        f.write(bat)
    CREATE_NEW_CONSOLE = 0x00000010 | 0x00000200
    subprocess.Popen(["cmd", "/c", bat_path], creationflags=CREATE_NEW_CONSOLE, close_fds=True)


# --- API Endpoints ---

@app.get("/api/update/check")
async def update_check():
    if not UPDATE_MANIFEST_URL:
        return {"configured": False, "current": APP_VERSION}
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, _fetch_manifest)
    except Exception as e:
        return {"configured": True, "current": APP_VERSION, "error": str(e)}
    latest = data.get("version")
    return {
        "configured": True,
        "current": APP_VERSION,
        "latest": latest,
        "has_update": bool(latest and is_newer(latest)),
        "url": data.get("url"),
        "notes": data.get("notes"),
    }


@app.post("/api/update/apply")
async def update_apply():
    if not UPDATE_MANIFEST_URL:
        raise HTTPException(status_code=400, detail="Update URL not configured")
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, _fetch_manifest)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cannot fetch manifest: {e}")

    url = data.get("url")
    new_version = data.get("version", "")
    if not url or not is_newer(new_version):
        return {"success": False, "message": "No new update"}

    patch_only = data.get("patch_only", False)

    if patch_only:
        try:
            await loop.run_in_executor(None, _apply_patch, url, data.get("sha256"))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Patch failed: {e}")
        return {"success": True, "patch_only": True, "message": f"Updated to {new_version}"}
    else:
        if not getattr(sys, "frozen", False):
            raise HTTPException(status_code=400, detail="Full update only works on .exe")
        try:
            new_path = await loop.run_in_executor(None, _download_update, url, data.get("sha256"))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Download failed: {e}")
        _spawn_updater(new_path)
        threading.Timer(1.0, lambda: os._exit(0)).start()
        return {"success": True, "patch_only": False, "message": f"Installing {new_version}, restarting..."}
```

### Static files — serve `dist/` จาก `%APPDATA%` ก่อน (รองรับ patch update)

```python
import sys, os
from fastapi.staticfiles import StaticFiles

DATA_DIR = os.path.join(os.environ.get("APPDATA", ""), "MyApp")

def _get_dist_dir():
    # 1. patch ที่ผู้ใช้ได้รับมา (อยู่ใน %APPDATA%)
    appdata_dist = os.path.join(DATA_DIR, "dist")
    if os.path.isdir(appdata_dist):
        return appdata_dist
    # 2. bundled ใน exe (PyInstaller)
    if getattr(sys, "_MEIPASS", None):
        mei_dist = os.path.join(sys._MEIPASS, "dist")
        if os.path.isdir(mei_dist):
            return mei_dist
    # 3. dev mode
    return os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

app.mount("/", StaticFiles(directory=_get_dist_dir(), html=True), name="static")
```

---

## 4. Frontend UI (React + TypeScript)

เพิ่มใน component ที่ต้องการแสดงปุ่มอัปเดต (เช่น Sidebar):

```tsx
import api from '../api';  // axios instance ที่ใช้ baseURL: window.location.origin

interface UpdateInfo {
  configured: boolean;
  current: string;
  latest?: string;
  has_update?: boolean;
  notes?: string;
  error?: string;
}

// State
const [update, setUpdate] = useState<UpdateInfo | null>(null);
const [checking, setChecking] = useState(false);
const [updating, setUpdating] = useState(false);
const [updateStatus, setUpdateStatus] = useState<'idle' | 'latest' | 'available' | 'error'>('idle');

// เช็คอัปเดต
const checkUpdate = async () => {
  setChecking(true);
  setUpdateStatus('idle');
  try {
    const res = await api.get('/api/update/check');
    setUpdate(res.data);
    if (res.data.error) setUpdateStatus('error');
    else if (res.data.has_update) setUpdateStatus('available');
    else setUpdateStatus('latest');
  } catch {
    setUpdateStatus('error');
  } finally {
    setChecking(false);
  }
};

// กดอัปเดต
const applyUpdate = async () => {
  if (!confirm('ดาวน์โหลดและติดตั้งเวอร์ชันใหม่?')) return;
  setUpdating(true);
  try {
    const res = await api.post('/api/update/apply');
    if (res.data.patch_only) {
      window.location.reload();  // patch = reload หน้าเท่านั้น
    }
    // full update = exe จะปิดตัวเอง แล้วเปิดใหม่อัตโนมัติ
  } catch (err: any) {
    alert(`อัปเดตไม่สำเร็จ: ${err.response?.data?.detail || err.message}`);
    setUpdating(false);
  }
};

// เช็คอัปเดตอัตโนมัติเมื่อเปิดโปรแกรม
useEffect(() => { checkUpdate(); }, []);
```

```tsx
{/* JSX — ปุ่มเช็ค/อัปเดต */}
<div className="flex items-center justify-between">
  <span className="text-xs text-gray-500">v{update?.current ?? '—'}</span>

  {update?.has_update ? (
    <div className="flex flex-col items-end gap-0.5">
      <button onClick={applyUpdate} disabled={updating}
        className="text-xs font-medium text-yellow-400 hover:text-yellow-300 disabled:opacity-50 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        {updating ? 'กำลังติดตั้ง…' : `อัปเดต v${update.latest}`}
      </button>
      {update.notes && (
        <span className="text-[10px] text-gray-500 text-right max-w-[140px]">
          {update.notes}
        </span>
      )}
    </div>
  ) : (
    <button onClick={checkUpdate} disabled={checking}
      className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40">
      {checking ? 'กำลังเช็ค…' : 'ตรวจสอบอัปเดต'}
    </button>
  )}
</div>

{/* Badge สถานะ */}
{updateStatus === 'latest' && (
  <div className="text-[10px] text-green-400">✓ เวอร์ชันล่าสุดแล้ว</div>
)}
{updateStatus === 'error' && (
  <div className="text-[10px] text-red-400">✗ เช็คอัปเดตไม่ได้</div>
)}
```

---

## 5. api.ts — ใช้ window.location.origin แทน hardcode port

```typescript
// frontend/src/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: window.location.origin,  // รองรับ dynamic port จาก PyWebView
});

export default api;
```

---

## 6. Dynamic Port (run_app.py)

PyWebView เปิด webview ที่ชี้ไป FastAPI server โดยตรง ถ้า port 8000 ถูกใช้อยู่จะ error:

```python
import socket

def _find_free_port(start=8000, end=8099):
    for port in range(start, end + 1):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    raise RuntimeError("No free port found in range 8000-8099")

_PORT = _find_free_port()
_SERVER_URL = f"http://127.0.0.1:{_PORT}"

# เปิด PyWebView ชี้ไป server URL
# window = webview.create_window("MyApp", _SERVER_URL, ...)
# uvicorn.run(app, host="127.0.0.1", port=_PORT)
```

Frontend ใช้ `window.location.origin` จึงได้ port ที่ถูกต้องเสมอ ไม่ต้อง hardcode

---

## 7. release.ps1 — script ออก release อัตโนมัติ

ต้องติดตั้ง [gh CLI](https://cli.github.com) และ login ครั้งแรก:
```powershell
echo "github_pat_xxxx..." | gh auth login --with-token
```

```powershell
# release.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$Notes
)

Set-Location "D:\MyProject"

# อ่าน + เพิ่มเลข PATCH อัตโนมัติ
$verLine = Get-Content "version.py" | Where-Object { $_ -match 'APP_VERSION\s*=' }
$currentVer = ($verLine -replace '.*=\s*"([^"]+)".*', '$1').Trim()
$parts = $currentVer.Split('.')
$parts[2] = [string]([int]$parts[2] + 1)
$newVer = $parts -join '.'

Write-Host ">> Releasing v$newVer" -ForegroundColor Cyan

# 1. อัปเดต version.py
(Get-Content "version.py") -replace "APP_VERSION\s*=\s*`"[^`"]+`"", "APP_VERSION = `"$newVer`"" |
    Set-Content "version.py" -Encoding UTF8

# 2. Build exe
pyinstaller run_app.spec
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

# 3. SHA256
$sha256 = (Get-FileHash "dist\MyApp.exe" -Algorithm SHA256).Hash

# 4. อัปเดต version.json
$manifest = [ordered]@{
    version    = $newVer
    patch_only = $false
    url        = "https://github.com/<user>/<repo>/releases/download/v$newVer/MyApp.exe"
    sha256     = $sha256
    notes      = $Notes
}
$manifest | ConvertTo-Json | Set-Content "version.json" -Encoding UTF8

# 5. Git push
git add version.json
git commit -m "release: v$newVer"
git push origin main

# 6. สร้าง GitHub Release + แนบ exe
gh release create "v$newVer" "dist\MyApp.exe#MyApp.exe" --title "v$newVer" --notes $Notes

Write-Host "Done! Release v$newVer is ready." -ForegroundColor Green
```

**วิธีใช้ทุกครั้ง:**
```powershell
.\release.ps1 -Notes "สิ่งที่เปลี่ยนแปลง"
```

---

## 8. .gitignore — ป้องกัน source code รั่ว

```gitignore
# Source code สำคัญ — ห้าม push
backend/app.py
main.py
run_app.py
run_app.spec
version.py
strategy.py
database.py

# Build output
build/
dist/
__pycache__/
*.db

# Frontend build (bundle อยู่ใน exe แล้ว)
frontend/dist/
node_modules/
```

> **หมายเหตุ**: `version.json` ต้อง push ได้ (public) เพื่อให้โปรแกรมเช็คอัปเดตได้  
> `version.py` ต้องอยู่ใน `.gitignore` เพราะมี logic ภายใน

---

## 9. โครงสร้าง DATA_DIR (%APPDATA%\MyApp\)

```
%APPDATA%\MyApp\
├── myapp.db            # SQLite database
├── dist/               # patch update (override bundled dist)
│   ├── index.html
│   └── assets/
└── update/
    ├── MyApp_new.exe   # exe ใหม่ที่ดาวน์โหลดมา (ชั่วคราว)
    ├── patch.zip       # patch zip (ชั่วคราว)
    ├── apply_update.bat
    └── update_log.txt
```

---

## 10. ขั้นตอน Setup ครั้งแรก

1. สร้าง public GitHub repository
2. สร้าง Personal Access Token (Fine-grained):
   - Repository access: Only select repos → เลือก repo นี้
   - Permissions → Contents: **Read and write**
   - Expiration: No expiration
3. ติดตั้ง gh CLI: [cli.github.com](https://cli.github.com)
4. Login: `echo "github_pat_xxxx" | gh auth login --with-token`
5. Push `version.json` ขึ้น repo (ไม่ต้องสร้าง release ตอนแรก)
6. ตั้ง `UPDATE_MANIFEST_URL` ใน `version.py` ให้ชี้ไป raw URL ของ `version.json`

---

## สรุปขั้นตอนการออก Release แต่ละครั้ง

```
1. แก้โค้ด
2. .\release.ps1 -Notes "อธิบายการเปลี่ยนแปลง"
   → เพิ่มเลข version อัตโนมัติ
   → build exe
   → คำนวณ SHA256
   → push version.json ขึ้น GitHub
   → สร้าง release + แนบ exe
3. ผู้ใช้เปิดโปรแกรม → กดตรวจสอบอัปเดต → กดอัปเดต → โปรแกรม relaunch อัตโนมัติ
```

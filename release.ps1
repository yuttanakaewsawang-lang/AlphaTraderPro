# release.ps1 - Auto release AlphaTraderPro
# Usage:
#   .\release.ps1 -Notes "what changed"            # full exe update (~40MB)
#   .\release.ps1 -Notes "ui tweak" -Patch         # frontend-only patch (zip เล็ก, ไม่รีสตาร์ท)
# หมายเหตุ: -Patch ใช้ได้เฉพาะเมื่อแก้แค่ frontend (React/TS) เท่านั้น
#           ถ้าแก้ backend (Python) ต้อง full release เสมอ

param(
    [Parameter(Mandatory=$true)]
    [string]$Notes,
    [switch]$Patch
)

Set-Location "D:\ProjeckEA"
$env:PATH += ";C:\Program Files\GitHub CLI"

# Read current version from version.py
$verLine = Get-Content "version.py" | Where-Object { $_ -match 'APP_VERSION\s*=' }
if (-not $verLine) { Write-Error "Cannot find version in version.py"; exit 1 }
$currentVer = ($verLine -replace '.*=\s*"([^"]+)".*', '$1').Trim()

# Increment PATCH
$parts = $currentVer.Split('.')
$parts[2] = [string]([int]$parts[2] + 1)
$newVer = $parts -join '.'

$mode = if ($Patch) { "PATCH (frontend-only)" } else { "FULL (exe)" }
Write-Host ">> Releasing v$newVer  [$mode]" -ForegroundColor Cyan

# 1. Update version.py (เลขเวอร์ชันเดินหน้าเสมอ ทั้ง patch และ full กัน tag ชนกัน)
(Get-Content "version.py") -replace "APP_VERSION\s*=\s*`"[^`"]+`"", "APP_VERSION = `"$newVer`"" |
    Set-Content "version.py" -Encoding UTF8

# 2. Build frontend
Write-Host ">> Building frontend..." -ForegroundColor Yellow
Set-Location "D:\ProjeckEA\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }
Set-Location "D:\ProjeckEA"

if ($Patch) {
    # ---- PATCH MODE: zip เฉพาะ frontend/dist เป็น patch.zip (มี dist/ อยู่รากของ zip) ----
    Write-Host ">> Packing patch.zip..." -ForegroundColor Yellow
    $staging = "D:\ProjeckEA\build\patch_staging"
    if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
    New-Item -ItemType Directory -Force $staging | Out-Null
    Copy-Item -Recurse "D:\ProjeckEA\frontend\dist" (Join-Path $staging "dist")
    if (-not (Test-Path "D:\ProjeckEA\dist")) { New-Item -ItemType Directory -Force "D:\ProjeckEA\dist" | Out-Null }
    $asset = "D:\ProjeckEA\dist\patch.zip"
    if (Test-Path $asset) { Remove-Item -Force $asset }
    Compress-Archive -Path (Join-Path $staging "dist") -DestinationPath $asset
    $assetName = "patch.zip"
    $patchOnly = $true
} else {
    # ---- FULL MODE: build exe ----
    Write-Host ">> Building exe..." -ForegroundColor Yellow
    pyinstaller run_app.spec
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
    $asset = "D:\ProjeckEA\dist\AlphaTraderPro.exe"
    $assetName = "AlphaTraderPro.exe"
    $patchOnly = $false
}

# 3. SHA256
$sha256 = (Get-FileHash $asset -Algorithm SHA256).Hash
Write-Host ">> SHA256: $sha256" -ForegroundColor Gray

# 4. Update version.json
$manifest = [ordered]@{
    version    = $newVer
    patch_only = $patchOnly
    url        = "https://github.com/yuttanakaewsawang-lang/AlphaTraderPro/releases/download/v$newVer/$assetName"
    sha256     = $sha256
    notes      = $Notes
}
$json = $manifest | ConvertTo-Json
[System.IO.File]::WriteAllText("$PWD\version.json", $json, [System.Text.UTF8Encoding]::new($false))

# 5. Git commit + push
Write-Host ">> Pushing version.json..." -ForegroundColor Yellow
git add version.json
git add version.py
git commit -m "release: v$newVer"
if ($LASTEXITCODE -ne 0) { Write-Error "Git commit failed"; exit 1 }
git push origin main
if ($LASTEXITCODE -ne 0) { Write-Error "Git push failed"; exit 1 }

# 6. Create GitHub Release
Write-Host ">> Creating GitHub Release v$newVer..." -ForegroundColor Yellow
gh release create "v$newVer" "$asset#$assetName" --title "v$newVer" --notes $Notes
if ($LASTEXITCODE -ne 0) { Write-Error "Release creation failed"; exit 1 }

Write-Host ""
Write-Host "Done! Release v$newVer ($mode) is ready." -ForegroundColor Green

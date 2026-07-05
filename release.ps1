# release.ps1 - Auto release Apollo Auto Trade
# Usage:
#   .\release.ps1 -Notes "what changed"
# หมายเหตุ: single-file update เสมอ — build exe เต็มทุกครั้ง ไม่มี patch-only mode แยกแล้ว
#           (เดิมมี -Patch สำหรับ frontend-only แต่ทำให้ frontend ค้าง cache เก่าบน VPS ตอน copy exe มือ เลยตัดทิ้ง)

param(
    [Parameter(Mandatory=$true)]
    [string]$Notes
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

Write-Host ">> Releasing v$newVer" -ForegroundColor Cyan

# 1. Update version.py
(Get-Content "version.py") -replace "APP_VERSION\s*=\s*`"[^`"]+`"", "APP_VERSION = `"$newVer`"" |
    Set-Content "version.py" -Encoding UTF8

# 2. Build frontend
Write-Host ">> Building frontend..." -ForegroundColor Yellow
Set-Location "D:\ProjeckEA\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }
Set-Location "D:\ProjeckEA"

# 3. Build exe
Write-Host ">> Building exe..." -ForegroundColor Yellow
pyinstaller run_app.spec
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
$asset = "D:\ProjeckEA\dist\ApolloAutoTrade.exe"
$assetName = "ApolloAutoTrade.exe"

# 4. SHA256
$sha256 = (Get-FileHash $asset -Algorithm SHA256).Hash
Write-Host ">> SHA256: $sha256" -ForegroundColor Gray

# 5. Update version.json
$manifest = [ordered]@{
    version = $newVer
    url     = "https://github.com/yuttanakaewsawang-lang/AlphaTraderPro/releases/download/v$newVer/$assetName"
    sha256  = $sha256
    notes   = $Notes
}
$json = $manifest | ConvertTo-Json
[System.IO.File]::WriteAllText("$PWD\version.json", $json, [System.Text.UTF8Encoding]::new($false))

# 6. Git commit + push
Write-Host ">> Pushing version.json..." -ForegroundColor Yellow
git add version.json
git add version.py
git commit -m "release: v$newVer"
if ($LASTEXITCODE -ne 0) { Write-Error "Git commit failed"; exit 1 }
git push origin main
if ($LASTEXITCODE -ne 0) { Write-Error "Git push failed"; exit 1 }

# 7. Create GitHub Release
Write-Host ">> Creating GitHub Release v$newVer..." -ForegroundColor Yellow
gh release create "v$newVer" "$asset#$assetName" --title "v$newVer" --notes $Notes
if ($LASTEXITCODE -ne 0) { Write-Error "Release creation failed"; exit 1 }

Write-Host ""
Write-Host "Done! Release v$newVer is ready." -ForegroundColor Green

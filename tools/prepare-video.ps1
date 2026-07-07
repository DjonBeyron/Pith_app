# Подготовка видео фразы для ленты Pithy.
# Запускается через prepare-video.bat (перетащить видеофайл на bat).
# Делает <имя>-feed.mp4: 720x1280 (кадрирование по центру), 30 fps,
# H.264 (main) + AAC, CRF 24 (~4-6 МБ на 20 сек), +faststart.
param([string]$InputFile)

try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }

if (-not $InputFile) {
  Write-Host 'Перетащи видеофайл на prepare-video.bat.'
  exit 1
}
if (-not (Test-Path -LiteralPath $InputFile)) {
  Write-Host "Файл не найден: $InputFile"
  exit 1
}

# ffmpeg: сначала tools\ffmpeg\, потом PATH
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ffmpeg = Join-Path $root 'ffmpeg\ffmpeg.exe'
if (-not (Test-Path $ffmpeg)) { $ffmpeg = Join-Path $root 'ffmpeg\bin\ffmpeg.exe' }
if (-not (Test-Path $ffmpeg)) {
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd) { $ffmpeg = $cmd.Source }
  else {
    Write-Host 'ffmpeg не найден.'
    Write-Host 'Положи ffmpeg.exe в папку tools\ffmpeg\ (см. записку там)'
    Write-Host 'или установи: winget install --id Gyan.FFmpeg'
    exit 1
  }
}

$in  = Get-Item -LiteralPath $InputFile
$out = Join-Path $in.DirectoryName ($in.BaseName + '-feed.mp4')

Write-Host "Обрабатываю: $($in.Name)"
& $ffmpeg -y -hide_banner -loglevel warning -stats -i $in.FullName `
  -vf 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30' `
  -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 24 -g 60 `
  -c:a aac -b:a 96k -movflags +faststart `
  $out

if ($LASTEXITCODE -eq 0) {
  $mb = [math]::Round((Get-Item -LiteralPath $out).Length / 1MB, 1)
  Write-Host ''
  Write-Host "Готово: $out ($mb МБ)"
  Write-Host 'Загружай этот файл через кнопку видео в схеме модуля.'
} else {
  Write-Host ''
  Write-Host 'Ошибка обработки — смотри сообщение выше.'
  exit 1
}

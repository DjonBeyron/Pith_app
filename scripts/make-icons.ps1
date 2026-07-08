# Генерация иконок приложения (public/icons): лаймовый квадрат с чёрной
# молнией — как лого сплэша. iOS сам скругляет углы иконки, поэтому фон
# заливается в край. 180 — apple-touch-icon, 192/512 — manifest.
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

$lime = [System.Drawing.Color]::FromArgb(0xb6, 0xfe, 0x3b)
$ink  = [System.Drawing.Color]::FromArgb(0x0d, 0x15, 0x00)

# Молния из SVG лого (viewBox 96): контур в юнитах, центр ~(46,44), высота 40
$bolt = @(50, 24), @(32, 48), @(44, 48), @(42, 64), @(60, 40), @(48, 40)

foreach ($S in 180, 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap($S, $S)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear($lime)
  $k = $S * 0.6 / 40.0  # высота молнии = 60% иконки (внутри safe-зоны maskable)
  $pts = $bolt | ForEach-Object {
    New-Object System.Drawing.PointF(
      [float](($_[0] - 46) * $k + $S / 2.0),
      [float](($_[1] - 44) * $k + $S / 2.0))
  }
  $brush = New-Object System.Drawing.SolidBrush($ink)
  $g.FillPolygon($brush, [System.Drawing.PointF[]]$pts)
  $file = Join-Path $outDir ("icon-{0}.png" -f $S)
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $brush.Dispose()
  "OK $file"
}

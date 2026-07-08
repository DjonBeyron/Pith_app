# Генерация apple-touch-startup-image для Pithy: фон #0b0d10 + лого сплэша
# (скруглённый квадрат #b6fe3b с молнией #0d1500), повторяет SVG из index.html.
# Логотип 92 CSS px, центр логотипа на 19 CSS px выше центра экрана — как у
# flex-центрированного блока «лого + 16px + слово» сплэша.
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\public\splash'
New-Item -ItemType Directory -Force $outDir | Out-Null

# cssW x cssH @ dpr — портретные размеры iPhone
$devices = @(
  @(320, 568, 2), # SE 1
  @(375, 667, 2), # 6/7/8/SE2/SE3
  @(414, 736, 3), # 6+/7+/8+
  @(375, 812, 3), # X/XS/11 Pro/12-13 mini
  @(414, 896, 2), # XR/11
  @(414, 896, 3), # XS Max/11 Pro Max
  @(390, 844, 3), # 12/13/14
  @(428, 926, 3), # 12-13 Pro Max/14 Plus
  @(393, 852, 3), # 14 Pro/15/15 Pro/16
  @(430, 932, 3), # 14 Pro Max/15-16 Plus/15 Pro Max
  @(402, 874, 3), # 16 Pro/17
  @(440, 956, 3), # 16 Pro Max/17 Pro Max
  @(420, 912, 3)  # Air
)

$bg   = [System.Drawing.Color]::FromArgb(0x0b, 0x0d, 0x10)
$lime = [System.Drawing.Color]::FromArgb(0xb6, 0xfe, 0x3b)
$ink  = [System.Drawing.Color]::FromArgb(0x0d, 0x15, 0x00)

foreach ($d in $devices) {
  $cssW = $d[0]; $cssH = $d[1]; $dpr = $d[2]
  $W = $cssW * $dpr; $H = $cssH * $dpr
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear($bg)

  # Единица = 1 юнит viewBox(96) логотипа в пикселях устройства
  $u = 92.0 / 96.0 * $dpr
  $cx = $W / 2.0
  $cy = $H / 2.0 - 19.0 * $dpr   # центр логотипа чуть выше центра экрана
  $left = $cx - 48.0 * $u
  $top  = $cy - 48.0 * $u

  # Скруглённый квадрат: rect x=6 y=6 w=84 h=84 rx=24
  $x = $left + 6 * $u; $y = $top + 6 * $u; $s = 84 * $u; $r = 24 * $u
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, 2 * $r, 2 * $r, 180, 90)
  $path.AddArc($x + $s - 2 * $r, $y, 2 * $r, 2 * $r, 270, 90)
  $path.AddArc($x + $s - 2 * $r, $y + $s - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $path.AddArc($x, $y + $s - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $path.CloseFigure()
  $limeBrush = New-Object System.Drawing.SolidBrush($lime)
  $g.FillPath($limeBrush, $path)

  # Молния: path M13 2 L4 14 H10 L9 22 L18 10 H12 z в translate(24,20) scale(2)
  $pts = @(13, 2), @(4, 14), @(10, 14), @(9, 22), @(18, 10), @(12, 10) | ForEach-Object {
    New-Object System.Drawing.PointF(
      [float]($left + (24 + $_[0] * 2) * $u),
      [float]($top + (20 + $_[1] * 2) * $u))
  }
  $inkBrush = New-Object System.Drawing.SolidBrush($ink)
  $g.FillPolygon($inkBrush, [System.Drawing.PointF[]]$pts)

  $file = Join-Path $outDir ("startup-{0}x{1}.png" -f $W, $H)
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $path.Dispose(); $limeBrush.Dispose(); $inkBrush.Dispose()
  "OK $file"
}

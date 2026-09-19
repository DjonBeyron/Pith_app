// Как ВЫГЛЯДИТ волна голосового, без единого знания о том, что сейчас играет.
//
// Волна — один <canvas>, а не ~70 div-полосок (см. AudioWave.jsx). Замер на
// iPhone 16 Pro (урок trying, 24 голосовых): каждая полоска с will-change —
// свой слой GPU, к концу урока их было 1246, телефон грелся и лагала даже
// системная шторка. Canvas — один слой на сообщение, рисуется один раз и
// перерисовывается только когда зелёная заливка прогресса добегает до
// следующей полоски.

// Базовые высоты полос, пока настоящая волна не посчитана (или файла нет).
// Массив, а не генератор: набор подобран на глаз, чтобы неозвученный пузырь
// не выглядел ни ровным забором, ни случайным шумом
export const WAVE_H_BASE = [7,11,16,22,14,19,24,17,10,20,13,22,18,11,25,21,15,9,18,24,16,12,21,14,19,10,17,23,15,9,13,19,21,14,17,24,11,18,22,15,10,19,13,25,16,9,20,23,12,17]
export const BAR_W = 2, BAR_GAP = 2
export const ACCENT = '#b6fe3b'
const MUTED = '#2a2d35'

export function barCountFor(width) {
  return Math.max(8, Math.floor(width / (BAR_W + BAR_GAP)))
}

// Высота полоски i из count: огибающая ВСЕЙ записи (как в Telegram) — пик
// громкости внутри своего отрезка времени, а не один сэмпл (иначе короткий
// щелчок или пауза между словами решали бы, какой высоты полоска).
// wd — RMS-амплитуда 0..255 по кадрам (analyzeWaveform, 30 кадров/с)
function barAmp(wd, i, count) {
  if (!wd?.length) return WAVE_H_BASE[Math.floor(i / count * WAVE_H_BASE.length)] / 25
  const from = Math.floor(i / count * wd.length)
  const to   = Math.max(from + 1, Math.floor((i + 1) / count * wd.length))
  let peak = 0
  for (let k = from; k < to && k < wd.length; k++) if (wd[k] > peak) peak = wd[k]
  return Math.pow(peak / 255, 0.55)
}

// Рисует волну целиком: полоски снизу вверх, пройденные (до progress 0..1) —
// акцентным зелёным; greenAlpha < 1 — зелёный полупрозрачный поверх серого
// (затухание заливки в конце записи). Возвращает число полосок — по нему
// AudioWave решает, изменилось ли что-то видимое с прошлого кадра
export function drawAudioWave(canvas, waveData, progress = 0, greenAlpha = 1) {
  if (!canvas) return 0
  const dpr = window.devicePixelRatio || 1
  const w   = canvas.clientWidth
  const h   = canvas.clientHeight
  if (!w || !h) return 0
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr)
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph }
  const ctx   = canvas.getContext('2d')
  const count = barCountFor(w)
  const green = Math.floor(progress * count)
  ctx.clearRect(0, 0, pw, ph)
  ctx.save()
  ctx.scale(dpr, dpr)
  for (let i = 0; i < count; i++) {
    const barH = Math.max(2, barAmp(waveData, i, count) * h * 0.95)
    const isGreen = i < green
    ctx.beginPath()
    ctx.roundRect(i * (BAR_W + BAR_GAP), h - barH, BAR_W, barH, [2, 2, 1, 1])
    if (!isGreen || greenAlpha < 1) { ctx.fillStyle = MUTED; ctx.fill() }
    if (isGreen) {
      ctx.globalAlpha = greenAlpha
      ctx.fillStyle = ACCENT
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()
  return count
}

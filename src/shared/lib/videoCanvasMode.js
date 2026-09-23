import { perfFlags } from './perfFlags.js'

// Режим «видео через canvas» — обход «дымки» на Android. Часть Android
// (подтверждено на Mali-G72, Android 10, Chrome) выводит <video> с неверным
// диапазоном яркости (16–235 как 0–255): картинка светлее и бледнее. Метки
// цвета в файле (colr, SPS) этот вывод игнорирует, а та же картинка,
// нарисованная в canvas, — верная. Поэтому на Android кадры рисуются в
// canvas, <video> только декодирует (лента — useFeedVideoCanvas.js, уроки —
// videoMirror.js). iPhone и компьютеры показывают видео как обычно.
// DBG: videoNative — выключить на Android, videoCanvas — включить где угодно.
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')

export const VIDEO_CANVAS = !!perfFlags.videoCanvas || (isAndroid && !perfFlags.videoNative)

// Цена режима для DBG: сколько кадров нарисовано, сколько пропущено (видео
// показало кадр, а до canvas он не дошёл), время отрисовки на процессоре
const stats = { frames: 0, missed: 0, ms: 0, maxMs: 0 }

export function noteCanvasDraw(ms, missed = 0) {
  stats.frames++
  stats.missed += missed
  stats.ms += ms
  if (ms > stats.maxMs) stats.maxMs = ms
}

export function videoCanvasReport() {
  const mode = VIDEO_CANVAS ? `вкл${isAndroid ? ' (Android)' : ' (флаг)'}` : 'выкл'
  const all = stats.frames + stats.missed
  const pct = all ? ((stats.missed / all) * 100).toFixed(1) : '0'
  const avg = stats.frames ? (stats.ms / stats.frames).toFixed(2) : '0'
  return `canvas: ${mode}; кадров ${stats.frames}, пропущено ${stats.missed} (${pct}%), отрисовка ср ${avg} мс, макс ${stats.maxMs.toFixed(1)} мс`
}

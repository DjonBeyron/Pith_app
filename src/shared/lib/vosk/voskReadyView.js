// Что показать человеку, когда экрану нужен Vosk (мини-игра «Скажи вслух», дальше — любое место с голосом): чистая функция из двух источников правды —
// итога прогрева модели (voskRuntime.whenSettled: { ok } | { ok: false, reason: 'no-model' | 'failed' | 'timeout', text } | null — ещё идёт)
// и состояния тихой фоновой загрузки (voskBgStatus). Системное распознавание не подставляем (решение 20): модели нет — «нужно скачать», сбой — «не включилось».
// status: ready | preparing | need | downloading | waiting | error | failed. asked — человек уже нажал «Скачать».
import { fmtMb } from './voskDownload.js'

export const VOSK_SIZE_TEXT = '≈39 МБ'
export const NEED_TITLE = `Нужно скачать распознавание речи (${VOSK_SIZE_TEXT})`

const view = (status, extra = {}) => ({ status, ...extra })

export function readyView({ result, bg, asked = false }) {
  if (result?.ok) return view('ready')
  if (!result) return view('preparing')
  if (result.reason !== 'no-model') return view('failed', { text: result.text || '' })
  // Модели нет в кэше телефона
  if (bg.state === 'cached') return view('preparing') // докачалась прямо сейчас — прогрев пойдёт сам
  if (bg.state === 'downloading') return view('downloading', { pct: bg.pct, detail: bg.total > 0 ? `${fmtMb(bg.loaded)} из ${fmtMb(bg.total)}` : fmtMb(bg.loaded) })
  if (bg.state === 'error') return view('error', { text: bg.error || '' })
  if (asked && bg.state === 'other') return view('waiting', { text: 'Скачивание уже идёт в другом окне — подожди немного' })
  if (asked && bg.state === 'waiting') return view('waiting', { text: 'Нет сети — докачаем, как только она появится' })
  if (asked) return view('downloading', { pct: null, detail: '' }) // нажали, первый кусок ещё не пришёл
  return view('need')
}

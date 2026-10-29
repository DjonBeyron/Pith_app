// «Звуки игры»: путь одного звука награды от сырых байт до сохранённой настройки. Чистая логика без React (GameSfxPanel.jsx только рисует и держит состояние).
//   buildCandidate(bytes)  — mp3/wav/m4a → нормализация (обрезка тишины, RMS ≈ как у синтезированных мяу) → кандидат { wav, rms, peak, ms, previewUrl } для прослушивания;
//   saveCandidate(c)       — кандидат → R2 (r2-upload-url) → url в настройках устройства (rewardSound.js) и режим 'custom'.
import { normalizeToWav } from '../../../shared/lib/audioNormalize.js'
import { uploadSfxWav } from '../../../shared/lib/sfxApi.js'
import { setRewardUrl, setRewardSound } from '../../../shared/lib/rewardSound.js'

export const MAX_FILE_MB = 8 // защита от случайно выбранной песни/видео: короткому звуку хватает сотен килобайт

/** Годится ли файл для «своего звука»: звуковой тип или расширение wav/mp3/m4a, размер в пределах. Возвращает текст ошибки или null */
export function checkSoundFile(file) {
  if (!file) return 'Файл не выбран'
  const okType = /^audio\//.test(file.type || '') || /\.(wav|mp3|m4a|aac|ogg)$/i.test(file.name || '')
  if (!okType) return 'Нужен звуковой файл: wav, mp3 или m4a'
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Файл больше ${MAX_FILE_MB} МБ — для звука награды нужен короткий звук`
  return null
}

export async function buildCandidate(bytes) {
  const { wav, rms, peak, ms } = await normalizeToWav(bytes)
  const previewUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
  return { wav, rms, peak, ms, previewUrl }
}

export function dropCandidate(c) {
  if (c?.previewUrl) { try { URL.revokeObjectURL(c.previewUrl) } catch { /* уже свободна */ } }
}

export async function saveCandidate(c) {
  const url = await uploadSfxWav(c.wav)
  setRewardUrl(url)
  setRewardSound('custom')
  return url
}

/** Уровень кандидата для подписи: «−28 dBFS» */
export const dbfs = rms => (rms > 0 ? `${(20 * Math.log10(rms)).toFixed(1)} dBFS` : '—')

import { useEffect } from 'react'
import { startBackground, abortBackground } from './voskBackground.js'

export const RU_BG_DELAY_MS = 1500

// Русская модель Vosk (проход B «Встряхни память») раньше качалась только вручную (Админ → Голос): фоновый планировщик при старте приложения берёт одну английскую.
// Игрок на слабом Android видел «русской модели нет в кэше», и проход B шёл тапом (журнал 26.11, v3.3.378). Теперь, пока карточка гонки на экране (до старта игры), модель тихо
// докачивается в Cache Storage (в память НЕ грузим): те же условия тишины, что у английской (лента / видео / офлайн / экономия трафика), куски 2 МБ с паузами, докачка с места обрыва.
// Старт игры (on → false) останавливает загрузку: во время игры сеть и кадры не трогаем (уже скачанные куски остаются).
export function scheduleRuDownload(start = startBackground, abort = abortBackground) {
  const t = setTimeout(() => { start({ lang: 'ru', card: true }) }, RU_BG_DELAY_MS)
  return () => { clearTimeout(t); abort('ru') }
}

export function useRuModelBackground(on) {
  useEffect(() => (on ? scheduleRuDownload() : undefined), [on])
}

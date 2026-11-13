// Голос Пита для стенда громкости и прогона (v3.3.204; вынесено из GameVolumeLab.jsx): та же реплика, тот же декодер и нормализация, что в игре.
import { getCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { loadSoundBuffer } from '../../player/modules/rotate-phone/wordLaneBuffers.js'

export const PIT_ID = 'race_start' // озвучка Пита для стенда: стартовая реплика гонки (≈ 3,5 с), уже озвучена в игре
export const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' }
export const extOf = url => (/\.(mp3|m4a|wav|ogg)(\?|$)/i.exec(String(url)) ?? [])[1]?.toLowerCase() ?? 'mp3'

/** Голос Пита как в игре → { url, buffer, bytes } или null (реплика не озвучена) */
export async function loadPit() {
  const url = normalizeLines(await getCatLines())?.[PIT_ID]?.url
  if (!url) return null
  const bytes = await fetch(url).then(r => r.arrayBuffer()) // исходный файл озвучки: его же отдаёт кнопка «Отправить» (для сравнения в Telegram)
  const buffer = await loadSoundBuffer(`lab:${PIT_ID}`, () => bytes.slice(0))
  return { url, buffer, bytes }
}

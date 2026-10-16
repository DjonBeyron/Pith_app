import { pendingWordTexts, attachWordAudio } from '../../scene/v2/sceneWordSegments.js'
import { ensureWordAudio } from '../../../shared/lib/wordAudio/wordAudioEnsure.js'

// Прогрев озвучки слов для сцены-шаблона перед проигрыванием: слова-сегменты без аудио (sceneWordSegments) → один запрос
// в word_audio (ensureWordAudio) → если озвучка нашлась, apply(новая сцена) с аудио слов. Сцена без таких сегментов — ничего
// (и сеть не трогается). Не ждёт: лента показывает сцену сразу, слова «дозвучиваются» к моменту старта (запрос ~100 мс).
export function warmSceneWords(scene, apply, { ensure = ensureWordAudio } = {}) {
  const texts = pendingWordTexts(scene)
  if (!texts.length) return false
  ensure(texts).then(changed => {
    if (!changed) return
    const next = attachWordAudio(scene)
    if (next !== scene) apply(next)
  })
  return true
}

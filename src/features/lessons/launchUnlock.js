import { pLog } from '../../shared/lib/debug.js'
import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'
import { primeAudio } from '../../shared/lib/primedAudio.js'
import { unlockSceneAudioForLesson } from '../scene/v2/sceneAudioUnlock.js'

// Разблокировка звука в жесте запуска урока (iOS открывает аудио только жестом). КАЖДЫЙ шаг в своём try/catch: исключение в одном
// (например speechSynthesis в unlockSceneAudio на Safari) раньше обрывало обработчик тапа — кнопка «Начать/Продолжить» молча
// не срабатывала, урок не открывался и в логе не было ни строки. Теперь ошибка пишется в debug-лог, остальные шаги и сам старт идут дальше.
export function unlockSafely(nodes, steps = { preloadSounds, unlockAudio, primeAudio, unlockSceneAudioForLesson }) {
  for (const [name, fn] of Object.entries(steps)) {
    try { fn === steps.unlockSceneAudioForLesson ? fn(nodes) : fn() } catch (e) { pLog(`[launch] ОШИБКА разблокировки звука (${name}): ${e?.message ?? e}`) }
  }
}

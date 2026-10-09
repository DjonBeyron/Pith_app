import { cachedWordAudio } from '../../../../shared/lib/wordAudio/wordAudioApi.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'
import { playWord, stopWord } from '../../word-audio/wordAudioPlayer.js'

// «Послушать»: эталонное произношение из БАЗЫ ОЗВУЧКИ СЛОВ (та же, что у «Напечатай слово» и таблиц; её слова прогревает
// useLessonWordAudio по collectLessonWords). Своего звука и своих запросов у модуля нет.
const MAX_WORDS = 12

/**
 * Какие записи базы проиграть по очереди: вся фраза одной записью, если она есть; иначе ВСЕ её слова (если хоть
 * одного нет в базе — получилась бы дырявая фраза, лучше скрыть кнопку). [] — озвучки нет, кнопку не показываем.
 * lib — Map key → { url } (cachedWordAudio()); параметром для тестов.
 */
export function listenKeys(phrase, lib = cachedWordAudio()) {
  if (!lib) return []
  const has = key => !!key && !!lib.get(key)?.url
  const whole = wordKey(phrase)
  if (has(whole)) return [whole]
  const words = String(phrase ?? '').split(/\s+/).map(wordKey).filter(Boolean)
  return words.length > 0 && words.length <= MAX_WORDS && words.every(has) ? words : []
}

/** Проиграть записи по очереди. Возвращает stop(); onEnded зовётся один раз — когда доиграло или оборвали */
export function playListen(keys, { onEnded } = {}) {
  let stopped = false
  let finished = false
  const end = () => { if (finished) return; finished = true; onEnded?.() }
  const step = i => {
    if (stopped || i >= keys.length) { end(); return }
    // playWord сам глушит предыдущее слово; false — записи нет/беззвучный режим: просто заканчиваем
    if (!playWord(keys[i], { onEnded: () => { if (!stopped) step(i + 1) } })) end()
  }
  step(0)
  return () => { stopped = true; stopWord(); end() }
}

import { feedSamples, feedSilence } from './voskTail.js'
import { pLog } from '../debug.js'

// Прогрев распознавателя сразу после загрузки модели (v3.3.222). Журналы 3.3.217–221: ПЕРВОЕ слово игры не распознаётся («цель не услышана» при пике речи 0,11–0,25 и нормальной длине голоса), дальше слова идут. Модель
// «в памяти» после загрузки, но первое настоящее декодирование (создание KaldiRecognizer со словарём, первый прогон по звуку в воркере) холодное — первый заход тратит его на разогрев. Здесь: короткий распознаватель на
// двух словах, 0,6 с шумоподобного звука + 0,4 с тишины, итог запрашивается и выбрасывается, распознаватель удаляется. Всё в воркере библиотеки, главный поток не блокируется; сообщения воркера идут по порядку,
// поэтому следующий настоящий распознаватель создаётся уже на прогретом декодере. Ничего не бросает.
export const WARM_NOISE_MS = 600
export const WARM_SILENCE_MS = 400
export const WARM_REMOVE_MS = 2000

/** model — модель vosk-browser (createModel); words — пара слов её языка для словаря. → true, если прогрев отправлен */
export function warmRecognizer(model, words = ['yes', 'no'], { rate = 16000, log = msg => pLog(`[say-vosk] ${msg}`), setTimer = setTimeout } = {}) {
  try {
    if (typeof model?.KaldiRecognizer !== 'function') return false
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0
    const rec = new model.KaldiRecognizer(rate, JSON.stringify([...words, '[unk]']))
    const n = Math.round((rate * WARM_NOISE_MS) / 1000), noise = new Float32Array(n)
    for (let i = 0; i < n; i++) noise[i] = 0.06 * Math.sin(i * 0.11) * Math.sin(i * 0.0021) + 0.03 * Math.sin(i * 0.37) // «слог»: несущая с медленной огибающей и обертоном
    feedSamples(rec, noise, rate)
    feedSilence(rec, rate, WARM_SILENCE_MS)
    try { rec.retrieveFinalResult?.() } catch { /* итог не нужен */ }
    setTimer(() => { try { rec.remove?.() } catch { /* уже удалён */ } }, WARM_REMOVE_MS)
    try { log(`прогрев распознавателя отправлен за ${Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0)} мс (${words.join(', ')})`) } catch { /* журнал не мешает */ }
    return true
  } catch (e) {
    try { log(`прогрев распознавателя не вышел: ${e?.message ?? e}`) } catch { /* журнал не мешает */ }
    return false
  }
}

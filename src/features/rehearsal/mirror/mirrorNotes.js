// «Дубль и зеркало»: ОДНА заметка Пита по дублю — только по тому, что измерено (mirrorMeasure.js). Приоритет: потеряно слово > порядок > темп > пауза > громкость > лишнее слово > чисто.
// Пит говорит от первого лица, коротко, без оценок личности; тексты — черновик (утверждает владелец). Чистые функции.
import { TEMPO_DELTA, PAUSE_MIN_MS, LOUD_MIN } from './mirrorMeasure.js'

/** Запись не получилась (нет MediaRecorder, поток мёртв, пустой файл): экран показывает только диктора и эту заметку */
export const FAIL_NOTE = { key: 'fail', text: 'Запись не получилась — попробуем в следующий раз.' }

const q = s => `„${s}“`
const list = items => items.map(q).join(' и ')

/** «на четверть» / «на треть» / «вдвое» / «на N %» — на сколько ты быстрее диктора (d — доля, на которую речь короче) */
export function fasterBy(d) {
  if (Math.abs(d - 0.25) <= 0.04) return 'на четверть'
  if (Math.abs(d - 1 / 3) <= 0.04) return 'на треть'
  if (Math.abs(d - 0.5) <= 0.05) return 'вдвое'
  return `на ${Math.round(d * 100)} %`
}
/** То же для «медленнее» (d — доля, на которую речь длиннее) */
export function slowerBy(d) {
  if (Math.abs(d - 0.25) <= 0.04) return 'на четверть'
  if (Math.abs(d - 1 / 3) <= 0.04) return 'на треть'
  if (Math.abs(d - 0.5) <= 0.05) return 'в полтора раза'
  if (Math.abs(d - 1) <= 0.1) return 'вдвое'
  return `на ${Math.round(d * 100)} %`
}

/** Заметка «чисто» — две формулировки одного смысла (CONCEPT_REHEARSAL.md §8): выбирается rng-ом (поток от семени плана); без rng — первая, как раньше */
export const CLEAN_TEXTS = ['Порядок верный, темп мой. Чисто.', 'Всё на месте: порядок верный, темп как у меня. Чисто.']

/** Одна заметка: { key: 'missing' | 'order' | 'tempo' | 'pause' | 'loud' | 'extra' | 'clean' | 'fail', text }. rng — функция () => число из [0, 1) для выбора из вариантов «чисто» (нет — основной вариант) */
export function noteFor(measure, chunks = [], rng = null) {
  if (!measure) return FAIL_NOTE
  const { missing = [], orderOk = true, order = null, tempo = null, pauses = [], loud = null, extra = [] } = measure
  if (missing.length) {
    if (chunks.length && missing.length >= chunks.length) return { key: 'missing', text: 'Я почти не расслышал фразу — скажи её ещё раз, чуть громче.' }
    return { key: 'missing', text: `${list(missing)} ${missing.length > 1 ? 'потерялись' : 'потерялось'}.` }
  }
  if (!orderOk) return { key: 'order', text: order ? `${q(order.early)} прозвучало раньше ${q(order.late)}.` : 'Куски прозвучали не по порядку.' }
  if (tempo != null && tempo <= 1 - TEMPO_DELTA) return { key: 'tempo', text: `Ты быстрее меня ${fasterBy(1 - tempo)} — это нормально, но дай словам чуть больше места.` }
  if (tempo != null && tempo >= 1 + TEMPO_DELTA) return { key: 'tempo', text: `Ты медленнее меня ${slowerBy(tempo - 1)} — это нормально, но попробуй собраться плотнее.` }
  const long = pauses.filter(p => p.studentMs - p.dictorMs >= PAUSE_MIN_MS).sort((a, b) => b.studentMs - b.dictorMs - (a.studentMs - a.dictorMs))[0]
  if (long) return { key: 'pause', text: `Пауза перед ${q(long.before)} длиннее, чем у меня. Склей.` }
  if (loud != null && loud <= LOUD_MIN) return { key: 'loud', text: 'Тише, чем нужно для сцены.' }
  if (extra.length) return { key: 'extra', text: `${extra.length > 1 ? 'Лишние слова' : 'Лишнее слово'} ${extra.slice(0, 3).map(q).join(', ')} — в сцене ${extra.length > 1 ? 'их' : 'его'} нет.` }
  return { key: 'clean', text: CLEAN_TEXTS[rng ? Math.min(CLEAN_TEXTS.length - 1, Math.floor(rng() * CLEAN_TEXTS.length)) : 0] }
}

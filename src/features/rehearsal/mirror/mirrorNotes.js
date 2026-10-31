// «Дубль и зеркало»: ОДНА заметка Пита по дублю — только по тому, что измерено (mirrorMeasure.js). Приоритет: потеряно слово > порядок > темп > пауза > громкость > лишнее слово > чисто.
// Заметка двухслойная (v3.3.87, п. 13 владельца): ПИТ произносит короткую общую реплику (ключ каталога rh_note_*, noteLine.js; звучит после прослушивания через sayLine директора), а ТЕКСТ ПЛАШКИ между
// горизонтальными пилюлями «Пит» и «твоя фраза» — конкретика (какие слова потерялись, перед чем пауза). Пилюля note = { key, kind?, text }: kind уточняет реплику у missing (one | few | all) и tempo (fast | slow).
// Тексты плашки — без точек в конце (это подпись, не фраза); «чисто» — особая золотая плашка «Идеальное произношение!» (MirrorCompare.jsx, rehearsal-gold.css). Чистые функции.
import { TEMPO_DELTA, PAUSE_MIN_MS, LOUD_MIN } from './mirrorMeasure.js'

/** Запись не получилась (нет MediaRecorder, поток мёртв, пустой файл): экран показывает только диктора и эту заметку */
export const FAIL_NOTE = { key: 'fail', text: 'Запись не получилась, попробуем в другой раз' }

/** Текст золотой плашки «чисто» (восклицание можно: это подпись на экране, не озвучка) */
export const CLEAN_TEXT = 'Идеальное произношение!'

const q = s => `„${s}“`
const list = items => items.map(q).join(' и ')

/** Одна заметка: { key: 'missing' | 'order' | 'tempo' | 'pause' | 'loud' | 'extra' | 'clean' | 'fail', kind?, text } */
export function noteFor(measure, chunks = []) {
  if (!measure) return FAIL_NOTE
  const { missing = [], orderOk = true, order = null, tempo = null, pauses = [], loud = null, extra = [] } = measure
  if (missing.length) {
    if (chunks.length && missing.length >= chunks.length) return { key: 'missing', kind: 'all', text: 'Тебя я почти не расслышал, скажи чуть громче' }
    return { key: 'missing', kind: missing.length > 1 ? 'few' : 'one', text: `${list(missing)} ${missing.length > 1 ? 'потерялись' : 'потерялось'}` }
  }
  if (!orderOk) return { key: 'order', text: order ? `${q(order.early)} прозвучало раньше ${q(order.late)}` : 'Куски прозвучали не по порядку' }
  if (tempo != null && tempo <= 1 - TEMPO_DELTA) return { key: 'tempo', kind: 'fast', text: 'не торопись в произношении' }
  if (tempo != null && tempo >= 1 + TEMPO_DELTA) return { key: 'tempo', kind: 'slow', text: 'лучше не медлить' }
  const long = pauses.filter(p => p.studentMs - p.dictorMs >= PAUSE_MIN_MS).sort((a, b) => b.studentMs - b.dictorMs - (a.studentMs - a.dictorMs))[0]
  if (long) return { key: 'pause', text: `пауза перед ${q(long.before)}` }
  if (loud != null && loud <= LOUD_MIN) return { key: 'loud', text: 'в следующий раз говори громче, чтобы я тебя понял' }
  if (extra.length) return { key: 'extra', text: `лишнее: ${extra.slice(0, 3).map(q).join(', ')}` }
  return { key: 'clean', text: CLEAN_TEXT }
}

// «Момент слова в реплике»: когда в звучащей реплике начинается нужное слово, мс от РЕАЛЬНОГО начала её звука. Одна привязка на все события экзамена «по слову»:
//  • шкала появляется на слове «шкала» реплики boss_mia_look (bossScale.revealAtMs);
//  • Мия начинает уход с коробкой на слове «пока» реплики boss_mia_bye (useExamSpeech → событие bye, владелец 2026-11-25).
// Срок берётся из таймингов слов записи (line.words: [{ w, t, e }] — секунды в файле, line.duration — длина файла) и приводится к длине звука ms (по буферу); таймингов нет — по месту
// слова в тексте; слова в тексте нет — запасная доля fallback (null → срока нет). Заменили озвучку или текст — срок едет вместе со словом, чисел «под файл» нет.
const low = s => String(s ?? '').toLowerCase()
const LETTER = /[a-zа-яё0-9]/i

/** Где в тексте начинается слово с началом stem (совпадение внутри другого слова не считается); whole — слово целиком («пока», но не «покажет»); нет — −1 */
function textWordAt(text, stem, whole) {
  for (let i = text.indexOf(stem); i >= 0; i = text.indexOf(stem, i + 1)) if ((i === 0 || !LETTER.test(text[i - 1])) && (!whole || !LETTER.test(text[i + stem.length] ?? ' '))) return i
  return -1
}

/** line — запись реплики { text, words, duration }, ms — длина звука, stem — начало слова (без регистра), whole — нужно слово целиком. → мс от начала звука или null (слова нет и fallback не задан) */
export function wordAtMs(line, ms, stem, fallback = null, whole = false) {
  const s = low(stem), text = low(line?.text), bare = x => low(x?.w).replace(/^[^a-zа-яё0-9]+|[^a-zа-яё0-9]+$/gi, '')
  const w = (Array.isArray(line?.words) ? line.words : []).find(x => (whole ? bare(x) === s : bare(x).startsWith(s)))
  if (w && Number.isFinite(w.t) && line.duration > 0) return Math.round(ms * Math.min(1, Math.max(0, w.t / line.duration)))
  const at = textWordAt(text, s, whole)
  if (at >= 0) return Math.round(ms * at / text.length)
  return fallback == null ? null : Math.round(ms * fallback)
}

/** Плашка экзамена «Шкала памяти» (владелец 2026-11-25: «Мия говорит: эй, вы за экраном, это экзамен — только тут начинает появляться плашка»): на экране, пока Мия говорит реплику PLATE_LINE —
 *  от реального начала её звука до начала следующей реплики. До этого (реплика Пита из коробки, «Сиди тихо…» из-за края, прыжок Мии) плашки нет. talk — реплика Мии сейчас ({ id }) или null */
export const PLATE_LINE = 'boss_mia_look'
export const examPlateOn = talk => talk?.id === PLATE_LINE

/** Слово, на котором Мия начинает уход с коробкой: boss_mia_bye «Коробка мне ещё пригодится, пока» — на «пока»; у реплик без такого слова (boss_mia_mid) уход по концу реплики */
export const BYE_WORD = { boss_mia_bye: 'пока' }
/** Когда во время реплики id начать уход Мии, мс от начала звука; null — по концу реплики */
export const byeAtMs = (id, line, ms) => (BYE_WORD[id] ? wordAtMs(line, ms, BYE_WORD[id], null, true) : null)

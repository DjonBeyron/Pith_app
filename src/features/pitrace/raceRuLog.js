// Журнал слова прохода B игры «Встряхни память» («назови перевод», русская модель Vosk): ОДНА строка на слово, чтобы по журналу владельца было видно, что именно услышал распознаватель
// и почему пилюля не засчиталась. Строку пишет директор (useRaceActs.js) через общий журнал гонки (pLog «[race] …»); здесь — только сборка строки и учёт промахов слова. Чистые функции без React.
// Формат: «[ru] слово: meet ожидал: встретить услышал partial: встретить final: — уровень: 0.62 итог: зачёт».
//   итог: «зачёт» (после промахов — «зачёт после ошибки (…)»); «ошибка (сказано «…»)» — пилюля ушла, а распознаватель слышал другое слово; «не успел (…)» — пилюля ушла без слова:
//   голос был (уровень заливки не ниже VOICE_LEVEL), но слово не распознано, или голоса не было вовсе.

export const VOICE_LEVEL = 0.15 // заливка пилюли голосом выше этой — ученик что-то говорил

const q = t => (String(t ?? '').trim() ? String(t).trim() : '—')
const lvl = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—')
const heardList = list => list.map(h => `«${q(h)}»`).join(', ')

/** Итог слова: result 'claim' | 'fail'; misses — что слышал распознаватель на промахах этого слова; level — заливка пилюли (на зачёте — в миг зачёта, на «не успел» — самая полная) */
export function ruVerdict({ result, misses = [], level = 0 }) {
  if (result === 'claim') return misses.length ? `зачёт после ошибки (${heardList(misses)})` : 'зачёт'
  if (misses.length) return `ошибка (сказано ${heardList(misses)})`
  return (level ?? 0) >= VOICE_LEVEL ? 'не успел (голос был, слово не распознано)' : 'не успел (голоса не было)'
}

/** Строка журнала: word — английское слово (Пит его сказал), expected — перевод, который ждали, said — { partial, final } слушателя */
export function ruWordLine({ word, expected, said = {}, level, result, misses = [] }) {
  return `[ru] слово: ${q(word)} ожидал: ${q(expected)} услышал partial: ${q(said.partial)} final: ${q(said.final)} уровень: ${lvl(level)} итог: ${ruVerdict({ result, misses, level })}`
}

/** Учёт слова прохода B: start(idx) — Пит сказал слово (новая пилюля), miss(heard) — промах на ней, finish(...) → строка журнала (и учёт сброшен) или null, если слово не начиналось */
export function createRuJournal() {
  let cur = null
  return {
    start(idx) { cur = { idx, misses: [] } },
    miss(heard) { if (cur) cur.misses.push(heard ?? '') },
    finish({ idx, word, expected, said, level, result }) {
      if (!cur || (idx != null && cur.idx != null && idx !== cur.idx)) return null
      const line = ruWordLine({ word, expected, said, level, result, misses: cur.misses })
      cur = null
      return line
    },
  }
}

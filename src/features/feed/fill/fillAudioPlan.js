// Расписание склейки для «Дополни реплику»: играем озвучку реплики ДО целевого слова, вместо слова — «мяу», затем остаток.
// Чистая логика (секунды файла → шаги), без Audio и таймеров: проигрывает шаги fillAudio.js. Звука кота в проекте нет,
// поэтому «мяу» — это пауза MEOW_MS (350 мс) с подписью «мяу» на экране (стадия 'meow').
//   start/end — секунды файла, где слово начинается и кончается (из wordTimings реплики); end может быть неизвестен;
//   nextStart — начало следующего слова; durationSec — длина файла (если известна).
// → { steps: [{ kind: 'play', stage: 'before', from, to }, { kind: 'meow', stage: 'meow', ms }, { kind: 'play', stage: 'after', from, to: null }] }
//   или null, если начало слова неизвестно (тогда реплика остаётся текстом). Шаги «до» и «после» опускаются, если
//   слово первое/последнее. to: null — играть до конца файла.
export const MEOW_MS = 350
export const LEAD_GUARD_S = 0.03 // обрезаем до начала слова с запасом, чтобы не просочилось начало самого слова
export const MIN_PART_S = 0.05 // кусок короче — не играем (щелчок вместо звука)
export const LAST_WORD_S = 0.4 // слово без известного конца: столько секунд считаем его длиной

const num = v => typeof v === 'number' && Number.isFinite(v)

export function planFillAudio({ start, end = null, nextStart = null, durationSec = null, meowMs = MEOW_MS } = {}) {
  if (!num(start) || start < 0) return null
  const cut = Math.max(0, start - LEAD_GUARD_S)
  const resume = num(end) && end > start ? end : (num(nextStart) && nextStart > start ? nextStart : start + LAST_WORD_S)
  const steps = []
  if (cut > MIN_PART_S) steps.push({ kind: 'play', stage: 'before', from: 0, to: cut })
  steps.push({ kind: 'meow', stage: 'meow', ms: meowMs })
  if (!num(durationSec) || resume < durationSec - MIN_PART_S) steps.push({ kind: 'play', stage: 'after', from: resume, to: null })
  return { steps }
}

// Сколько всего длится склейка, мс (для подсказок и тестов); хвост без длины файла не считаем
export function planLengthMs(plan, durationSec = null) {
  let ms = 0
  for (const s of plan?.steps ?? []) {
    if (s.kind === 'meow') ms += s.ms
    else if (num(s.to)) ms += (s.to - s.from) * 1000
    else if (num(durationSec)) ms += Math.max(0, durationSec - s.from) * 1000
  }
  return Math.round(ms)
}

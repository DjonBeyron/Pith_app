// Заливка круга 2 «Скажи» (racePhraseScene.js): ЦЕЛЬ заливки широкой пилюли по состоянию слов и момент взлёта после итога. Чистые функции, время — аргументом; экран догоняет цель сам (wordLaneFillView.approachFillFast).
// ГРАНИЦЫ СЛОВ (2026-11-07, замечание владельца A: «линия заполнения должна встать точно между словами»): после k сказанных слов цель — не k/N, а граница edges[k−1] — середина зазора между словом k и k+1
// В ТЕКСТЕ НА ПИЛЮЛЕ (wordEdges по прямоугольникам <b> маски, racePhraseMaskView.edges); последнее слово — 100 %. Без DOM (тесты) или пока маска не измерена — доли 1/N.
// Каждое сказанное слово даёт СВОЮ ПОЛНУЮ долю сразу — и черновое (замечание B: «говорю быстро — заливается быстро, без остановок»; раньше черновое давало половину и полную только через 350 мс — ступеньки).
// ОТКАТ (2026-11-09): в проходе 1 черновое слово, выпавшее из услышанного по порядку, слушатель откатывает (onWord с gone — racePhraseSaid.js), и оно уходит из words — линия плавно отходит; проход 2 — без отката. «АВАНСА» НЕТ (2026-11-08, замечание владельца 5: «когда микрофон ловит шум, пилюля заполняется»):
// раньше первый непустой черновик давал 35 % первого слова, а шум даёт Vosk-черновик из любого слова словаря; теперь заливка — только по словам цели (onWord с номером слова фразы).
// Итог (замечание 6): после onPhrase цель — 100 %, кромка доезжает, и только когда дошла (+ FILL_HOLD_MS) — взлёт и зачёт; ожидание не дольше FILL_FINISH_MAX_MS (было 700 — замечание C: «думает около секунды»).
// ДОЕЗД (2026-11-10): экран идёт к 100 % не догоном, а за фиксированные LOCK_MS от того, что на нём было (wordLaneFillView.finishFill — как у пилюли слова), и щелчок / вспышка / взлёт — в кадре доезда
// (FILL_HOLD_MS = 0): путь «зачёт → хлопок» одинаковый при любой заливке (раньше 0–250 мс догона + 120 мс выдержки).

// ПРОДЛЕНИЕ ХОДА (2026-11-08, замечание владельца 4: «сказал три слова, пауза, итог без совпадения — пилюля ушла, а последнее слово пришло через 1,3 с»): пилюля дошла до края, итога нет,
// а в черновике уже ≥ GRACE_MIN слов цели — ход продлевается на LAST_WORD_GRACE_MS (пилюля замирает у нижней границы: pool.hold); итог за это время — обычный зачёт; нет — зачёт «нечисто» по черновику.
// ПРОХОД 1 ДОЛЬШЕ (2026-11-09, журнал владельца v3.3.176, «Nice to meet you» по слову с паузами ≈ 2 с: у края на 4-м слове, «you» начато через 1,9 с после края — 1,5 с не хватило):
// в проходе 1 (wbw), если ученик продвигается — новое слово цели не раньше GRACE_PROGRESS_MS до начала продления или во время него, — продление LAST_WORD_GRACE_WBW_MS. Скорость пилюль не меняем.
export const LAST_WORD_GRACE_MS = 1500
export const LAST_WORD_GRACE_WBW_MS = 3000
export const GRACE_PROGRESS_MS = 2500
export const GRACE_MIN = 0.75

/** Продлевать ли ход у края: lit — сколько слов цели услышано (и черновиком), n — слов во фразе */
export const graceDue = (lit, n) => n > 0 && lit / n >= GRACE_MIN - 1e-9

/** Длина продления: grace — когда началось, wbw — проход 1, last — когда впервые услышано самое позднее слово цели (null — ни одного) */
export const graceMs = ({ grace, wbw = false, last = null }) => (wbw && last != null && last >= grace - GRACE_PROGRESS_MS ? LAST_WORD_GRACE_WBW_MS : LAST_WORD_GRACE_MS)

/** Пилюля «Скажи» у нижней границы без итога: 'hold' — начать продление (пул держит), 'wait' — продление идёт, 'draft' — итог по черновику «нечисто», 'fail' — не успел. grace — когда началось (null — нет); wbw, last — см. graceMs */
export function edgeVerdict({ grace = null, t, lit, n, canHold, wbw = false, last = null }) {
  if (grace == null) return graceDue(lit, n) ? (canHold ? 'hold' : 'draft') : 'fail'
  return t - grace < graceMs({ grace, wbw, last }) ? 'wait' : 'draft'
}

// ПОСЛЕДНЕЕ СЛОВО БЕЗ ИТОГА (2026-11-09, журнал владельца: «пилюля заполнилась, но не улетала» — граница 1,00 по последнему слову, а зачёт через 1,2 с): услышанное последнее слово ведёт цель
// не к 100 %, а к LAST_WORD_CAP — кромка у самого края, но не упёрлась; 100 % — только по итогу фразы (done). Слушатель засчитывает договорённую фразу за 0–400 мс (racePhraseListen.saidThrough).
export const LAST_WORD_CAP = 0.97

export const FILL_HOLD_MS = 0         // заливка дошла до 100 % — щелчок и взлёт в том же кадре (было 120 мс выдержки: хлопок отставал от доезда)
export const FILL_FINISH_MAX_MS = 400 // потолок ожидания доезда после итога

/**
 * Границы слов в долях слоя кромки: rects — [{ left, right, top, bottom }] прямоугольники <b> слов по порядку, layer — { left, width } слоя, по которому едет кромка (translateX(v·100 %)).
 * Граница k (после слова k) — правый край слова k + половина зазора до слова k+1. Текст в две строки — «виртуальная одна строка»: слова и зазоры подряд (зазор на переносе — средний по строкам),
 * её длина ложится на ширину текста (от самого левого до самого правого края слов) — для одной строки это ровно середины зазоров. Последняя — 1. Нет размеров (не в DOM, скрыта) — null.
 */
export function wordEdges(rects, layer) {
  const n = rects?.length ?? 0
  if (!n || !(layer?.width > 0) || rects.some(r => !(r.right - r.left > 0))) return null
  const sameLine = (a, b) => Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < (a.bottom - a.top) / 2
  const gaps = rects.slice(1).map((r, i) => (sameLine(rects[i], r) ? Math.max(0, r.left - rects[i].right) : null))
  const known = gaps.filter(g => g != null)
  const mid = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0
  const gap = gaps.map(g => g ?? mid)
  const total = rects.reduce((s, r) => s + r.right - r.left, 0) + gap.reduce((a, b) => a + b, 0)
  const lo = Math.min(...rects.map(r => r.left)), span = Math.max(...rects.map(r => r.right)) - lo
  let run = 0
  return rects.map((r, i) => {
    if (i === n - 1) return 1
    run += r.right - r.left
    const x = lo + ((run + gap[i] / 2) / total) * span
    run += gap[i]
    return Math.min(1, Math.max(0, (x - layer.left) / layer.width))
  })
}

/** Где кромка после s сказанных слов (s может быть дробным): edges — границы (wordEdges) или null (доли 1/N) */
export function edgeAt(s, n, edges = null) {
  if (s <= 0) return 0
  if (s >= n) return 1
  if (!edges || edges.length !== n) return s / n
  const k = Math.floor(s), a = k ? edges[k - 1] : 0
  return a + (edges[k] - a) * (s - k)
}

// ПО ПОРЯДКУ (2026-11-09, журнал владельца v3.3.174, «Where are you from»: «where», «where you», «where from», потом «are» — линия прыгнула к 0,97 и стояла, фраза не засчитана): цель — граница
// после k, где k — длина НЕПРЕРЫВНОГО ПРЕФИКСА услышанных слов от первого (слова 0…k−1 все услышаны), а не число услышанных (решение владельца v3.3.171: «I» → после «I», «want» → после «want»).
// Слова «вперёд» запоминаются (зачёт, маска), но линию не двигают; пропуск закрылся — линия догоняет сразу до конца префикса. Подсказка — то же слово k (racePhraseMask.nextPeek).

/** Сколько слов подряд от первого услышано (words — Map или Set номеров слов; Map — по ключам) */
export function saidPrefix(words) {
  let k = 0
  while (words?.has?.(k)) k++
  return k
}

/** Цель заливки 0…1 (без итога — не выше LAST_WORD_CAP): words — Map номер слова цели → { full, at } (только слова фразы: шум и чужие слова сюда не попадают), n — слов во фразе, done — итог пришёл (доезд до 100 %), edges — границы слов на пилюле. Линия — по префиксу (saidPrefix) */
export function fillGoal({ words, n, done = false, edges = null }) {
  if (done) return 1
  return Math.min(LAST_WORD_CAP, edgeAt(saidPrefix(words), n || 1, edges))
}

/** Слово услышано (onWord): черновик запоминает время первого появления, подтверждение — full; все слова до него — подтверждены (их перекрыло следующее) */
export function markWord(words, index, draft, t) {
  const w = words.get(index)
  if (!w) words.set(index, { full: !draft, at: t })
  else if (!draft) w.full = true
  for (const [i, x] of words) if (i < index) x.full = true
}

/** Доезд после итога: fin = { at } — когда пришёл итог; shown — заливка на экране; onFull(t) — заливка впервые дошла до 100 %. Возвращает true, когда пора взлетать (дошла и подержалась, или кончился потолок) */
export function finishDue(fin, shown, t, onFull = null) {
  if (shown >= 1 - 1e-6 && fin.full == null) { fin.full = t; onFull?.(t) }
  return (fin.full != null && t - fin.full >= FILL_HOLD_MS) || t - fin.at >= FILL_FINISH_MAX_MS
}


// Два прохода фразы в круге 2 «Скажи» (CONCEPT_PHRASES.md, «Круг 2 «Скажи»: два прохода»; замечание владельца: «после ответа по словам та же пилюля выезжает ещё раз — повтори фразу без остановок»).
// Проход 1 — маска-кирпичики, можно по словам (зачёт ratio ≥ PHRASE_OK, «чисто» — все слова). Проход 2 — та же фраза открытым текстом: зачёт ratio ≥ PHRASE_OK, «чисто» — все слова И без остановок
// (паузы между соседними по времени словами ≤ PAUSE_MAX_MS); слова есть, но пауза длиннее — «с паузами» (засчитано, но нечисто). Время слова — когда сцена впервые услышала его (onWord, черновик или итог,
// по часам сцены): у слушателя Vosk меток слов нет (grammar-заходы без setWords). Здесь же — исход фразы для памяти по двум проходам и журнал. Чистые функции.
export const PAUSE_MAX_MS = 900

/** Наибольшая пауза между словами (мс): times — моменты первых услышанных слов (любой порядок); меньше двух слов — 0 */
export function maxPause(times) {
  const ts = [...(times ?? [])].filter(Number.isFinite).sort((a, b) => a - b)
  let max = 0
  for (let i = 1; i < ts.length; i++) max = Math.max(max, ts[i] - ts[i - 1])
  return Math.round(max)
}

/** Итог прохода 2 при зачёте: { ratio, clean, smooth, maxPause } — smooth: без остановок, clean: без остановок и все слова */
export function passTwoRes(ratio, times) {
  const gap = maxPause(times)
  const smooth = gap <= PAUSE_MAX_MS
  return { ratio, smooth, maxPause: gap, clean: smooth && ratio >= 1 }
}

/** Хвост строки журнала хода «Скажи»: «проход 1/2: …» не тут — тут итог: «чисто» / «нечисто» / «с паузами, макс. пауза 1500 мс» */
export function passNote(r, pass) {
  const pct = `слова ${Math.round((r?.ratio ?? 0) * 100)} %`
  if (!r?.ok) return `не успел, ${pct}`
  if (pass !== 2) return `верно, ${pct}${r.clean ? ', чисто' : ', нечисто'}`
  return `верно, ${pct}, ${!r.smooth ? 'с паузами' : r.clean ? 'чисто' : 'нечисто'}, макс. пауза ${r.maxPause ?? 0} мс`
}

/** Исход фразы по двум проходам: again — проход 1 не сказан; hard — что-то не чисто (проход 2 с паузами / нечисто / не сказан, или проход 1 нечисто); good — оба чисто. p2 нет — по проходу 1 */
export function passOutcome(p1, p2) {
  if (p1 && !p1.ok) return 'again'
  if (!p2) return p1?.clean ? 'good' : 'hard'
  return p1?.clean !== false && p2.ok && p2.clean ? 'good' : 'hard'
}

/**
 * События фраз → единицы для памяти слов: круг 1 и «Узнай» — каждое событие (верно — зачёт, иначе промах); «Скажи» — одна единица на фразу по двум проходам (passOutcome):
 * again — промах, hard — зачёт с пометкой unclean, good — зачёт. → [{ words, ok, unclean }]
 */
export function phraseUnits(list) {
  const out = [], say = new Map()
  for (const e of list ?? []) {
    if (e.round === 2 && e.mode === 'say') { const row = say.get(e.phraseKey) ?? { words: e.words ?? [] }; row[e.pass === 2 ? 'p2' : 'p1'] = e; say.set(e.phraseKey, row); continue }
    out.push({ words: e.words ?? [], ok: !!e.ok, unclean: false })
  }
  for (const r of say.values()) { const o = passOutcome(r.p1, r.p2); out.push({ words: r.words, ok: o !== 'again', unclean: o === 'hard' }) }
  return out
}

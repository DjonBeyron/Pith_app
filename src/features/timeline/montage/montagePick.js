// Выбор блока на монтажном столе, который НЕ клип: этап, пилюля (ход фразы), ответ игрока, отметка (отсчёт нотами / ожидание техники / пауза игры) и зазор тишины. Элементы стола несут data-pick (вид)
// и data-t (начало на столе, мс) — щелчок ловит сам стол (TimelineMontage), здесь по ним находится отрезок. Карточка блока и комментарий в GitHub говорят об ИСХОДНОЙ игре, поэтому из монтажа с правками
// (shown) отрезок переводится в исходный (base): у этапов, пилюль и ответов это ref (отрезок модели), у отметок и зазоров — тот же по счёту отрезок исходного монтажа. Чистые функции.
const LISTS = { stage: 'stages', turn: 'pills', answer: 'answers', mark: 'marks' }

/** Элемент стола (или null) → выбранный блок { sel: { kind, ref }, t (где он на столе) } или null */
export function pickAt(base, shown, el) {
  const kind = el?.dataset?.pick, list = LISTS[kind]
  if (!list) return null
  const t = Number(el.dataset.t), i = shown[list].findIndex(x => x.t === t)
  if (i < 0) return null
  const it = shown[list][i]
  if (kind === 'mark') { const b = base.marks[i] ?? it; return { sel: { kind: b.kind, ref: b }, t } } // kind отметки: count | wait | hold
  return it.ref ? { sel: { kind, ref: it.ref }, t } : null
}

/** Зазор монтажа с правками → тот же зазор исходной игры (тот же промежуток между звуками, тот же по счёту кусок); не нашёлся — сам зазор */
export function baseGap(base, shown, g) {
  if (base === shown) return g
  const cur = shown.groups.find(x => x.g === g.g), src = base.groups.find(x => x.g === g.g)
  const i = cur ? cur.pieces.findIndex(p => p.t === g.t) : -1
  const b = src?.pieces[i]
  return b && b.kind === g.kind ? b : g
}

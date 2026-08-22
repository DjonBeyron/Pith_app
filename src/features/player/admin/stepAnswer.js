// Шаговый прогон (админ, запуск из канваса): что «нажать» за ученика на
// интерактивной ноде, когда тумблер стоит в положении «верно» или «неверно».
//
// Ответ не имитируется кликом внутри панели — панели держат своё состояние и
// анимации, лезть туда пришлось бы в пять разных мест. Вместо этого шаг сразу
// отдаёт итог: какой триггер сработал, какой вариант выбран (variantId нужен
// для особых переходов вариантов, см. nodeVariants.js) и что ответит учитель.

// Случайный элемент — из нескольких верных (или нескольких неверных) вариантов
// берём любой, как и просили: жёсткой очерёдности здесь не нужно
function pick(list, rnd) {
  return list.length ? list[Math.floor(rnd() * list.length)] : null
}

// Ветка «нужной» правильности; если таких вариантов нет (например, у ноды
// вообще нет верного ответа — только сигнальные «знаю/не знаю»), берём из
// того, что есть, и считаем результат по фактическому варианту
function pickSide(all, wantCorrect, isCorrectOf, rnd) {
  const side = all.filter(o => !!isCorrectOf(o) === wantCorrect)
  return pick(side.length ? side : all, rnd)
}

export function pickStepAnswer(node, wantCorrect, rnd = Math.random) {
  const t = node?.type
  const d = node?.typeData?.[t] ?? {}

  if (t === 'word_choice') {
    const opt = pickSide(d.options ?? [], wantCorrect, o => o.isCorrect, rnd)
    if (!opt) return null
    const correct = !!opt.isCorrect
    return {
      kind: 'word',
      correct,
      variantId: opt.id ?? null,
      pickText: opt.text ?? '',
      result: correct ? 'word_correct' : 'word_wrong',
      responseText: (correct ? d.responseCorrect : d.responseWrong) ?? '',
    }
  }

  if (t === 'phrase_assembly' || t === 'table') {
    const prefix = t === 'table' ? 'table' : 'phrase'
    // Неверный ответ = собранная фраза с одним из слов-ловушек. Ловушки могли
    // остаться голыми строками (миграция в nodeVariants.js) — тогда id нет и
    // особого перехода варианта у неё быть не может
    const trap = wantCorrect ? null : pick(d.distractors ?? [], rnd)
    const correct = wantCorrect || !trap
    return {
      kind: prefix,
      correct,
      variantId: (typeof trap === 'object' ? trap?.id : null) ?? null,
      result: correct ? `${prefix}_correct` : `${prefix}_wrong`,
      responseText: (correct ? d.responseCorrect : d.responseWrong) ?? '',
    }
  }

  if (t === 'photo_choice') {
    const photos  = d.photos ?? []
    const correctIdx = d.correctIndexes ?? []
    const all = photos.map((_, i) => i)
    const idx = pickSide(all, wantCorrect, i => correctIdx.includes(i), rnd)
    if (idx == null) return null
    return { kind: 'photo', correct: correctIdx.includes(idx), idx }
  }

  if (t === 'registration') {
    // «Верно» — ученик отправил форму, «неверно» — отказался
    return {
      kind: 'reg',
      correct: wantCorrect,
      variantId: null,
      result: wantCorrect ? 'reg_submit' : 'reg_cancel',
      responseText: '',
    }
  }

  return null // обычная нода — шаг просто отпускает её дальше по цепочке
}

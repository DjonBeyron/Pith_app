import { buildRevealedText } from '../../../shared/lib/fillBlanksTemplate.js'

// Шаговый прогон (админ, запуск из канваса): что «нажать» за ученика на
// интерактивной ноде, когда тумблер стоит в положении «верно» или «неверно».
//
// Ответ не имитируется кликом внутри панели — панели держат своё состояние и
// анимации, лезть туда пришлось бы в пять разных мест. Вместо этого шаг сразу
// отдаёт итог: какой триггер сработал, какой вариант выбран (variantId нужен
// для особых переходов вариантов, см. nodeVariants.js) и что ответит учитель.

// Пузыри в чат — как их шлют настоящие панели (PhraseAssemblyPanel, TypeWordPanel, fillBlanksCheck, manualCheck):
// сначала реплика ученика справа (зелёная 'correct' / красная 'wrong_final'), потом реакция учителя слева ('hint').
// Раньше шаг слал только реакцию с результатом ноды — в чате не было видно, что «ученик» собрал или напечатал.
function studentBubbles(studentText, correct, response) {
  const out = []
  if (studentText?.trim()) out.push({ text: studentText.trim(), result: correct ? 'correct' : 'wrong_final' })
  if (response?.trim()) out.push({ text: response.trim(), result: 'hint' })
  return out
}
const trapText = t => (typeof t === 'object' ? t?.text : t) ?? ''

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

// wantCorrect: true — верно, false — неверно, null — случайно (монетка на каждый вопрос; режим «?» скипера)
export function pickStepAnswer(node, wantCorrectIn, rnd = Math.random) {
  const wantCorrect = wantCorrectIn == null ? rnd() < 0.5 : !!wantCorrectIn
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
    const responseText = (correct ? d.responseCorrect : d.responseWrong) ?? ''
    // Собранная фраза: верная — слова ноды, неверная — с подставленной ловушкой (как собрал бы ученик)
    const words = Array.isArray(d.words) ? d.words.map(w => (typeof w === 'object' ? w?.text : w) ?? '') : []
    const phrase = t === 'table' ? '' : (correct ? words : [...words.slice(0, -1), trapText(trap), words.at(-1) ?? '']).join(' ')
    // Таблица шлёт фразу в чат только по галочке «отправить ответ ученика в чат» (PlayerPanels.jsx)
    const sendPhrase = t !== 'table' || d.sendAnswerToChat === true
    return {
      kind: prefix,
      correct,
      variantId: (typeof trap === 'object' ? trap?.id : null) ?? null,
      result: correct ? `${prefix}_correct` : `${prefix}_wrong`,
      responseText,
      bubbles: studentBubbles(sendPhrase ? phrase : '', correct, responseText),
    }
  }

  if (t === 'fill_blanks') {
    const blanks = d.blanks ?? []
    // Пропуски, где есть из чего ошибиться (в options есть хоть один вариант
    // помимо answer) — «неверно» просто считает результат неверным, без
    // выбора конкретного варианта: у fill_blanks нет отдельных переходов по
    // варианту (в отличие от distractors у phrase_assembly/table). Без
    // единого такого пропуска ошибиться нечем — идём как верный
    const wrongable = blanks.some(b => (b.options ?? []).some(o => o !== b.answer))
    const correct = wantCorrect || !wrongable
    const responseText = (correct ? d.responseCorrect : d.responseWrong) ?? ''
    // Фраза с пропусками: верная — ответы, неверная — первый чужой вариант в каждом пропуске, где он есть
    const filled = buildRevealedText(d.template ?? '', correct ? blanks : blanks.map(b => ({ answer: (b.options ?? []).find(o => o !== b.answer) ?? b.answer })))
    return {
      // Тот же канал ответа в чате, что у table/phrase_assembly — общий
      // phraseStates (см. usePlayerAnswers.js/handlePhraseAnswer)
      kind: 'phrase',
      correct,
      variantId: null,
      result: correct ? 'fill_correct' : 'fill_wrong',
      responseText,
      bubbles: studentBubbles(filled, correct, responseText),
    }
  }

  if (t === 'type_word') {
    // Напечатать слово нечем «ошибиться» кликом — «неверно» просто считает результат
    // неверным; слово без текста проверять не на чем — идём как верный. Общий канал
    // ответа в чате с «Собери фразу» (phraseStates)
    const correct = wantCorrect || !(d.word ?? '').trim()
    const responseText = (correct ? d.responseCorrect : d.responseWrong) ?? ''
    const word = (d.word ?? '').trim()
    // Неверно напечатанное слово: лишняя буква из набора ловушек в конце (как опечатка ученика)
    const typed = correct ? word : `${word}${String(d.extraLetters ?? 'x')[0] ?? 'x'}`
    return {
      kind: 'phrase',
      correct,
      variantId: null,
      result: correct ? 'type_correct' : 'type_wrong',
      responseText,
      bubbles: studentBubbles(typed, correct, responseText),
    }
  }

  if (t === 'say_phrase') {
    // Речь — тренировка без штрафов: шаг «верно» = сказал (выход say_done), «неверно» = три неудачи (выход say_wrong; если ветка не соединена,
    // плеер идёт по существующему выходу — sayPairSkip.sayExit). Ошибкой урока это не считается (correct всегда true) — как в самой панели
    return {
      kind: 'phrase',
      correct: true,
      variantId: null,
      result: wantCorrect ? 'say_done' : 'say_wrong',
      responseText: wantCorrect ? (d.phrase ?? '') : '',
      // Сказал — фраза зелёным (как голосовой ответ, только текстом); не сказал — пузырей нет (панель молчит)
      bubbles: wantCorrect ? studentBubbles(d.phrase ?? '', true, '') : [],
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

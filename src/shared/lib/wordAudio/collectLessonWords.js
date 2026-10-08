import { wordKey, cleanWordText } from './wordKey.js'
import { deriveAnswerTokens } from '../tableCellMatch.js'
import { parseTemplateSegments } from '../fillBlanksTemplate.js'

// Какие слова урок хочет уметь озвучивать — единственный «сигнал» от уроков
// библиотеке (PROJECT.md, «Озвучка слов»): никаких флагов в самих нодах,
// список считается из скрипта. Берём ровно то, по чему ученик тапает:
//  - phrase_assembly: слова фразы и ловушки;
//  - table: значения ячеек, варианты меню ячейки, слова вне таблицы из
//    ответа и ловушки;
//  - fill_blanks: ЦЕЛОЕ слово для каждого варианта пропуска (для «tr___s» —
//    «tries», а не «ie»: озвучивается слово, а не буквы);
//  - word_choice: только верные варианты (озвучивается лишь верный ответ);
//  - type_word: само печатаемое слово (озвучивается, когда ученик напечатал верно).
// Возвращает Map key → текст для показа (первое написание в уроке).

// Маркеры границ целевого пропуска в собранном тексте — вырезаются
const MARK_L = ''
const MARK_R = ''

// Слово шаблона, в которое входит пропуск index, с подставленными значениями
// пропусков: values (необязательно) — {индекс: текст}, что подставить вместо
// верного ответа (выбор ученика, любой вариант меню); не заданный — верный
// ответ. Пропуск-слово («She ___ to cook») — сам подставленный текст.
// Слова режутся по ЛЮБЫМ пробельным символам, включая принудительный перенос
// строки \n из шаблона («one\ntwo» — два слова, не одно). Подставленный текст
// из нескольких слов («is going» вместо одного слова) берётся ЦЕЛИКОМ, вместе с
// прилипшими к нему кусками слова по краям — раньше терялось всё после первого пробела
export function blankWord(template, blanks, index, values = null) {
  const segs = parseTemplateSegments(template)
  const text = segs.map(s => {
    if (s.type === 'text') return s.value
    const val = values?.[s.index] ?? blanks[s.index]?.answer ?? ''
    return s.index === index ? `${MARK_L}${val}${MARK_R}` : val
  }).join('')
  const l = text.indexOf(MARK_L)
  const r = text.indexOf(MARK_R)
  if (l < 0 || r < l) return ''
  let from = l
  while (from > 0 && !/\s/.test(text[from - 1])) from -= 1
  let to = r + 1
  while (to < text.length && !/\s/.test(text[to])) to += 1
  return text.slice(from, to).replace(new RegExp(`[${MARK_L}${MARK_R}]`, 'g'), '')
}

function wordsOfNode(node) {
  const td = node.typeData ?? {}
  switch (node.type) {
    case 'phrase_assembly': {
      const pa = td.phrase_assembly ?? {}
      return [...(pa.words ?? []), ...(pa.distractors ?? []).map(d => d.text)]
    }
    case 'table': {
      const t = td.table ?? {}
      const cells = t.table?.cells ?? []
      const fromAnswer = deriveAnswerTokens(t.answer ?? '', cells).map(tok => tok.value)
      return [
        ...cells.flatMap(c => [c.value, ...(c.options ?? [])]),
        ...fromAnswer,
        ...(t.distractors ?? []).map(d => d.text),
      ]
    }
    case 'fill_blanks': {
      const fb = td.fill_blanks ?? {}
      const blanks = fb.blanks ?? []
      // Целое слово КАЖДОГО варианта меню (не только верного): ученик слышит
      // любой выбор, и слова неверных вариантов тоже должны быть в списке
      // «нужна озвучка» и прогреваться заранее (как варианты ячейки таблицы)
      return blanks.flatMap((b, i) => [b.answer, ...(b.options ?? [])]
        .filter(v => v != null && v !== '')
        .map(v => blankWord(fb.template ?? '', blanks, i, { [i]: v })))
    }
    case 'type_word':
      return [td.type_word?.word ?? '']
    case 'word_choice':
      return (td.word_choice?.options ?? []).filter(o => o.isCorrect).map(o => o.text)
    default:
      return []
  }
}

export function collectLessonWords(nodes = []) {
  const out = new Map()
  for (const node of nodes) {
    for (const raw of wordsOfNode(node)) {
      const key = wordKey(raw)
      if (key && !out.has(key)) out.set(key, cleanWordText(raw))
    }
  }
  return out
}

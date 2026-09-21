import { wordKey, cleanWordText } from './wordKey.js'
import { deriveAnswerTokens } from '../tableCellMatch.js'
import { parseTemplateSegments } from '../fillBlanksTemplate.js'

// Какие слова урок хочет уметь озвучивать — единственный «сигнал» от уроков
// библиотеке (PROJECT.md, «Озвучка слов»): никаких флагов в самих нодах,
// список считается из скрипта. Берём ровно то, по чему ученик тапает:
//  - phrase_assembly: слова фразы и ловушки;
//  - table: значения ячеек, варианты меню ячейки, слова вне таблицы из
//    ответа и ловушки;
//  - fill_blanks: ЦЕЛОЕ слово с верным ответом в пропуске (для «tr___s» —
//    «tries», а не «ie»: озвучивается слово, а не буквы);
//  - word_choice: только верные варианты (озвучивается лишь верный ответ).
// Возвращает Map key → текст для показа (первое написание в уроке).

// Маркеры границ целевого пропуска в собранном тексте — вырезаются
const MARK_L = ''
const MARK_R = ''

// Слово шаблона, в которое входит пропуск index, с подставленными верными
// ответами всех пропусков. Пропуск-слово («She ___ to cook») — сам ответ
export function blankWord(template, blanks, index) {
  const segs = parseTemplateSegments(template)
  const text = segs.map(s => {
    if (s.type === 'text') return s.value
    const ans = blanks[s.index]?.answer ?? ''
    return s.index === index ? `${MARK_L}${ans}${MARK_R}` : ans
  }).join('')
  const token = text.split(/\s+/).find(t => t.includes(MARK_L))
  return token ? token.replace(new RegExp(`[${MARK_L}${MARK_R}]`, 'g'), '') : ''
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
      return blanks.map((_, i) => blankWord(fb.template ?? '', blanks, i))
    }
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

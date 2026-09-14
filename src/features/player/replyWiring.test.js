import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const textModule    = read('./modules/text/TextModule.jsx')
const stickerModule = read('./modules/sticker/StickerModule.jsx')
const phraseModule  = read('./modules/phrase-assembly/PhraseAssemblyModule.jsx')
const answerBubbles = read('./modules/AnswerBubbles.jsx')
const editor         = read('../canvas/NodeContentEditor.jsx')
const nodeGraph       = read('../canvas/nodeGraph.js')
const schema          = read('../canvas/lesson-io/lessonSchema.js')

// Цитата «В ответ на» держится на общем findReplyNode (replyResolve.js) —
// раньше поиск ноды по seq был скопирован отдельно в TextModule и
// StickerModule; регрессия в одном месте не задевала бы другое незаметно.
describe('цитата «В ответ на» — сквозная проводка', () => {
  it('TextModule и StickerModule берут replyNode через общий findReplyNode', () => {
    for (const mod of [textModule, stickerModule]) {
      expect(mod).toContain("import { findReplyNode } from '../../replyResolve.js'")
      expect(mod).toContain('findReplyNode(')
    }
  })

  it('TextModule рисует ReplyPreview только когда replyNode найден', () => {
    expect(textModule).toContain('{replyNode && (')
    expect(textModule).toContain('<ReplyPreview')
  })

  it('StickerModule рисует ReplyPreview внутри общего пузыря со стикером', () => {
    expect(stickerModule).toContain('{replyNode && (')
    expect(stickerModule).toContain('<ReplyPreview')
    // boxed — стикер получает рамку пузыря, когда есть цитата или подпись
    expect(stickerModule).toContain('const boxed = !!replyNode || !!caption')
  })
})

// phrase_assembly: поле replyToSeq в схеме (lessonSchema.js) существовало и
// раньше, но не было построено ни в редакторе, ни в плеере — авторская
// документация обещала то, чего не было. Здесь оно доведено до конца.
describe('«Собери фразу» — своя цитата (replyToSeq)', () => {
  it('nodeGraph.js заводит поле по умолчанию у phrase_assembly', () => {
    expect(nodeGraph).toContain("phrase_assembly: { words: [], distractors: [], responseCorrect: '', responseWrong: '', replyToSeq: null }")
  })

  it('схема документирует replyToSeq у phrase_assembly (совпадает с реализацией)', () => {
    const block = schema.slice(schema.indexOf('phrase_assembly: {'), schema.indexOf('photo_choice: {'))
    expect(block).toContain('replyToSeq:')
  })

  it('редактор показывает «В ответ на» и для phrase_assembly, не только text/sticker', () => {
    expect(editor).toContain("(node.type === 'text' || node.type === 'sticker' || node.type === 'phrase_assembly') && (")
  })

  it('PhraseAssemblyModule ищет replyNode по своему полю и передаёт в AnswerBubbles', () => {
    expect(phraseModule).toContain("import { findReplyNode } from '../../replyResolve.js'")
    expect(phraseModule).toContain("findReplyNode(node.typeData?.phrase_assembly?.replyToSeq, lessonNodes)")
    expect(phraseModule).toContain('replyNode={replyNode}')
  })

  it('AnswerBubbles рисует цитату строго над финальным пузырём (resolvePhraseAttempt)', () => {
    expect(answerBubbles).toContain("import { resolvePhraseAttempt } from '../replyResolve.js'")
    expect(answerBubbles).toContain('const finalAttempt = replyNode ? resolvePhraseAttempt(list) : null')
    expect(answerBubbles).toContain('b === finalAttempt')
  })

  it('таблица (TableModule) не задействует эту цитату — replyNode у неё не передаётся', () => {
    const tableModule = read('./modules/table/TableModule.jsx')
    expect(tableModule).not.toContain('replyNode')
  })
})

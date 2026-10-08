import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportLesson } from '../../../canvas/lesson-io/exportLesson.js'
import { importLesson } from '../../../canvas/lesson-io/importLesson.js'
import { TYPED_PAIRS, makeDefaultTriggers } from '../../../canvas/nodeDefaults.js'
import { NODE_TYPES } from '../../../canvas/nodeTypes.js'
import { makeNode } from '../../../canvas/nodeGraph.js'
import { linkKind } from '../../../canvas/canvasLineStyle.js'
import { REWARD_TYPES } from '../../lessonXp.js'
import { resolveModule } from '../../modules/index.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const panel         = read('./TypeWordPanel.jsx')
const keyboard      = read('./TypeWordKeyboard.jsx')
const hook          = read('./useTypeWord.js')
const typed         = read('./TypeWordTyped.jsx')
const playerPanels  = read('../../PlayerPanels.jsx')
const panelNodes    = read('../../usePlayerPanelNodes.js')
const lessonPlayer  = read('../../LessonPlayer.jsx')
const answerFields  = read('../../../canvas/NodeAnswerFields.jsx')
const contentEditor = read('../../../canvas/NodeContentEditor.jsx')
const picker        = read('../../../canvas/NodeTypeWordPicker.jsx')
const schema        = read('../../../canvas/lesson-io/lessonSchema.js')
const signalConnections = read('../../../canvas/CanvasSignalConnections.jsx')
const css           = read('../../../../styles/player/panels/type-word.css')
const indexCss      = read('../../../../index.css')

// Сквозная проводка типа type_word («Напечатай слово») — по образцу fillBlanksWiring.test.js:
// тесты на реальные файлы ловят «забыл подключить в одном из мест».
describe('type_word — плеер', () => {
  it('тип резолвится в модуль ленты', () => {
    expect(resolveModule('type_word')).not.toBe(null)
  })

  it('usePlayerPanelNodes.js заводит kind "tw" на тип type_word и считает панель «ручной»', () => {
    expect(panelNodes).toContain("tw: 'type_word'")
    expect(panelNodes).toContain('node.pa || node.fb || node.tw ||')
  })

  it('PlayerPanels.jsx рендерит TypeWordPanel для twNode и передаёт сигналы ошибок; LessonPlayer пробрасывает', () => {
    expect(playerPanels).toContain("import TypeWordPanel       from './panels/type-word/TypeWordPanel.jsx'")
    const block = playerPanels.slice(playerPanels.indexOf('{twNode && ('), playerPanels.indexOf('{pcNode &&'))
    expect(block).toContain('<TypeWordPanel')
    for (const prop of ['nodes={nodes}', 'onSignalFired={onSignalFired}', 'hasSignalFired={hasSignalFired}']) {
      expect(block).toContain(prop)
    }
    expect(lessonPlayer).toContain('twNode={panels.node.tw}')
    expect(lessonPlayer).toContain("setTwPanelHeight={panels.setHeight('tw')}")
  })

  it('панель закрывается теми же триггерами, что объявлены у типа', () => {
    expect(panel).toContain("closeWith('type_correct'")
    expect(panel).toContain("closeWith('type_wrong'")
    expect(TYPED_PAIRS.type_word).toEqual(['type_correct', 'type_wrong'])
  })

  it('три попытки; напечатанное слово ВСЕГДА уходит в чат, на верном — как у автора', () => {
    expect(panel).toContain('wc < 3')
    expect(panel).toContain("onAnswered?.(shownWord, 'correct', true)")
    expect(panel).toContain("onAnswered?.(shownWord, 'hint', true)")
  })

  it('сигналы ошибок: хук ищет первую неверную букву, «бесплатная» ошибка не тратит попытку', () => {
    expect(hook).toContain('typedMismatchSlot(typed, word)')
    expect(hook).toContain('signalForSlot(signals, slot, nodes)')
    expect(hook).toContain('hasSignalFired?.(found.node.id)')
    expect(hook).toContain('onSignalFired?.(found.node, signalState.dismissOverlay, node.id)')
    expect(hook).toContain("return 'signal'")
    // пока сигнал играет — клавиши молчат; стёрли помеченную букву — мигание гаснет
    expect(hook).toContain('signalState.freeze')
    expect(hook).toContain('signalState.onRemoved(letters - 1)')
    // панель на 'signal' выходит до звука, счёта попыток и статистики
    expect(panel).toContain("if (!r || r === 'signal') return")
    expect(panel).toContain('useTypeWord(node, nodes, onSignalFired, hasSignalFired)')
    expect(panel).toContain('<TypeWordTyped typed={typed} blinkIndex={tw.blinkIndex} />')
    expect(typed).toContain('signalBlinkChip')
  })

  it('клавиатура: нажимаются только светящиеся клавиши, стирание есть', () => {
    expect(keyboard).toContain('disabled={disabled || !k.lit || (helped && !!k.lure)}')
    expect(keyboard).toContain('aria-label="Стереть"')
    expect(hook).toContain('if (frozen) return')
  })

  it('стили подключены и не затирают корпус панели «Собери фразу»', () => {
    expect(indexCss).toContain("@import './styles/player/panels/type-word.css';")
    expect(indexCss).toContain("@import './styles/canvas/type-word.css';")
    expect(css).not.toContain('.phrasePanel {')
    expect(panel).toContain('phrasePanel')
  })

  it('XP делится и на type_word', () => {
    expect(REWARD_TYPES).toContain('type_word')
  })
})

describe('type_word — редактор', () => {
  it('тип в списке нод, интерактивный; новая нода получает пару триггеров и поля по умолчанию', () => {
    const t = NODE_TYPES.find(x => x.value === 'type_word')
    expect(t).toMatchObject({ label: 'Напечатай слово', group: 'interactive' })
    expect(makeDefaultTriggers('type_word').map(x => x.if)).toEqual(['type_correct', 'type_wrong'])
    const node = makeNode(1, 0, 0, 'type_word')
    expect(node.typeData.type_word).toEqual({
      word: '', extraLetters: '', responseCorrect: '', responseWrong: '', replyToSeq: null,
    })
  })

  it('пикер подключён в NodeAnswerFields, «В ответ на» и скрытие общего блока триггеров — в NodeContentEditor', () => {
    expect(answerFields).toContain("node.type === 'type_word'")
    expect(answerFields).toContain('<NodeTypeWordPicker')
    expect(contentEditor).toContain("node.type === 'type_word'")
    expect(contentEditor).toContain("node.type !== 'type_word'")
  })

  it('сигналы в редакторе: пикер слотов-букв, порты на холсте, поле signals в схеме', () => {
    expect(picker).toContain('<NodeSignalsPicker')
    expect(picker).toContain('slots={typeWordSlots(word)}')
    const block = answerFields.slice(answerFields.indexOf("node.type === 'type_word'"), answerFields.indexOf("node.type === 'table'"))
    expect(block).toContain('onSignalsChange={s => updateTypeData({ signals: s })}')
    expect(block).toContain('onSignalMeasure={onSignalMeasure}')
    expect(signalConnections).toContain('typeWordSlots(t.word)')
    expect(signalConnections).toContain("node.type === 'phrase_assembly' || node.type === 'type_word'")
    const doc = schema.slice(schema.indexOf('  type_word: {'), schema.indexOf('  photo_choice: {'))
    expect(doc).toContain('signals:')
  })

  it('пикер пишет в поля word / extraLetters и в пару type_correct / type_wrong', () => {
    expect(answerFields).toContain('onWordChange={v => updateTypeData({ word: v })}')
    expect(answerFields).toContain('onExtraChange={v => updateTypeData({ extraLetters: v })}')
    expect(picker).toContain("correctKey=\"type_correct\" wrongKey=\"type_wrong\"")
  })

  it('связи type_correct/type_wrong красятся как верно/неверно', () => {
    expect(linkKind('type_correct')).toBe('correct')
    expect(linkKind('type_wrong')).toBe('wrong')
  })

  it('схема обмена документирует тип и оба триггера', () => {
    const block = schema.slice(schema.indexOf('  type_word: {'), schema.indexOf('  photo_choice: {'))
    for (const field of ['word:', 'extraLetters:', 'responseCorrect:', 'responseWrong:', 'replyToSeq:']) {
      expect(block).toContain(field)
    }
    expect(schema).toContain('type_correct:')
    expect(schema).toContain('type_wrong:')
  })
})

describe('type_word — обменный JSON', () => {
  it('экспорт → импорт сохраняет слово, дополнительные буквы и переходы', () => {
    const nodes = [
      {
        id: 'tw', seq: 1, x: 0, y: 0, size: 'max', type: 'type_word',
        typeData: { type_word: { word: 'tries', extraLetters: 'xz', responseCorrect: 'Ок', responseWrong: 'Мимо', replyToSeq: null } },
        triggers: [
          { id: 't1', if: 'type_correct', then: 'end' },
          { id: 't2', if: 'type_wrong', then: null },
        ],
      },
      {
        id: 'end', seq: 2, x: 300, y: 0, size: 'max', type: 'text',
        typeData: { text: { content: 'Готово' } }, triggers: [],
      },
    ]
    const json = exportLesson(nodes)
    const exported = json.nodes.find(n => n.type === 'type_word')
    expect(exported.data).toMatchObject({ word: 'tries', extraLetters: 'xz' })
    const back = importLesson(json).nodes.find(n => n.type === 'type_word')
    expect(back.typeData.type_word).toMatchObject({ word: 'tries', extraLetters: 'xz', responseWrong: 'Мимо' })
    expect(back.triggers.map(t => t.if)).toEqual(['type_correct', 'type_wrong'])
    expect(back.triggers[0].then).toBeTruthy()
  })

  it('сигналы ошибок type_word едут в файле как ref и возвращаются id ноды-спутника', () => {
    const nodes = [
      {
        id: 'tw', seq: 1, x: 0, y: 0, size: 'max', type: 'type_word',
        typeData: { type_word: {
          word: 'tries', extraLetters: '', responseCorrect: '', responseWrong: '', replyToSeq: null,
          signals: [{ slot: 2, ref: 'hint' }],
        } },
        triggers: [{ id: 't1', if: 'type_correct', then: null }, { id: 't2', if: 'type_wrong', then: null }],
      },
      {
        id: 'hint', seq: 2, x: 0, y: 300, size: 'max', type: 'text',
        typeData: { text: { content: 'Перед -es буква y превращается в i' } }, triggers: [],
      },
    ]
    const json = exportLesson(nodes)
    const exported = json.nodes.find(n => n.type === 'type_word')
    expect(exported.data.signals).toHaveLength(1)
    expect(exported.data.signals[0]).toMatchObject({ slot: 2 })
    expect(exported.data.signals[0].ref).toBe(json.nodes.find(n => n.type === 'text').ref)
    const back = importLesson(json).nodes
    const tw = back.find(n => n.type === 'type_word')
    const hint = back.find(n => n.type === 'text')
    expect(tw.typeData.type_word.signals).toEqual([{ slot: 2, ref: hint.id }])
  })
})

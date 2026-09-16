import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const panel       = read('./FillBlanksPanel.jsx')
const check        = read('./fillBlanksCheck.js')
const feedModule    = read('../../modules/fill-blanks/FillBlanksModule.jsx')
const moduleIndex   = read('../../modules/index.js')
const panelNodes     = read('../../usePlayerPanelNodes.js')
const playerPanels   = read('../../PlayerPanels.jsx')
const lessonPlayer   = read('../../LessonPlayer.jsx')
const replyResolve   = read('../../replyResolve.js')
const contentEditor  = read('../../../canvas/NodeContentEditor.jsx')
const answerFields   = read('../../../canvas/NodeAnswerFields.jsx')
const picker         = read('../../../canvas/NodeFillBlanksPicker.jsx')
const nodeGraph       = read('../../../canvas/nodeGraph.js')
const nodeDefaults    = read('../../../canvas/nodeDefaults.js')
const nodeTypes       = read('../../../canvas/nodeTypes.js')
const schema          = read('../../../canvas/lesson-io/lessonSchema.js')

// Сквозная проводка нового типа ноды fill_blanks («Составь предложение»,
// см. PROJECT.md) — по образцу replyWiring.test.js/signalWiring.test.js:
// source-text тесты на реальные файлы (без jsdom/рендера компонентов, в
// проекте нет testing-library), ловят «забыл подключить в одном из мест».
describe('fill_blanks — резолвится как модуль ленты и панель ответа', () => {
  it('modules/index.js знает про fill_blanks', () => {
    expect(moduleIndex).toContain("import FillBlanksModule      from './fill-blanks/FillBlanksModule.jsx'")
    expect(moduleIndex).toContain('fill_blanks:     FillBlanksModule,')
  })

  it('usePlayerPanelNodes.js заводит kind "fb" на тип fill_blanks', () => {
    expect(panelNodes).toContain("fb: 'fill_blanks'")
    expect(panelNodes).toContain("'fb'")
  })

  it('PlayerPanels.jsx рендерит FillBlanksPanel для fbNode, без сигналов', () => {
    expect(playerPanels).toContain("import FillBlanksPanel     from './panels/fill-blanks/FillBlanksPanel.jsx'")
    expect(playerPanels).toContain('{fbNode && (')
    expect(playerPanels).toContain('<FillBlanksPanel')
    // Сигналов у этого модуля нет — панель их не принимает вовсе
    const fbBlock = playerPanels.slice(playerPanels.indexOf('{fbNode && ('), playerPanels.indexOf('{pcNode &&'))
    expect(fbBlock).not.toContain('onSignalFired')
    expect(fbBlock).not.toContain('hasSignalFired')
  })

  it('LessonPlayer.jsx пробрасывает fbNode/setFbPanelHeight', () => {
    expect(lessonPlayer).toContain('fbNode={panels.node.fb}')
    expect(lessonPlayer).toContain("setFbPanelHeight={panels.setHeight('fb')}")
  })
})

describe('fill_blanks — без сигналов ошибок (осознанное решение, см. PROJECT.md)', () => {
  it('fillBlanksCheck.js не знает о сигналах вовсе', () => {
    for (const term of ['onSignal', 'signalForSlot', 'hasSignalFired', 'nodes']) {
      expect(check).not.toContain(term)
    }
  })

  it('FillBlanksPanel.jsx не подключает useSignalState/сигнальные пропсы', () => {
    expect(panel).not.toContain('useSignalState')
    expect(panel).not.toContain('onSignalFired')
    expect(panel).not.toContain('hasSignalFired')
  })
})

describe('fill_blanks — CellOptionsMenu переиспользован как есть', () => {
  it('FillBlanksPanel.jsx импортирует готовый CellOptionsMenu из table-manual', () => {
    expect(panel).toContain("import CellOptionsMenu from '../table-manual/CellOptionsMenu.jsx'")
  })
})

describe('fill_blanks — редактор ноды в канвасе', () => {
  it('nodeGraph.js заводит дефолтный typeData', () => {
    expect(nodeGraph).toContain('fill_blanks:')
    expect(nodeGraph).toContain("template: '', blanks: [], responseCorrect: '', responseWrong: '', replyToSeq: null")
  })

  it('nodeDefaults.js заводит пару триггеров fill_correct/fill_wrong', () => {
    expect(nodeDefaults).toContain("fill_blanks:     ['fill_correct',   'fill_wrong']")
  })

  it('nodeTypes.js знает про новый тип в группе interactive', () => {
    expect(nodeTypes).toContain("value: 'fill_blanks'")
  })

  it('NodeAnswerFields.jsx рендерит NodeFillBlanksPicker для fill_blanks', () => {
    expect(answerFields).toContain("import NodeFillBlanksPicker     from './NodeFillBlanksPicker.jsx'")
    expect(answerFields).toContain("node.type === 'fill_blanks'")
    expect(answerFields).toContain('<NodeFillBlanksPicker')
  })

  it('редактор показывает «В ответ на» и для fill_blanks', () => {
    expect(contentEditor).toContain("node.type === 'fill_blanks'")
  })

  it('generic NodeTriggerEditor исключает fill_blanks (у него своя пара портов)', () => {
    expect(contentEditor).toContain("node.type !== 'fill_blanks'")
  })

  it('пикер переиспользует NodeCorrectWrongTriggers, а не пишет свою пару портов', () => {
    expect(picker).toContain("import NodeCorrectWrongTriggers from './NodeCorrectWrongTriggers.jsx'")
    expect(picker).toContain('correctKey="fill_correct" wrongKey="fill_wrong"')
  })
})

describe('fill_blanks — легенда экспорта/импорта (lessonSchema.js)', () => {
  it('документирует поля fill_blanks (совпадает с реализацией)', () => {
    const block = schema.slice(schema.indexOf('fill_blanks: {'), schema.indexOf('photo_choice: {'))
    expect(block).toContain('template:')
    expect(block).toContain('blanks:')
    expect(block).toContain('responseCorrect:')
    expect(block).toContain('responseWrong:')
    expect(block).toContain('replyToSeq:')
  })

  it('документирует переходы fill_correct/fill_wrong', () => {
    expect(schema).toContain('fill_correct:')
    expect(schema).toContain('fill_wrong:')
  })
})

describe('fill_blanks — цитата «В ответ на» и общий стор ответов (allPhraseStates)', () => {
  it('FillBlanksModule ищет replyNode по своему полю и передаёт в AnswerBubbles', () => {
    expect(feedModule).toContain("import { findReplyNode } from '../../replyResolve.js'")
    expect(feedModule).toContain("findReplyNode(node.typeData?.fill_blanks?.replyToSeq, lessonNodes)")
    expect(feedModule).toContain('replyNode={replyNode}')
  })

  it('replyResolve.js резолвит fill_blanks через тот же общий phraseStates, что и table/phrase_assembly', () => {
    expect(replyResolve).toContain("rType === 'phrase_assembly' || rType === 'table' || rType === 'fill_blanks'")
  })
})

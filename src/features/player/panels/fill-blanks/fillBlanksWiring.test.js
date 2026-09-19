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
    expect(nodeGraph).toContain("template: '', blanks: [], translation: '', responseCorrect: '', responseWrong: '', replyToSeq: null")
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

describe('fill_blanks — собранная фраза ВСЕГДА уходит в чат (не опционально, в отличие от table)', () => {
  it('NodeFillBlanksPicker.jsx больше не рисует галочку «отправить в чат»', () => {
    expect(picker).not.toContain('nodeTableSendChat')
    expect(picker).not.toContain('sendAnswerToChat')
  })

  it('NodeAnswerFields.jsx больше не пробрасывает sendAnswerToChat в пикер', () => {
    const block = answerFields.slice(answerFields.indexOf("node.type === 'fill_blanks'"), answerFields.indexOf("node.type === 'table'"))
    expect(block).not.toContain('sendAnswerToChat')
  })

  it('fillBlanksCheck.js зовёт onAnswerToChat собранной фразой (buildPickedText) на верном и финальном неверном ответе', () => {
    expect(check).toContain("import { buildRevealedText, buildPickedText } from '../../../../shared/lib/fillBlanksTemplate.js'")
    expect(check).toContain("onAnswerToChat?.(text, 'correct', deferred)")
    expect(check).toContain("onAnswerToChat?.(text, 'wrong_final', deferred)")
  })

  it('PlayerPanels.jsx передаёт onAnswerToChat безусловно, без галочки', () => {
    const fbBlock = playerPanels.slice(playerPanels.indexOf('{fbNode && ('), playerPanels.indexOf('{pcNode &&'))
    expect(fbBlock).not.toContain('sendAnswerToChat')
    expect(fbBlock).toContain('onAnswerToChat={(text, result, arriving) => handlePhraseAnswer(fbNode.id, text, result, arriving)}')
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

// Раскладка панели (пользователь, 2026-09-19): кнопка перевода — маленькая в
// правом верхнем углу; фраза и перевод ниже; кнопка «Проверить» под ними,
// всегда в разметке и проявляется плавно, как у таблицы
describe('раскладка «Составь предложение»', () => {
  const panel = read('./FillBlanksPanel.jsx')
  const css = read('../../../../styles/player/panels/fill-blanks.css')

  it('кнопка перевода — absolute в правом верхнем углу, без слота в потоке', () => {
    expect(panel).not.toContain('fbTrBtnSlot')
    expect(css).not.toContain('.fbTrBtnSlot')
    const btn = css.slice(css.indexOf('.fbTrBtn {'), css.indexOf('.fbTrBtnShown'))
    expect(btn).toContain('position: absolute;')
    expect(btn).toContain('top: 8px;')
    expect(btn).toContain('right: 12px;')
    // фраза начинается ниже кнопки — верхний отступ inner под неё
    // низ компактный (16px, как у остальных панелей), верх — под кнопку
    expect(css).toMatch(/\.fbInner \{[^}]*padding: 36px 16px 16px/)
  })

  it('«Проверить» всегда в разметке, скрыта до первого пропуска, проявляется opacity+scale', () => {
    expect(panel).toContain("className={`fbCheckBtn${filledCount > 0 ? '' : ' fbCheckBtnHidden'}`}")
    expect(panel).toContain('aria-hidden={filledCount === 0}')
    expect(css).toContain('.fbCheckBtn.fbCheckBtnHidden {')
    expect(css).toMatch(/\.fbCheckBtn\.fbCheckBtnHidden \{[^}]*transform: scale\(0\.88\)/)
  })
})

// Та же система, что у «выбери слово»: подъём/спуск с историей, салют из
// панели, пузыри невидимыми в тик закрытия, проявление на остановке истории
describe('«Составь предложение» — подъём/спуск и отложенные пузыри', () => {
  const panel = read('./FillBlanksPanel.jsx')

  it('хук usePanelRiseDrop, closePanelWith: салют → prepareClose → пузыри arriving → setShow(false)', () => {
    expect(panel).toContain("usePanelRiseDrop({ show, panelRef, spacerSel: '.fbSpacer', panelH, label: 'fb' })")
    const body = panel.slice(panel.indexOf('function closePanelWith(trigger, sendBubbles)'))
    expect(body).toContain("if (trigger === 'fill_correct' && isRewardOn('fill_blanks', fbData)) {")
    expect(body.indexOf('rise.prepareClose({ reveal: {')).toBeLessThan(body.indexOf('sendBubbles?.(true)'))
    expect(body.indexOf('sendBubbles?.(true)')).toBeLessThan(body.indexOf('setShow(false)'))
  })

  it('распорка без анимации высоты на подъёме (opening) и спуске', () => {
    expect(panel).toContain("transition: show && !rise.opening ? 'height 0.26s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'")
  })
})

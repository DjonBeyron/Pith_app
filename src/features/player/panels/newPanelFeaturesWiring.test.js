import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('таймер ответа — проводка', () => {
  it('«Выбери слово»: таймер по timeLimitSec, вышло → handleTimeout, верный вариант подсвечивается, полоска в панели', () => {
    const panel = read('./choose-word/ChooseWordPanel.jsx')
    expect(panel).toContain('useAnswerTimer({')
    expect(panel).toContain('seconds: wcData.timeLimitSec')
    expect(panel).toContain('handleTimeout()')
    expect(panel).toContain('if (timedOut && opt.isCorrect) return')
    expect(panel).toContain('<AnswerTimerBar timer={timer} />')
    const hook = read('./choose-word/useChooseWord.js')
    expect(hook).toMatch(/function handleTimeout\(\) \{[\s\S]*setResult\('wrong'\)/)
  })

  it('«Собери фразу»: время вышло → phrase_wrong без onChecked (нет счётчика ошибок), ввод закрыт, отсчёт стоит на сигнале', () => {
    const panel = read('./phrase-assembly/PhraseAssemblyPanel.jsx')
    expect(panel).toContain('seconds: pa.timeLimitSec')
    expect(panel).toContain('active: show && !isAnswered && !expired && !freeze')
    expect(panel).toMatch(/closeWith\('phrase_wrong', null,/)
    const onExpire = panel.slice(panel.indexOf('onExpire:'), panel.indexOf('useEffect(() => {\n    if (result !== \'wrong\')'))
    expect(onExpire).not.toContain('onChecked')
    expect(panel).toContain('<AnswerTimerBar timer={timer} />')
  })

  it('хук таймера выключается настройкой урока «timer» и лимитом ноды; шестерёнка содержит переключатель', () => {
    const hook = read('./answer-timer/useAnswerTimer.js')
    expect(hook).toContain("usePref('timer')")
    expect(hook).toContain('readTimeLimit(seconds)')
    expect(read('../LessonSettingsMenu.jsx')).toContain('pref="timer"')
    expect(read('../../../index.css')).toContain("answer-timer.css")
  })
})

describe('«Сказать фразу»: голосовая подсказка по сигналу — проводка', () => {
  it('панель берёт сигнал слота 0, шлёт его ПОСЛЕ реплики ученика вместо текстовой подсказки и закрывает микрофон на время сигнала', () => {
    const panel = read('./say-phrase/SayPhrasePanel.jsx')
    expect(panel).toContain('signalForSlot(raw?.signals, 0, nodes)')
    expect(panel).toContain('!hasSignalFired?.(found.node.id)')
    expect(panel).toContain('onSignalFired(found.node, () => setSignalBusy(false), node.id, true)')
    expect(panel).toMatch(/if \(useSignal\) \{[\s\S]*\}\s*\n\s*else if \(hint\) onAnswered\?\.\(hint, 'hint'\)/)
    expect(panel).toContain('sp.exhausted || sp.silenceExit || signalBusy')
  })

  it('PlayerPanels отдаёт панели nodes/onSignalFired/hasSignalFired; холст знает сигнал у say_phrase', () => {
    expect(read('../PlayerPanels.jsx')).toMatch(/<SayPhrasePanelLazy[\s\S]{0,400}onSignalFired=\{onSignalFired\}[\s\S]{0,100}hasSignalFired=\{hasSignalFired\}/)
    expect(read('../../canvas/CanvasSignalConnections.jsx')).toContain("node.type !== 'say_phrase'")
  })
})

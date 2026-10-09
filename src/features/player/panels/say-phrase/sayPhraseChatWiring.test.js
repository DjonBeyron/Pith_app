import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка «Сказать фразу», часть 2 (правки по тесту v1.2): без эквалайзера по углам, морфинг вместо трёх точек, подсказки — в чат.
// Остальная проводка — sayPhraseWiring.test.js, CSS — sayPhraseCssWiring.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const playerPanels = read('../../PlayerPanels.jsx')
const body = panelSrc['SayPhrasePanel.jsx']
const hook = panelSrc['useSayPhrase.js']

describe('say_phrase — эквалайзер, морфинг, подсказки в чате', () => {
  it('эквалайзер плеера этим модулем НЕ включается: ни forceEqualizer, ни публикации в audioLevel; голос видят только кольца (уровень по событиям; реальный — только по админскому флагу в sayRealLevel.js)', () => {
    for (const [name, src] of Object.entries(panelSrc)) {
      const code = src.replace(/\/\/.*$/gm, '')
      expect(code, name).not.toMatch(/forceEqualizer|publishLevel|unpublishLevel|audioLevel|lessonPrefs|AudioGlow/)
      expect(code, name).not.toMatch(/AnalyserNode|AudioContext|getUserMedia/)
    }
    expect(hook).toContain('onSignal: kind => voice.signal(kind, nowMs())')
    expect(hook).toContain('voice: levels') // источник уровня (синтетический или реальный) отдаётся панели для колец
    expect(panelSrc['SayStage.jsx']).toContain("useSayRings(ringsRef, { on: mode === 'prep' || mode === 'listening', listening: mode === 'listening', voice })")
    expect(read('../../AudioGlowGate.jsx')).toContain('useEqualizerEnabled()') // настройка шапки действует как обычно
  })

  it('морфинг вместо трёх точек: таймер morphEnd (MORPH_MS), «начали» = морфинг + audiostart; точек и красной точки нет нигде', () => {
    expect(hook).toContain("dispatch({ type: 'morphEnd' })")
    expect(hook).toContain('morphDelay(reducedMotion())')
    for (const [name, src] of Object.entries(panelSrc)) {
      const code = src.replace(/\/\/.*$/gm, '')
      expect(code, name).not.toMatch(/DOT_MS|dotsDone|dots\b|sayRecDot|sayMicDots|MIC_STARTING|MIC_PROCESSING/)
    }
    expect(body).toContain("sayLabel${square ? ' sayLabel--hidden' : ''}") // заголовок гаснет, пока кнопка — квадрат
    expect(hook).toContain("dispatch({ type: 'failEnd' })") // после крестика (FAIL_HOLD_MS) — снова прямоугольник
    expect(hook).toContain('FAIL_HOLD_MS')
  })

  it('в панели нет текстов-подсказок: ни sayStatus/sayInfo/«Почти!»/«Не хватило», подсказки уходят в ЧАТ через onAnswered(text, "hint") с задержкой после окна тишины', () => {
    for (const [name, src] of Object.entries(panelSrc)) {
      const code = src.replace(/\/\/.*$/gm, '')
      expect(code, name).not.toMatch(/sayStatus|sayInfo|say-status|say-hint|failureCopy|Почти!|Не хватило|MISSED_PREFIX/)
    }
    expect(body).toContain("onAnswered?.(text, 'hint')")
    expect(body).toContain('HINT_DELAY_MS')
    expect(body).toContain('clearTimeout(hintTimer.current)')
    expect(read('../../../../shared/lib/speech/sayHints.js')).toContain('HINT_DELAY_MS = QUIET_TAIL_MS + 60')
    // тот же путь, что у «Собери фразу»/«Напечатай слово»: handlePhraseAnswer → AnswerBubbles рисует 'hint' слева
    expect(playerPanels).toContain('handlePhraseAnswer(spNode.id, text, result, arriving)')
    expect(read('../../modules/AnswerBubbles.jsx')).toMatch(/b\.result === 'hint'\) return \(\s*<div key=\{i\} \{\.\.\.rowProps\(b, i, 'playerMsgRow'\)\}>/)
  })
})

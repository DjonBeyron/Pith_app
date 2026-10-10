import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка «Сказать фразу», часть 2: эквалайзер вместо квадрата-морфинга, замена источника уровня, реплика ученика и подсказки — в чат.
// Остальная проводка — sayPhraseWiring.test.js, CSS — sayPhraseCssWiring.test.js
const dir = fileURLToPath(new URL('.', import.meta.url))
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const panelFiles = readdirSync(dir).filter(f => /\.(jsx?)$/.test(f) && !f.endsWith('.test.js'))
const panelSrc = Object.fromEntries(panelFiles.map(f => [f, read(`./${f}`)]))
const playerPanels = read('../../PlayerPanels.jsx')
const body = panelSrc['SayPhrasePanel.jsx']
const hook = panelSrc['useSayPhrase.js']
const code = src => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('say_phrase — эквалайзер и источник уровня', () => {
  it('эквалайзер плеера этим модулем НЕ включается: ни forceEqualizer, ни публикации в audioLevel; getUserMedia/AudioContext только в sayRealLevel.js (админский флаг)', () => {
    for (const [name, src] of Object.entries(panelSrc)) {
      expect(code(src), name).not.toMatch(/forceEqualizer|publishLevel|unpublishLevel|audioLevel|lessonPrefs|AudioGlow/)
      expect(code(src), name).not.toMatch(/AnalyserNode|AudioContext|getUserMedia/)
    }
    expect(hook).toContain('onSignal: kind => voice.signal(kind, nowMs())')
    expect(read('../../AudioGlowGate.jsx')).toContain('useEqualizerEnabled()') // настройка шапки действует как обычно
  })

  it('уровень голоса — ЗАМЕНЯЕМЫЙ источник (подписка → значение каждый кадр): хук собирает его из levelSource, панель отдаёт в SayStage, SayStage — в useSayWaves; Vosk (реальный RMS его потока) подключён в одной строке хука', () => {
    expect(hook).toContain("import { createLevelSource } from '../../../../shared/lib/speech/sayLevelSource.js'")
    expect(hook).toMatch(/const \[levels\] = useState\(\(\) => \{ const sys = levelSource\(voice, real\); return createLevelSource\(t => ctrl\.level\(t\) \?\? sys\.ringLevel\(t\)\) \}\)/)
    expect(hook).toContain('level: levels')
    expect(hook).toContain('ТОЧКА ПОДКЛЮЧЕНИЯ ВТОРОГО ИСТОЧНИКА')
    expect(body).toContain('level={sp.level}')
    expect(panelSrc['SayStage.jsx']).toContain("useSayWaves({ eqRef, clipRef, anchorRef }, { on: live, source: level })")
    expect(read('../../../../shared/lib/speech/sayLevelSource.js')).toContain('subscribe(listener)')
  })

  it('мгновенный отклик: эквалайзер включается по режиму prep (phase run) в том же тапе, а не по событиям распознавания; первый кадр рисуется синхронно (layout-эффект + kickRings)', () => {
    const wave = panelSrc['useSayWaves.js']
    expect(read('../../../../shared/lib/speech/sayMic.js')).toContain("export const LIVE_MODES = ['prep', 'listening']")
    expect(read('../../../../shared/lib/speech/sayMic.js')).toContain("case 'run': return { label: SAY_LABEL, mode: go ? 'listening' : 'prep' }")
    expect(wave).toContain('useLayoutEffect')
    expect(wave).toContain('let levels = kickRings()')
    expect(wave.indexOf('paint()')).toBeLessThan(wave.indexOf('source.subscribe')) // кадр тапа — до первого rAF
    expect(hook).toMatch(/dispatch\(\{ type: 'begin'[^\n]*\)\n\s*ctrl\.start\(/) // phase 'run' ставится в том же тапе
  })

  it('движение — requestAnimationFrame общего источника и transform/opacity прямо на DOM: без setState/ререндеров, без setInterval, без CSS-переменных на каждый кадр', () => {
    const wave = code(panelSrc['useSayWaves.js'])
    expect(wave).toContain('el.style.transform = `scale(')
    expect(wave).toContain('el.style.opacity =')
    expect(wave).not.toMatch(/setState|useState|dispatch|setInterval|setTimeout|setProperty/)
    expect(wave).toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
    const src = code(read('../../../../shared/lib/speech/sayLevelSource.js'))
    expect(src).toContain('raf(tick)')
    expect(src).not.toMatch(/setInterval|setTimeout/)
  })

  it('амплитуда обрезается по контейнеру: хук меряет клип и центр круга (при старте и на resize) и считает радиус через ringFrame/clampRadius', () => {
    const wave = panelSrc['useSayWaves.js']
    expect(wave).toContain('getBoundingClientRect')
    expect(wave).toContain("window.addEventListener('resize', remeasure)")
    expect(wave).toContain("window.removeEventListener('resize', remeasure)")
    expect(wave).toContain('ringFrame(levels[i], i, box)')
    expect(read('../../../../shared/lib/speech/sayRings.js')).toContain('clampRadius(ringScale(level, i) * CIRCLE_R, box)')
  })
})

describe('say_phrase — круг-микрофон: без морфинга, без счётчика, без крестика', () => {
  it('удалены морфинг, квадрат, красный слой, крестик и «Попытка N»: ни файлов sayMorph/useSayRings, ни следов в коде панели и хука', () => {
    for (const [name, src] of Object.entries(panelSrc)) {
      expect(code(src), name).not.toMatch(/morph|Morph|MORPH|failShow|failEnd|FAIL_HOLD|\bsayRed\b|sayCells|sayAttempt|attemptText|ATTEMPT|isSquareMode|SQUARE|DOT_MS|dotsDone|sayRecDot|sayMicDots|MIC_STARTING|MIC_PROCESSING/)
      expect(code(src), name).not.toMatch(/<X |\bSquare\b/)
    }
    for (const gone of ['useSayRings.js']) expect(panelFiles).not.toContain(gone)
    expect(body).not.toMatch(/sayLabel|Попытка/)
    expect(hook).toContain("dispatch({ type: 'arm' })") // защита от двойного тапа вместо морфинга
    expect(hook).toContain('STOP_ARM_MS')
  })

  it('надпись над кругом — отдельный компонент с aria-live и кросс-фейдом; тексты берутся из sayTexts.js, а не размазаны по JSX', () => {
    const cap = panelSrc['SayCaption.jsx']
    expect(cap).toContain('aria-live="polite"')
    expect(cap).toContain('role="status"')
    expect(cap).toContain("import { MIC_IDLE, SAY_LABEL, MIC_RETRY, MIC_OFF, MIC_UNAVAILABLE } from '../../../../shared/lib/speech/sayTexts.js'")
    for (const text of ['Нажмите, чтобы говорить', 'Произнесите фразу', 'Попробуйте сказать ещё раз', 'Готово']) {
      for (const [name, src] of Object.entries(panelSrc)) expect(code(src), `${name}: «${text}»`).not.toContain(text)
    }
    expect(panelSrc['SayStage.jsx']).toContain('<SayCaption label={label} />')
    expect(panelSrc['SayStage.jsx']).toContain("aria-label={aria}")
    expect(panelSrc['SayStage.jsx']).toContain('<Check ')
  })

  it('«Я не могу говорить» гаснет, пока идёт запись и на «Готово» (но не при выключенном микрофоне — это единственный выход)', () => {
    expect(body).toContain("const hideSkip = isLiveMode(mic.mode) || mic.mode === 'ok'")
    expect(body).toContain('hideSkip={hideSkip}')
  })
})

describe('say_phrase — чат: реплика ученика и подсказки', () => {
  it('в панели нет текстов-подсказок: ни sayStatus/sayInfo/«Почти!»/«Не хватило»', () => {
    for (const [name, src] of Object.entries(panelSrc)) {
      expect(code(src), name).not.toMatch(/sayStatus|sayInfo|say-status|say-hint|failureCopy|Почти!|Не хватило|MISSED_PREFIX/)
    }
  })

  it('неудача → в чат: сначала реплика ученика (wrong_final, как неверные ответы «Напечатай слово»), затем подсказка (hint); обе через HINT_DELAY_MS', () => {
    expect(body).toContain("if (reply) onAnswered?.(reply, 'wrong_final')")
    expect(body).toContain("if (hint) onAnswered?.(hint, 'hint')")
    expect(body.indexOf("onAnswered?.(reply, 'wrong_final')")).toBeLessThan(body.indexOf("onAnswered?.(hint, 'hint')"))
    expect(body).toContain('HINT_DELAY_MS')
    expect(body).toContain('[failNo]')
    expect(read('../../../../shared/lib/speech/sayHints.js')).toContain('HINT_DELAY_MS = QUIET_TAIL_MS + 60')
    // тот же путь и тот же тег, что у остальных модулей: handlePhraseAnswer → AnswerBubbles рисует wrong_final справа, hint — слева
    expect(playerPanels).toContain('handlePhraseAnswer(spNode.id, text, result, arriving)')
    const bubbles = read('../../modules/AnswerBubbles.jsx')
    expect(bubbles).toMatch(/b\.result === 'wrong_final'\) return \(\s*<div key=\{i\} \{\.\.\.rowProps\(b, i, 'playerMsgRow playerMsgRowRight'\)\}>/)
    expect(bubbles).toMatch(/b\.result === 'hint'\) return \(\s*<div key=\{i\} \{\.\.\.rowProps\(b, i, 'playerMsgRow'\)\}>/)
    expect(read('../type-word/TypeWordPanel.jsx')).toContain("onAnswered?.(typed, 'wrong_final')") // эталон: так неверный ответ ученика уходит в чат там
  })

  it('новая попытка и «Я не могу говорить» не теряют реплику: flushPending отправляет её сразу, отменяя только подсказку; успех реплику не шлёт', () => {
    expect(body).toMatch(/function flushPending\(\) \{\s*clearTimeout\(hintTimer\.current\)\s*const reply = pendingReply\.current\s*pendingReply\.current = null\s*if \(reply\) onAnswered\?\.\(reply, 'wrong_final'\)/)
    expect(body).toMatch(/function tapMic\(\) \{\s*flushPending\(\)/)
    expect(body).toMatch(/closingRef\.current = true\s*flushPending\(\)/)
    expect(body).toContain("onAnswered?.(data.phrase, 'correct', true)") // после успеха — прежний пузырь с эталонной фразой
  })
})

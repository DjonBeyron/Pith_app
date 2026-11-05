import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RaceAskScene } from './RaceAskPlate.jsx'
import { VOICE_CHOICE_KEY, ASK_LINE, askText, readVoiceChoice, writeVoiceChoice, tapFor, createTapGuard } from './raceAskVoice.js'
import { RACE_LINES } from './raceLines.js'
import { TAP_KEY, readTapMode, writeTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'

// Плашка-вопрос «сможешь говорить?» перед стартом гонки (стенд): выбор запоминается, «Тапаю» включает тап на эту игру, потом прежнее значение возвращается; старт — из обработчика кнопки плашки (жест).
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const html = props => renderToStaticMarkup(createElement(RaceAskScene, { choice: 'voice', onPick() {}, onCancel() {}, ...props }))

describe('выбор «Говорю / Тапаю»: хранилище', () => {
  it('ключ pithy_race_voice_choice_v1; по умолчанию «Говорю»; запоминается; мусор и сбой хранилища — «Говорю»', () => {
    const s = memory()
    expect(VOICE_CHOICE_KEY).toBe('pithy_race_voice_choice_v1'); expect(readVoiceChoice(s)).toBe('voice')
    writeVoiceChoice('tap', s); expect(s.m.get(VOICE_CHOICE_KEY)).toBe('tap'); expect(readVoiceChoice(s)).toBe('tap')
    writeVoiceChoice('voice', s); expect(readVoiceChoice(s)).toBe('voice')
    writeVoiceChoice('мусор', s); expect(s.m.get(VOICE_CHOICE_KEY)).toBe('voice'); s.setItem(VOICE_CHOICE_KEY, 'x'); expect(readVoiceChoice(s)).toBe('voice')
    expect(readVoiceChoice({ getItem() { throw new Error('нет') } })).toBe('voice'); expect(readVoiceChoice(null)).toBe('voice'); expect(() => writeVoiceChoice('tap', { setItem() { throw new Error('нет') } })).not.toThrow()
  })
  it('«Тапаю» включает тап, «Говорю» выключает', () => { expect(tapFor('tap')).toBe(true); expect(tapFor('voice')).toBe(false) })
  it('реплика race_ask_voice в каталоге, без точек и тире, текст вопроса — оттуда', () => {
    const l = RACE_LINES.find(x => x.id === ASK_LINE)
    expect(l.text).toBe('Сможешь сейчас говорить вслух или сыграем тапами?'); expect(l.text).not.toMatch(/[.…!—–]/); expect(l.when).toBeTruthy(); expect(askText()).toBe(l.text)
  })
})

describe('режим тапа на время игры (createTapGuard)', () => {
  const s = memory()
  const flow = (choice, statuses) => { // повторяет useRaceAsk: begin → запись → статусы модуля
    const g = createTapGuard()
    g.begin(readTapMode(s)); writeTapMode(tapFor(choice), s)
    const during = readTapMode(s)
    for (const st of statuses) { const back = g.watch(st); if (back != null) writeTapMode(back, s) }
    return { during, after: readTapMode(s), g }
  }
  it('«Тапаю» на игру, после игры возвращается прежнее (выкл → вкл → выкл)', () => {
    writeTapMode(false, s)
    const r = flow('tap', [{ phase: 'wait', busy: true }, { phase: 'game' }, { phase: 'game' }, { phase: 'wait' }])
    expect(r.during).toBe(true); expect(r.after).toBe(false); expect(r.g.pending()).toBe(false)
  })
  it('«Говорю» выключает тап на игру, если он был включён в «Настройках», и возвращает включённым', () => {
    writeTapMode(true, s)
    const r = flow('voice', [{ phase: 'game' }, { phase: 'wait' }])
    expect(r.during).toBe(false); expect(r.after).toBe(true); expect(s.getItem(TAP_KEY)).toBe('1')
  })
  it('пока игра не началась, значение не возвращается; проблема запуска (микрофон) — возвращается; второй запуск не запоминает уже изменённое', () => {
    writeTapMode(false, s)
    const g = createTapGuard()
    g.begin(readTapMode(s)); writeTapMode(true, s)
    expect(g.watch({ phase: 'wait', busy: true })).toBeNull(); expect(g.watch({ phase: 'wait', busy: false, ready: true })).toBeNull(); expect(g.pending()).toBe(true)
    g.begin(readTapMode(s)) // запуск повторён, а прежний не вернулся: помним самое первое значение
    expect(g.watch({ phase: 'wait', problem: 'Нет доступа к микрофону' })).toBe(false); expect(g.pending()).toBe(false); expect(g.watch({ phase: 'wait' })).toBeNull()
  })
})

describe('попап «Говорю / Тапаю» внутри игры (RaceAskPlate) и проводка', () => {
  it('внутри сцены игры (.wl > .wlStage с узором), плашка в стиле .wlTurn, текст вопроса, две кнопки; прошлый выбор подсвечен; Пита и заставки в сцене нет', () => {
    const h = html({})
    expect(h).toContain('class="wl"'); expect(h).toContain('class="wlStage" data-tex=""'); expect(h).toContain('class="wlTurn raceAskPlate"'); expect(h).toContain('role="dialog"'); expect(h).toContain(askText())
    expect(h).toContain('data-testid="race-ask-voice"'); expect(h).toContain('>Говорю<'); expect(h).toContain('data-testid="race-ask-tap"'); expect(h).toContain('>Тапаю<')
    expect(h.match(/data-main="1"/g)).toHaveLength(1); expect(h.indexOf('data-main')).toBeLessThan(h.indexOf('data-testid="race-ask-tap"')) // подсвечена «Говорю»
    expect(html({ choice: 'tap' }).indexOf('data-main')).toBeGreaterThan(html({ choice: 'tap' }).indexOf('data-testid="race-ask-voice"')) // подсвечена «Тапаю»
    expect(html({ lite: true })).not.toContain('data-tex'); expect(h).toContain('wlClose')
    for (const k of ['wlCat', 'raceCharge', 'wlPill', 'wlLanes', 'data-testid="wl-field"']) expect(h).not.toContain(k) // до ответа ничего из игры не рисуется
  })
  it('кнопка админ-блока только открывает сцену (launch → start() → openAsk); попапа в админ-блоке больше нет; выбор — жест в модуле игры', () => {
    const block = read('../admin/speech/RaceBlock.jsx'), mod = read('../player/modules/rotate-phone/RotatePhoneModule.jsx')
    for (const k of ['launch(STAGES_ROUND)', 'launch(null)', 'launch(r)']) expect(block).toContain(k)
    expect(block).toContain('const launch = useCallback(id => { flushSync(() => setRound(id)); startRef.current?.() }'); expect(block).not.toMatch(/import [^\n]*RaceAsk/); expect(block).not.toMatch(/import [^\n]*useRaceAsk/); expect(block).toContain('onTap={setTap}')
    const start = mod.slice(mod.indexOf('const start = useCallback'), mod.indexOf('/** «Говорю» / «Тапаю»'))
    expect(start).toContain("if (race) { openAsk({ fullscreen, setPhase }); return }"); expect(start.indexOf('openAsk(')).toBeLessThan(start.indexOf('startGameAudio(')) // у гонки start() до ответа startGameAudio не зовёт
    const pick = mod.slice(mod.indexOf('const pick = useCallback'), mod.indexOf('const cancelAsk'))
    expect(pick).toContain('answerAsk('); expect(pick).toContain('startGameAudio({ cfg, audioSrc, lines, ...hooks })'); expect(mod).toContain("{phase === 'ask' && <RaceAskPlate choice={ask.choice} onPick={pick} onCancel={cancelAsk} />}")
    expect(mod).toContain("const game = phase === 'game' && <WordLaneGame") // игра (Пит, заставка, реплики, конвейер) монтируется только после ответа
    expect(mod).toContain("askAuto") // стенд отвечает сам
  })
  it('в игре гонки подсказки «Тап вместо речи» нет, фон с узором только у гонки и не на lite; репетиция и обычная нода — как были', () => {
    const g = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(g).toContain("const race = cfg.plan?.game === 'race'"); expect(g).toContain("{tapMode && !race && phase === 'student' && <div className=\"wlTapHint\"")
    expect(g).toContain("<div className=\"wlStage\" data-tex={race && !lite ? '' : undefined}>")
    const css = read('../../styles/player/modules/race-stage-bg.css').replace(/\/\*[\s\S]*?\*\//g, '') // без комментария
    const op = Number(/opacity:\s*([\d.]+)/.exec(css)?.[1])
    expect(op).toBeGreaterThanOrEqual(0.04); expect(op).toBeLessThanOrEqual(0.06)
    expect(css).not.toMatch(/animation|transition|filter\s*:|transform\s*:/); expect(css).toContain('.wlStage[data-tex]::before'); expect(css).toContain('pointer-events: none'); expect(css).toContain('.weak-device .wlStage[data-tex]::before { display: none; }')
    expect(css).toContain("%3Cpath d='M26 30 C28 18 44 14 54 22") // тайл узора плашек (word-lane-plate.css)
    expect(read('../../styles/player/modules/word-lane-plate.css')).toContain("%3Cpath d='M26 30 C28 18 44 14 54 22")
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-stage-bg.css'")
  })
})

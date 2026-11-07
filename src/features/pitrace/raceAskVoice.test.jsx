import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RaceAskScene } from './RaceAskPlate.jsx'
import { VOICE_CHOICE_KEY, ASK_LINE, askText, readVoiceChoice, writeVoiceChoice, tapFor, createTapGuard, WAIT_LABELS } from './raceAskVoice.js'
import { micHelp, MIC_NOTE_TEXT, MIC_HELP_TEXTS, RETRY_LABEL } from './raceMicHelp.js'
import { RACE_LINES } from './raceLines.js'
import { TAP_KEY, readTapMode, writeTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'

// Плашка-вопрос «сможешь говорить?» перед стартом гонки (стенд): выбор запоминается, «Пальцами» включает тап на эту игру, потом прежнее значение возвращается; старт — из обработчика кнопки плашки (жест).
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const html = props => renderToStaticMarkup(createElement(RaceAskScene, { choice: 'voice', onPick() {}, onCancel() {}, ...props }))

describe('выбор «Голосом / Пальцами»: хранилище', () => {
  it('ключ pithy_race_voice_choice_v1; по умолчанию «Голосом»; запоминается; мусор и сбой хранилища — «Голосом»', () => {
    const s = memory()
    expect(VOICE_CHOICE_KEY).toBe('pithy_race_voice_choice_v1'); expect(readVoiceChoice(s)).toBe('voice')
    writeVoiceChoice('tap', s); expect(s.m.get(VOICE_CHOICE_KEY)).toBe('tap'); expect(readVoiceChoice(s)).toBe('tap')
    writeVoiceChoice('voice', s); expect(readVoiceChoice(s)).toBe('voice')
    writeVoiceChoice('мусор', s); expect(s.m.get(VOICE_CHOICE_KEY)).toBe('voice'); s.setItem(VOICE_CHOICE_KEY, 'x'); expect(readVoiceChoice(s)).toBe('voice')
    expect(readVoiceChoice({ getItem() { throw new Error('нет') } })).toBe('voice'); expect(readVoiceChoice(null)).toBe('voice'); expect(() => writeVoiceChoice('tap', { setItem() { throw new Error('нет') } })).not.toThrow()
  })
  it('«Пальцами» включает тап, «Голосом» выключает', () => { expect(tapFor('tap')).toBe(true); expect(tapFor('voice')).toBe(false) })
  it('реплика race_ask_voice в каталоге, без точек и тире, текст вопроса — оттуда', () => {
    const l = RACE_LINES.find(x => x.id === ASK_LINE)
    expect(l.text).toBe('Как будешь ловить слова, голосом или руками?'); expect(l.text).not.toMatch(/[.…!—–]/); expect(l.when).toBeTruthy(); expect(askText()).toBe(l.text)
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
  it('«Пальцами» на игру, после игры возвращается прежнее (выкл → вкл → выкл)', () => {
    writeTapMode(false, s)
    const r = flow('tap', [{ phase: 'ask' }, { phase: 'game' }, { phase: 'game' }, { phase: 'wait' }])
    expect(r.during).toBe(true); expect(r.after).toBe(false); expect(r.g.pending()).toBe(false)
    const mid = flow('tap', [{ phase: 'ask' }, { phase: 'game' }]); expect(mid.after).toBe(true); expect(mid.g.pending()).toBe(true) // идёт игра — режим тапа держится
  })
  it('«Голосом» выключает тап на игру, если он был включён в «Настройках», и возвращает включённым', () => {
    writeTapMode(true, s)
    const r = flow('voice', [{ phase: 'game' }, { phase: 'wait' }])
    expect(r.during).toBe(false); expect(r.after).toBe(true); expect(s.getItem(TAP_KEY)).toBe('1')
  })
  it('пока виден попап (ждём микрофон / микрофон не дали) — не возвращается; попап закрыт крестиком — возвращается; второй выбор не запоминает уже изменённое', () => {
    writeTapMode(false, s)
    const g = createTapGuard()
    g.begin(readTapMode(s)); writeTapMode(false, s) // «Голосом»
    expect(g.watch({ phase: 'ask' })).toBeNull(); expect(g.pending()).toBe(true) // микрофон не дали — остались в попапе
    g.begin(readTapMode(s)); writeTapMode(true, s) // теперь «Пальцами»: помним самое первое значение
    expect(g.watch({ phase: 'ask' })).toBeNull()
    expect(g.watch({ phase: 'wait' })).toBe(false); expect(g.pending()).toBe(false); expect(g.watch({ phase: 'wait' })).toBeNull()
  })
})

describe('попап «Голосом / Пальцами» внутри игры (RaceAskPlate) и проводка', () => {
  it('внутри сцены игры (.wl > .wlStage с узором), плашка в стиле .wlTurn, текст вопроса, две кнопки; прошлый выбор подсвечен; Пита и заставки в сцене нет', () => {
    const h = html({})
    expect(h).toContain('class="wl"'); expect(h).toContain('class="wlStage" data-tex=""'); expect(h).toContain('class="wlTurn raceAskPlate"'); expect(h).toContain('role="dialog"'); expect(h).toContain(askText())
    expect(h).toContain('data-testid="race-ask-voice"'); expect(h).toContain('>Голосом<'); expect(h).toContain('data-testid="race-ask-tap"'); expect(h).toContain('>Пальцами<')
    expect(h.match(/data-main="1"/g)).toHaveLength(1); expect(h.indexOf('data-main')).toBeLessThan(h.indexOf('data-testid="race-ask-tap"')) // подсвечена «Голосом»
    expect(html({ choice: 'tap' }).indexOf('data-main')).toBeGreaterThan(html({ choice: 'tap' }).indexOf('data-testid="race-ask-voice"')) // подсвечена «Пальцами»
    expect(html({ lite: true })).not.toContain('data-tex'); expect(h).toContain('wlClose')
    for (const k of ['wlCat', 'raceCharge', 'wlPill', 'wlLanes', 'data-testid="wl-field"']) expect(h).not.toContain(k) // до ответа ничего из игры не рисуется
  })
  it('кнопка админ-блока только открывает сцену (launch → start() → openAsk); попапа в админ-блоке больше нет; выбор — жест в модуле игры', () => {
    const block = read('../admin/speech/RaceBlock.jsx'), mod = read('../player/modules/rotate-phone/RotatePhoneModule.jsx')
    for (const k of ['launch(STAGES_ROUND)', 'launch(null)', 'launch(r)']) expect(block).toContain(k)
    expect(block).toContain('const launch = useCallback(id => { flushSync(() => setRound(id)); startRef.current?.() }'); expect(block).not.toMatch(/import [^\n]*RaceAsk/); expect(block).not.toMatch(/import [^\n]*useRaceAsk/); expect(block).toContain('onTap={setTap}')
    const start = mod.slice(mod.indexOf('const start = useCallback'), mod.indexOf('/** Касание по «Тапни'))
    expect(start).toContain('if (race) { openRace(fullscreen); return }'); expect(start.indexOf('openRace(')).toBeLessThan(start.indexOf('startGameAudio(')) // у гонки start() до ответа startGameAudio не зовёт
    const hook = read('./useRaceLaunch.js')
    const pick = hook.slice(hook.indexOf('const pick = useCallback'), hook.indexOf('const cancel = useCallback'))
    expect(pick).toContain('answerAsk('); expect(pick).toContain('startGameAudio({ cfg, audioSrc, lines, ...hooks })'); expect(mod).toContain("{phase === 'ask' && <RaceAskPlate {...rl.plate} />}")
    expect(pick).toContain('release(); setHint(micHelp(mic, isStandalone()))') // микрофон не дали — звук и микрофон отпущены, плашка в попапе по режиму (Safari / «Домой»)
    expect(hook).toContain('plate: { choice: ask.choice, wait, hint, note, tip, onTipClose: () => setTip(false), text: askText(lines), onPick: pick, onCancel: cancel }')
    expect(hook).toContain('needsMicNote({ alive: gameMicAlive(), grantedAt: readMicGrantedAt(), now: Date.now() }) ? MIC_NOTE_TEXT') // подсказка до тапа — при открытии попапа
    expect(mod).toContain("const game = phase === 'game' && <WordLaneGame") // игра (Пит, заставка, реплики, конвейер) монтируется только после ответа
    expect(mod).toContain('askAuto') // стенд отвечает сам
  })
  it('«Голосом» ждёт микрофон в попапе: кнопка «Разрешите микрофон…» / «Готовлю звук…», обе кнопки неактивны; отказ — подсказка, «Пальцами» доступно', () => {
    const w = html({ wait: 'mic' })
    expect(w).toContain('>Разрешите микрофон…<'); expect(w).toContain('data-wait="mic"'); expect(w.match(/disabled=""/g)).toHaveLength(2); expect(w).not.toContain('race-ask-hint')
    expect(html({ wait: 'sound' })).toContain('>Готовлю звук…<')
    const d = html({ hint: micHelp('denied', false), note: MIC_NOTE_TEXT })
    expect(d).toContain('data-testid="race-ask-hint"'); expect(d).toContain('>Микрофон не разрешён<'); expect(d).not.toContain('disabled'); expect(d).toContain('>Пальцами<'); expect(d).toContain(`>${RETRY_LABEL}<`)
    expect(d).toContain(MIC_HELP_TEXTS.safari.replace(/«/g, '«')); expect(d.indexOf('race-ask-help-safari')).toBeLessThan(d.indexOf('race-ask-help-home')); expect(d).not.toContain('race-ask-note') // отказ: подсказки «спросит» нет
    expect(html({ hint: micHelp('unavailable', true) }).indexOf('race-ask-help-home')).toBeLessThan(html({ hint: micHelp('unavailable', true) }).indexOf('race-ask-help-safari'))
    const n = html({ note: MIC_NOTE_TEXT })
    expect(n).toContain('data-testid="race-ask-note"'); expect(n).toContain('один раз за запуск'); expect(n).toContain('>Голосом<'); expect(html({})).not.toContain('race-ask-note')
    expect(WAIT_LABELS.mic).toBe('Разрешите микрофон…')
  })
  it('в игре гонки подсказки «Тап вместо речи» нет, фон с узором только у гонки и не на lite; репетиция и обычная нода — как были', () => {
    const g = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(g).toContain("const race = cfg.plan?.game === 'race'"); expect(g).toContain("{tapMode && !race && phase === 'student' && <div className=\"wlTapHint\"")
    expect(g).toContain("<div className=\"wlStage\" data-tex={race && !lite ? '' : undefined}>")
    const css = read('../../styles/player/modules/race-stage-bg.css').replace(/\/\*[\s\S]*?\*\//g, '') // без комментария
    const op = Number(/opacity:\s*([\d.]+)/.exec(css)?.[1])
    expect(op).toBeGreaterThanOrEqual(0.04); expect(op).toBeLessThanOrEqual(0.06)
    expect(css).not.toMatch(/animation|transition|filter\s*:|transform\s*:/); expect(css).toContain('.wlStage[data-tex]::before'); expect(css).toContain('pointer-events: none'); expect(css).toContain('.weak-device .wlStage[data-tex]::before { display: none; }')
    expect(css).toContain("%3Cpath d='M28 118 C34 92 66 82 92 94") // v3.3.117: хаотичный узор плашки «Старт» уроков (--mg-tex-start, lessons-chain-textures.css)
    expect(read('../../styles/player/modules/word-lane-plate.css')).toContain("%3Cpath d='M26 30 C28 18 44 14 54 22")
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-stage-bg.css'")
  })
})

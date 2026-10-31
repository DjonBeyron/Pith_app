import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Режим звука, прогон по режимам и озвучка в «Шлифовке репетиции»: рендер частей, ход хука прогона (хуки React выполняются «как есть», как в wordLaneCommentFlow.test.jsx), проводка блока
const h = vi.hoisted(() => ({ states: [], refs: [], i: 0, r: 0, effects: [] }))
vi.mock('react', async orig => ({
  ...(await orig()),
  useState: init => { const k = h.i++; if (!(k in h.states)) h.states[k] = typeof init === 'function' ? init() : init; return [h.states[k], v => { h.states[k] = typeof v === 'function' ? v(h.states[k]) : v }] },
  useRef: init => { const k = h.r++; if (!(k in h.refs)) h.refs[k] = { current: init }; return h.refs[k] },
  useCallback: fn => fn,
  useEffect: fn => { h.effects.push(fn) },
}))
vi.mock('../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) }))

import PolishAudioMode from './PolishAudioMode.jsx'
import PolishVoice from './PolishVoice.jsx'
import PolishCardLines from './PolishCardLines.jsx'
import PolishListen from './PolishListen.jsx'
import RehearsalPolishBlock from './RehearsalPolishBlock.jsx'
import usePolishAudioRun from './usePolishAudioRun.js'
import { PRESET_KEY, currentPresetId } from '../../rehearsal/polish/audioPresets.js'
import { RUNS_KEY, listRuns } from '../../rehearsal/polish/audioRunLog.js'
import { setLastWordLaneSession } from '../../player/modules/rotate-phone/wordLaneLastDump.js'
import { POLISH_ACTS } from '../../rehearsal/polish/polishActs.js'
import { OPEN_KEY } from './usePolishOpen.js'
import { REHEARSAL_LINES } from '../../rehearsal/rehearsalLines.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { MIC_HOLD_KEY } from '../../../shared/lib/gameAudioSettings.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
beforeEach(() => { h.states = []; h.refs = []; h.i = 0; h.r = 0; h.effects = [] })
afterEach(() => { vi.unstubAllGlobals(); setLastWordLaneSession(null) })

const acts = POLISH_ACTS.map(a => ({ id: a.id, title: a.title, ok: true }))
const audioStub = (o = {}) => ({ selected: 'A', select() {}, run: null, count: 0, now: 'A', startRun() {}, stopRun() {}, clear() {}, ...o })
const voiced = ids => normalizeLines({ lines: Object.fromEntries(ids.map(id => [id, { text: REHEARSAL_LINES.find(l => l.id === id).text, url: `https://r2/${id}.mp3`, duration: 2 }])) })
const voiceStub = (o = {}) => ({ lines: voiced(['rh_start']), pit: { done: 1, total: 12 }, chunks: { done: 2, total: 5 }, busy: '', step: '', error: '', chunkErrors: {}, voicePit() {}, voiceChunks() {}, ...o })

describe('селектор режима звука', () => {
  it('восемь режимов A…H с короткими подписями, выбранный отмечен, под ним — что внутри и что пишется в журнал', () => {
    const out = renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub({ selected: 'C' }), acts }))
    expect(out.match(/<option value="[A-H]"/g)).toHaveLength(8)
    expect(out).toContain('C — Запись+воспр., закрывать микрофон на речь Пита'); expect(out).toMatch(/<option value="C" selected/)
    expect(out).toContain('внутри: сессия play-and-record · дорожка close · обработка выкл'); expect(out).toContain('пишется в журнал')
  })
  it('настройки изменены вручную — подпись «custom»; блокируется, пока идёт игра или прогон', () => {
    const custom = renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub({ now: 'custom', selected: 'B' }), acts }))
    expect(custom).toContain('data-testid="rh-polish-audio-custom"'); expect(custom).toContain('при запуске вернутся к B')
    expect(renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub(), acts, locked: true }))).toMatch(/<select[^>]*disabled=""[^>]*data-testid="rh-polish-audio-select"/)
  })
  it('«Прогон по режимам» + выбор этапа (недоступные этапы плана выключены); во время прогона — шаг виден, «Запустить B», «Остановить прогон»', () => {
    const base = renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub(), acts: [{ id: 'intro', title: 'Заставка', ok: true }, { id: 'read', title: 'Читка', ok: false }] }))
    expect(base).toContain('data-testid="rh-polish-run-modes"'); expect(base).toMatch(/<option value="read" disabled=""/); expect(base).not.toContain('rh-polish-run-status')
    const mid = renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub({ run: { act: 'build', step: 1, state: 'ready' }, selected: 'B' }), acts }))
    expect(mid).toContain('Шаг 2 из 8'); expect(mid).toContain('>Запустить B<'); expect(mid).toContain('Остановить прогон'); expect(mid).toContain('A ✓'); expect(mid).toContain('B ←')
    expect(mid).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-run-modes"/)
    const playing = renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub({ run: { act: 'build', step: 2, state: 'playing' } }), acts }))
    expect(playing).toContain('идёт режим C'); expect(playing).not.toContain('rh-polish-run-next')
    const done = renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub({ run: { act: 'build', step: 7, state: 'finished' } }), acts }))
    expect(done).toContain('Прогон завершён'); expect(done).toContain('Закрыть прогон')
  })
  it('«Экспорт прогонов» доступен, когда есть журналы запусков', () => {
    expect(renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub({ count: 0 }), acts }))).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-runs-export"/)
    const out = renderToStaticMarkup(createElement(PolishAudioMode, { a: audioStub({ count: 3 }), acts }))
    expect(out).toContain('Журналов запусков в браузере: 3'); expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-runs-export"/)
  })
})

describe('озвучка реплик и кусков', () => {
  it('строка «Реплики Пита: озвучено N из M» и кнопка «Озвучить реплики (ElevenLabs)»; строка про куски и «Озвучить куски фразы»', () => {
    const out = renderToStaticMarkup(createElement(PolishVoice, { v: voiceStub() }))
    expect(out).toContain('Реплики Пита: озвучено 1 из 12'); expect(out).toContain('Озвучить реплики (ElevenLabs)')
    expect(out).toContain('Куски и слова фразы: озвучено 2 из 5'); expect(out).toContain('Озвучить куски фразы')
  })
  it('список «без озвучки» с причиной: нет озвучки / {word} не озвучивается', () => {
    const out = renderToStaticMarkup(createElement(PolishVoice, { v: voiceStub() }))
    expect(out).toContain('data-testid="rh-polish-unvoiced-rh_warmup"'); expect(out).toContain('нет озвучки')
    expect(out).toContain('data-testid="rh-polish-unvoiced-rh_blind_hint"'); expect(out).toContain('{word} не озвучивается')
    expect(out).not.toContain('data-testid="rh-polish-unvoiced-rh_start"')
  })
  it('прогресс «озвучиваю rh_start…», кнопки заблокированы; ошибка текстом; всё озвучено — кнопки неактивны', () => {
    const busy = renderToStaticMarkup(createElement(PolishVoice, { v: voiceStub({ busy: 'lines', step: 'rh_start' }) }))
    expect(busy).toContain('озвучиваю rh_start…'); expect(busy).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-voice-pit"/); expect(busy).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-voice-chunks"/)
    const err = renderToStaticMarkup(createElement(PolishVoice, { v: voiceStub({ error: 'Нужны права админа' }) }))
    expect(err).toContain('role="alert"'); expect(err).toContain('Реплики не озвучились: Нужны права админа')
    const all = renderToStaticMarkup(createElement(PolishVoice, { v: voiceStub({ pit: { done: 12, total: 12 }, chunks: { done: 5, total: 5 } }) }))
    expect(all).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rh-polish-voice-pit"/); expect(all).toContain('Реплики озвучены')
    expect(renderToStaticMarkup(createElement(PolishVoice, { v: voiceStub({ lines: null }) }))).toContain('загружаю…')
  })
  it('карточка этапа: «озвучено 2/7», у озвученных — «Послушать» с <audio src>, у остальных причина', () => {
    const out = renderToStaticMarkup(createElement(PolishCardLines, { act: 'build', lines: voiced(['rh_build', 'rh_clear']) }))
    expect(out).toContain('Реплики Пита: озвучено 2/7')
    expect(out.match(/>Послушать</g)).toHaveLength(2); expect(out).toContain('<audio src="https://r2/rh_build.mp3"'); expect(out).toContain('data-testid="rh-polish-listen-rh_clear"')
    expect(out).toContain('нет озвучки')
    const blind = renderToStaticMarkup(createElement(PolishCardLines, { act: 'blind', lines: voiced(['rh_blind']) }))
    expect(blind).toContain('озвучено 1/2'); expect(blind).toContain('+ 1 со словом, не озвучивается'); expect(blind).toContain('{word} не озвучивается')
    expect(renderToStaticMarkup(createElement(PolishCardLines, { act: 'intro', lines: null }))).toContain('загружаю…')
  })
  it('«Послушать»: <audio> с url озвучки, воспроизведение — в тапе', () => {
    const out = renderToStaticMarkup(createElement(PolishListen, { url: 'https://r2/x.mp3', testid: 'ls' }))
    expect(out).toContain('data-testid="ls"'); expect(out).toContain('src="https://r2/x.mp3"'); expect(read('./PolishListen.jsx')).toContain('a.play()')
  })
})

describe('блок целиком', () => {
  it('селектор режимов и строка реплик в «Настройках» над карточками; на каждой развёрнутой карточке свои реплики', () => {
    vi.stubGlobal('localStorage', memStore({ [PRESET_KEY]: 'F', [OPEN_KEY]: JSON.stringify(['settings', ...POLISH_ACTS.map(a => a.id)]) }))
    const out = renderToStaticMarkup(createElement(RehearsalPolishBlock))
    const at = id => out.indexOf(`data-testid="${id}"`)
    expect(at('rh-polish-audio')).toBeGreaterThan(0); expect(at('rh-polish-audio')).toBeLessThan(at('rh-polish-voice')); expect(at('rh-polish-voice')).toBeLessThan(at('rh-polish-list'))
    expect(out).toMatch(/<option value="F" selected/); expect(out).toContain('data-testid="rh-polish-run-modes"'); expect(out).toContain('data-testid="rh-polish-pit"')
    for (const a of POLISH_ACTS) expect(out).toContain(`data-testid="rh-polish-lines-${a.id}"`)
  })
  it('«Настройки» свёрнуты — режима звука и озвучки на экране нет, но сводка знает режим F', () => {
    vi.stubGlobal('localStorage', memStore({ [PRESET_KEY]: 'F' }))
    const out = renderToStaticMarkup(createElement(RehearsalPolishBlock))
    expect(out).not.toContain('data-testid="rh-polish-audio"'); expect(out).not.toContain('data-testid="rh-polish-voice"'); expect(out).toContain('звук F')
  })
})

describe('ход хука usePolishAudioRun', () => {
  const draw = (status, store) => { h.i = 0; h.r = 0; h.effects = []; const r = usePolishAudioRun({ status, store }); h.effects.forEach(f => f()); return r }
  const dump = () => ({ startedAt: 'x', phrase: 'a | b', events: [], mic: { game: { open: true, platform: 'ios', processing: false, audioSessionMode: 'play-and-record', micHoldMode: 'close' } } })

  it('режим применяется до запуска: к моменту start() три настройки уже записаны (C) и строка [audio-mode] в журнале', () => {
    const store = memStore({ [PRESET_KEY]: 'C' })
    const order = []
    const hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    order.push(`before:${currentPresetId(store)}`)
    hook.beforeLaunch('build')
    order.push(`after-apply:${currentPresetId(store)}`)
    expect(order).toEqual(['before:B', 'after-apply:C']) // start() модуля зовётся после beforeLaunch — см. проводку в блоке
    expect(store.m[MIC_HOLD_KEY]).toBe('close')
  })
  it('выход из игры: запись в копилку (этап, режим, журнал игры); одиночный запуск без прогона — шаг null', () => {
    const store = memStore({ [PRESET_KEY]: 'C' })
    setLastWordLaneSession({ enabled: true, dump })
    let hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    hook.beforeLaunch('read')
    draw({ phase: 'game', busy: false, problem: '' }, store)
    hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    const [rec] = listRuns(store)
    expect(rec).toMatchObject({ act: 'read', step: null, preset: { id: 'C' } }); expect(rec.gameLog.join('\n')).toContain('Режим звука: C')
    expect(Object.keys(store.m)).toContain(RUNS_KEY)
    expect(hook.run).toBeNull()
  })
  it('прогон: A → после выхода из игры выбран B и ждёт жеста (сам не стартует); игра не открылась — шаг тот же; после H — завершён', () => {
    const store = memStore()
    setLastWordLaneSession({ enabled: true, dump })
    let hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    hook.startRun('build')
    hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    expect(hook.run).toEqual({ act: 'build', step: 0, state: 'ready' }); expect(hook.selected).toBe('A')
    expect(hook.beforeLaunch('build')).toBe('A')
    draw({ phase: 'game', busy: false, problem: '' }, store); draw({ phase: 'wait', busy: false, problem: '' }, store)
    hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    expect(hook.run).toEqual({ act: 'build', step: 1, state: 'ready' }); expect(hook.selected).toBe('B'); expect(store.m[PRESET_KEY]).toBe('B')
    expect(currentPresetId(store)).toBe('A') // B применится только в тапе «Запустить B»
    // «Запустить B»: не получилось открыть микрофон — шаг остаётся
    expect(hook.beforeLaunch('build')).toBe('B'); expect(currentPresetId(store)).toBe('B')
    draw({ phase: 'wait', busy: true, problem: '' }, store)
    draw({ phase: 'wait', busy: false, problem: 'Микрофон не дали' }, store)
    hook = draw({ phase: 'wait', busy: false, problem: 'Микрофон не дали' }, store) // перерисовка после эффекта (в React — сама)
    expect(hook.run).toEqual({ act: 'build', step: 1, state: 'ready' })
    // остальные шаги до конца
    for (let i = 1; i < 8; i++) {
      hook.beforeLaunch('build'); draw({ phase: 'game', busy: false, problem: '' }, store); hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    }
    hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    expect(hook.run.state).toBe('finished'); expect(listRuns(store).map(r => r.preset.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']); expect(listRuns(store).map(r => r.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
  it('в прогоне режим шага главнее выбора в списке; очистка стирает журналы', () => {
    const store = memStore()
    let hook = draw({ phase: 'wait', busy: false, problem: '' }, store)
    hook.startRun('intro'); hook.select('G')
    expect(hook.beforeLaunch('intro')).toBe('A')
    hook.clear(); expect(listRuns(store)).toEqual([])
  })
})

describe('проводка и размер', () => {
  it('журнал плеера пропускает строки [audio-mode]; экспорт отладки и текстовый журнал знают режим звука', () => {
    expect(read('../../player/downloadDebugLog.js')).toContain("l.includes('[audio-mode]')")
    expect(read('../../player/gameLogSection.js')).toContain('Режим звука:')
    expect(read('../../player/modules/rotate-phone/wordLaneDebugExport.js')).toContain('audioModeInfo')
  })
  it('файлы не длиннее 250 строк; стили в admin-rehearsal-polish.css', () => {
    for (const f of ['PolishAudioMode.jsx', 'PolishVoice.jsx', 'PolishCardLines.jsx', 'PolishListen.jsx', 'usePolishAudioRun.js', 'usePolishVoice.js', 'RehearsalPolishBlock.jsx']) expect(read(`./${f}`).split('\n').length, f).toBeLessThanOrEqual(250)
    const css = read('../../../styles/admin-rehearsal-polish.css')
    for (const c of ['.rhpAudio', '.rhpVoice', '.rhpLines', '.rhpLine ']) expect(css).toContain(c)
  })
})

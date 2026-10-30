import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WordLaneComment from './WordLaneComment.jsx'
import WordLaneCommentQuick from './WordLaneCommentQuick.jsx'
import WordLaneCommentButton from './WordLaneCommentButton.jsx'
import { addComment, makeComment } from '../../../rehearsal/polish/rehearsalComments.js'
import { fixturePlan } from '../../../rehearsal/rehearsalFixtures.js'
import { NO_DEBUG } from './wordLaneDebug.js'

// Комментарий к этапу репетиции в игре («Шлифовка репетиции»): кнопка 💬 под ⚙ только при отладке в репетиции, тап — снимок и пауза без HUD, оверлей на весь экран с быстрыми переключателями
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const lines = rel => read(rel).split('\n').length - 1
afterEach(() => vi.unstubAllGlobals())

const SNAP = {
  version: '3.3.71', phrase: "I'm | trying | to learn",
  stage: { act: 'build', actTitle: 'Сборка с конца', name: 'run', sid: 'build-1', type: 'student', idx: 9, phase: 'student' },
  step: { id: 'build-1', text: 'trying to learn', parts: [1, 2], reps: 1 },
  pills: [{ lane: 1, text: 'trying', fill: 0.45, state: 'наливается' }], lanes: [{ lane: 1, text: 'trying', on: true }], cat: 'Давай ещё раз', plate: '', tag: '', mic: 'listening', listener: { seq: 1, misses: 0, heard: '' },
}
const props = (o = {}) => ({ f: { paused: true, dbg: { enabled: true, event() {}, dump: () => null }, finish() {} }, pause: { problem: '', busy: false, resume() {} }, comment: { snap: SNAP, at: 6000 }, rootRef: { current: null }, onClose() {}, ...o })
const render = (p = props()) => renderToStaticMarkup(createElement(WordLaneComment, p))

describe('кнопка 💬', () => {
  const plan = fixturePlan('three')
  const cfg = { chunks: plan.chunks, word: 'x', plan }
  const f = (o = {}) => ({ stage: 'run', idx: 4, phase: 'student', mic: 'listening', seq: [], misses: 0, labels: [], rh: { on: true, tag: '' }, stageObj: { type: 'student', act: 'blind', sid: 'blind-0', step: { id: 'blind-0', text: 'x', parts: [0], reps: [{}] } }, pause: vi.fn(() => true), dbg: { enabled: true, event: vi.fn() }, ...o })
  it('под кнопкой ⚙ HUD в правом верхнем углу (top 54 = 10 + 36 + 8), z-index 8, как у HUD', () => {
    const css = read('../../../../styles/player/modules/word-lane-comment.css')
    expect(css).toMatch(/\.wlCmtBtn \{[^}]*top: calc\(env\(safe-area-inset-top\) \+ 54px\)[^}]*right: calc\(env\(safe-area-inset-right\) \+ 10px\)[^}]*z-index: 8/)
    expect(read('../../../../styles/player/modules/word-lane-hud.css')).toMatch(/\.wlHudBtn \{[^}]*top: calc\(env\(safe-area-inset-top\) \+ 10px\)[^}]*width: 36px[^}]*height: 36px/)
    expect(renderToStaticMarkup(createElement(WordLaneCommentButton, { f: f(), cfg, rootRef: { current: null }, onOpen() {} }))).toContain('data-testid="wl-cmt-open"')
  })
  it('тап: снимок экрана ДО паузы, f.pause(\'comment\'), событие comment-open, onOpen({ snap, at }); HUD не трогается', () => {
    const order = []
    const ff = f({ pause: vi.fn(() => { order.push('pause'); return true }) })
    ff.dbg.event = vi.fn(k => order.push(k))
    const onOpen = vi.fn(arg => order.push(`open:${arg.snap.stage.sid}`))
    WordLaneCommentButton({ f: ff, cfg, rootRef: { current: null }, onOpen }).props.onClick()
    expect(ff.pause).toHaveBeenCalledWith('comment')
    expect(order).toEqual(['pause', 'comment-open', 'open:blind-0'])
    const { snap, at } = onOpen.mock.calls[0][0]
    expect(snap.stage).toMatchObject({ act: 'blind', actTitle: 'Без текста', sid: 'blind-0' }); expect(snap.phrase).toBe(plan.phrase)
    expect(onOpen.mock.calls[0][0].settings).toHaveProperty('audioSession') // настройки и живое состояние — тоже в момент тапа, до паузы
    expect(at).toBeGreaterThan(Date.now() - 5000)
    expect(ff.dbg.event).toHaveBeenCalledWith('comment-open', { act: 'blind', stage: 'blind-0' })
  })
  it('кнопка видна только при отладке в репетиции: условие в игре — dbg.enabled и f.rh.on; у выключенной отладки dbg.enabled = false', () => {
    const game = read('./WordLaneGame.jsx')
    expect(game).toContain('{f.dbg.enabled && f.rh.on && !comment && <WordLaneCommentButton f={f} cfg={cfg} rootRef={rootRef} onOpen={setComment} />}')
    expect(NO_DEBUG.enabled).toBe(false)
  })
})

describe('пауза без HUD', () => {
  const game = read('./WordLaneGame.jsx')
  it('пока открыт комментарий, попап «Игра на паузе» не показывается (оверлей комментария вместо него), кнопка 💬 прячется; HUD открывает только сам человек', () => {
    expect(game).toContain('{f.paused && !comment && <WordLanePause pause={pause} onExit={f.finish} />}')
    expect(game).toContain('{comment && <WordLaneComment f={f} pause={pause} comment={comment} rootRef={rootRef} setTapMode={setTapMode} onClose={() => setComment(null)} />}')
    expect(read('./WordLaneCommentButton.jsx')).not.toMatch(/Hud|setOpen/)
  })
  it('пауза — тот же путь, что при сворачивании (f.pause из useWordLaneControls), причина comment', () => {
    expect(read('./WordLaneCommentButton.jsx')).toContain("f.pause('comment')")
    expect(read('./useWordLaneControls.js')).toContain('const pause = (why =')
  })
})

describe('оверлей комментария', () => {
  it('заголовок «Комментарий к этапу: <акт> / <стадия>», поле текста, кнопки сохранения', () => {
    const out = render()
    expect(out).toContain('Комментарий к этапу: Сборка с конца / build-1')
    expect(out).toMatch(/<textarea[^>]*data-testid="wl-cmt-text"/)
    for (const [id, text] of [['wl-cmt-save', 'Сохранить и продолжить'], ['wl-cmt-exit', 'Сохранить и выйти'], ['wl-cmt-skip', 'Продолжить без комментария']]) expect(out).toMatch(new RegExp(`data-testid="${id}"[^>]*>${text}<`))
  })
  it('«что на экране»: стадия, ступень, пилюли (дорожка, текст, заполнение, состояние), подписи, кот, микрофон и слушатель; версия, аудиосессия, дорожка, Vosk', () => {
    const out = render()
    expect(out).toContain('стадия run/student (build-1)'); expect(out).toContain('ступень «trying to learn» ×1'); expect(out).toContain('2:«trying» наливается 45%')
    expect(out).toContain('подписи «trying»*'); expect(out).toContain('кот: «Давай ещё раз»'); expect(out).toContain('микрофон listening, принято 1, промахов 0')
    expect(out).toMatch(/data-testid="wl-cmt-info">v3\.3\.71 · аудиосессия: <b>/)
  })
  it('быстрые переключатели те же, что в HUD: аудиосессия (3), дорожка на речь Пита (3), обработка микрофона, награда и громкость, безопасные слои, тап вместо речи', () => {
    const out = render()
    for (const id of ['session-play-and-record', 'session-auto', 'session-phases', 'hold-none', 'hold-enabled-false', 'hold-close', 'proc-toggle', 'reward-meow', 'reward-off', 'volume-range', 'safe-toggle', 'tap-toggle']) expect(out, id).toContain(`data-testid="wl-cmt-${id}"`)
    expect(out).toContain('вступают в силу после «Продолжить»')
    const quick = renderToStaticMarkup(createElement(WordLaneCommentQuick, { rootRef: { current: null } }))
    expect(quick).toContain('Аудиосессия iOS'); expect(quick).toContain('Дорожка микрофона на речь Пита'); expect(quick).toContain('Обработка микрофона')
  })
  it('сохранено на этапе: счётчик из браузера «N из 50»', () => {
    vi.stubGlobal('localStorage', memStore())
    addComment('build', makeComment({ text: 'раз', snap: SNAP, settings: {} }))
    addComment('build', makeComment({ text: 'два', snap: SNAP, settings: {} }))
    expect(render()).toContain('Сохранено на этом этапе: 2 из 50')
  })
  it('сохранить можно, только если есть текст или менялись режимы (кнопки сохранения недоступны на пустом окне); «Продолжить без комментария» доступна', () => {
    const out = render()
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="wl-cmt-save"/); expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="wl-cmt-exit"/)
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="wl-cmt-skip"/)
  })
  it('микрофон не открылся после «Продолжить»: сообщение паузы показано в окне', () => {
    expect(render(props({ pause: { problem: 'Нет доступа к микрофону.', busy: false, resume() {} } }))).toMatch(/role="alert" data-testid="wl-cmt-error">Нет доступа к микрофону\./)
  })
})

describe('проводка и стили', () => {
  it('«Сохранить и продолжить» — жест: pause.resume() из useWordLanePause (микрофон и звук из тапа, ступень сначала); «Сохранить и выйти» — f.finish', () => {
    const src = read('./WordLaneComment.jsx')
    expect(src).toContain('setResuming(true); pause.resume()')
    expect(src).toContain('onClose(); f.finish()')
    expect(src).toContain("f.dbg.event('comment-save'"); expect(src).toContain("f.dbg.event('comment-setting'")
  })
  it('подложка fixed на весь экран поверх кота и HUD (z-index 60, как у паузы), плотный фон, поле текста 16 px (iOS не приближает), безопасные отступы, подключено в index.css после HUD', () => {
    const css = read('../../../../styles/player/modules/word-lane-comment.css')
    expect(css).toMatch(/\.wlCmtBack \{[^}]*position: fixed[^}]*inset: 0[^}]*z-index: 60[^}]*background: #15181f/)
    expect(css).toMatch(/\.wlCmtText \{[^}]*font-size: 16px/); expect(css).toContain('env(safe-area-inset-bottom)'); expect(css).toMatch(/overflow-y: auto/)
    const index = read('../../../../index.css')
    expect(index).toContain("@import './styles/player/modules/word-lane-comment.css';")
    expect(index.indexOf('word-lane-comment.css')).toBeGreaterThan(index.indexOf('word-lane-hud.css'))
  })
  it('файлы не длиннее 250 строк', () => {
    for (const f of ['WordLaneComment.jsx', 'WordLaneCommentButton.jsx', 'WordLaneCommentQuick.jsx']) expect(lines(`./${f}`), f).toBeLessThanOrEqual(250)
    expect(lines('../../../../styles/player/modules/word-lane-comment.css')).toBeLessThanOrEqual(250)
  })
})

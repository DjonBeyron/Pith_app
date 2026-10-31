import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Ход окна комментария (WordLaneComment): сохранить и продолжить / выйти / без комментария. Хуки React здесь выполняются «как есть» (useState — ячейки по порядку, useEffect — запоминается): компонент зовётся как функция,
// дерево элементов разбирается по data-testid, кнопки «нажимаются» вызовом onClick. Порядок useState в компоненте: 0 text, 1 changes, 2 error, 3 resuming, 4 count, 5 saved.
const h = vi.hoisted(() => ({ states: [], i: 0, effects: [] }))
vi.mock('react', async orig => ({
  ...(await orig()),
  useState: init => { const k = h.i++; if (!(k in h.states)) h.states[k] = typeof init === 'function' ? init() : init; return [h.states[k], v => { h.states[k] = typeof v === 'function' ? v(h.states[k]) : v }] },
  useEffect: fn => { h.effects.push(fn) },
}))

import WordLaneComment from './WordLaneComment.jsx'
import WordLaneCommentQuick from './WordLaneCommentQuick.jsx'
import { listComments, MAX_COMMENTS } from '../../../rehearsal/polish/rehearsalComments.js'

const memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const SNAP = {
  version: '3.3.71', phrase: 'a | b', stage: { act: 'build', actTitle: 'Сборка с конца', name: 'run', sid: 'build-0', type: 'student', idx: 3, phase: 'student' },
  step: null, pills: [], lanes: [], cat: '', plate: '', tag: '', mic: 'listening', listener: { seq: 0, misses: 0, heard: '' },
}
const TAP_SETTINGS = { version: '3.3.71', audioSession: 'play-and-record', audioSessionMode: 'auto', micHold: 'none', micProcessing: false, mic: 'live', vosk: 'готов' } // состояние в момент тапа (до паузы)
const EVENTS = [{ t: 100, type: 'stage', kind: 'student' }, { t: 200, type: 'level', v: 0.2 }, { t: 300, type: 'event', kind: 'comment-open' }]

const find = (node, id) => {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) { for (const n of node) { const r = find(n, id); if (r) return r } return null }
  if (node.props?.['data-testid'] === id || node.type === id) return node
  return find(node.props?.children, id)
}

let p, store
function mount(over = {}) {
  p = {
    f: { paused: true, finish: vi.fn(), dbg: { enabled: true, event: vi.fn(), dump: () => ({ startedAtMs: 1000, events: EVENTS }) } },
    pause: { problem: '', busy: false, resume: vi.fn() },
    comment: { snap: SNAP, at: 6000, settings: TAP_SETTINGS }, rootRef: { current: null }, onClose: vi.fn(), ...over,
  }
}
const draw = () => { h.i = 0; h.effects = []; return WordLaneComment(p) }
const click = (tree, id) => find(tree, id).props.onClick()
const type = text => { draw(); h.states[0] = text }

beforeEach(() => { h.states = []; h.i = 0; h.effects = []; store = memStore(); vi.stubGlobal('localStorage', store); mount() })
afterEach(() => vi.unstubAllGlobals())

describe('«Сохранить и продолжить»', () => {
  it('комментарий сохранён: текст, t от старта игры до тапа, этап и стадия, снимок экрана и настроек, журнал без level; игра продолжается жестом pause.resume()', () => {
    type('хрипит звук на «to learn»')
    click(draw(), 'wl-cmt-save')
    const [c] = listComments('build', store)
    expect(c).toMatchObject({ text: 'хрипит звук на «to learn»', t: 5000, stage: { act: 'build', sid: 'build-0' } })
    expect(c.screen).toEqual(SNAP); expect(c.settings).toEqual(TAP_SETTINGS) // настройки — какими были в момент тапа (дорожка live), а не после паузы
    expect(c.log).toEqual(['0.10 с stage student', '0.30 с event comment-open'])
    expect(Date.parse(c.at)).toBeGreaterThan(0)
    expect(p.pause.resume).toHaveBeenCalledTimes(1)
    expect(p.f.dbg.event).toHaveBeenCalledWith('comment-save', { act: 'build', len: 25, changes: 0, ok: true })
    expect(h.states[3]).toBe(true) // resuming
  })
  it('пока микрофон открывается, окно остаётся; игра снова идёт (f.paused = false) — окно закрывается', () => {
    type('x'); click(draw(), 'wl-cmt-save')
    draw(); h.effects.forEach(fn => fn())
    expect(p.onClose).not.toHaveBeenCalled()
    p.f.paused = false; draw(); h.effects.forEach(fn => fn())
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })
  it('микрофон не открылся (pause.problem): окно остаётся с сообщением, повторное «Продолжить» не дублирует комментарий', () => {
    type('x'); click(draw(), 'wl-cmt-save')
    p.pause.problem = 'Нет доступа к микрофону.'
    const tree = draw()
    expect(find(tree, 'wl-cmt-error').props.children).toBe('Нет доступа к микрофону.')
    expect(find(tree, 'wl-cmt-save').props.disabled).toBe(false)
    p.pause.problem = ''; click(draw(), 'wl-cmt-save')
    expect(listComments('build', store)).toHaveLength(1); expect(p.pause.resume).toHaveBeenCalledTimes(2)
  })
  it('на финале (игра не на паузе) просто закрывается, resume не зовётся', () => {
    mount({ f: { ...p.f, paused: false } })
    type('x'); click(draw(), 'wl-cmt-save')
    expect(listComments('build', store)).toHaveLength(1); expect(p.onClose).toHaveBeenCalledTimes(1); expect(p.pause.resume).not.toHaveBeenCalled()
  })
  it('хранилище не приняло запись: ошибка в окне, игра не продолжается, окно не закрывается', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() { throw new Error('quota') }, removeItem() {} })
    type('x'); click(draw(), 'wl-cmt-save')
    expect(h.states[2]).toMatch(/не принимает запись/); expect(p.pause.resume).not.toHaveBeenCalled(); expect(p.onClose).not.toHaveBeenCalled()
  })
})

describe('«Сохранить и выйти» и «Продолжить без комментария»', () => {
  it('выйти: сохранить, закрыть окно, f.finish()', () => {
    type('конец'); click(draw(), 'wl-cmt-exit')
    expect(listComments('build', store)).toHaveLength(1); expect(p.onClose).toHaveBeenCalledTimes(1); expect(p.f.finish).toHaveBeenCalledTimes(1); expect(p.pause.resume).not.toHaveBeenCalled()
  })
  it('без комментария: ничего не пишет, игра продолжается тем же pause.resume()', () => {
    click(draw(), 'wl-cmt-skip')
    expect(listComments('build', store)).toEqual([]); expect(p.pause.resume).toHaveBeenCalledTimes(1)
  })
  it('51-й комментарий этапа вытесняет самый старый; в окне об этом сказано заранее', () => {
    for (let i = 0; i < MAX_COMMENTS; i++) { h.states = []; type(`к${i}`); click(draw(), 'wl-cmt-save') }
    h.states = []; draw()
    expect(find(draw(), 'wl-cmt-count').props.children.join('')).toContain('(самый старый будет удалён)')
    type('новый'); click(draw(), 'wl-cmt-save')
    const list = listComments('build', store)
    expect(list).toHaveLength(MAX_COMMENTS); expect(list[0].text).toBe('к1'); expect(list.at(-1).text).toBe('новый')
  })
})

describe('режимы, переключённые в окне', () => {
  it('переключение попадает в комментарий (changes) и в журнал; сохранить можно и без текста', () => {
    draw()
    const quick = find(draw(), WordLaneCommentQuick)
    quick.props.onChange({ key: 'session', label: 'аудиосессия', from: 'auto', to: 'phases' })
    const tree = draw()
    expect(find(tree, 'wl-cmt-save').props.disabled).toBe(false)
    expect(find(tree, 'wl-cmt-changes').props.children.join('')).toContain('аудиосессия → phases')
    click(tree, 'wl-cmt-save')
    const [c] = listComments('build', store)
    expect(c.text).toBe(''); expect(c.changes).toEqual([expect.objectContaining({ key: 'session', label: 'аудиосессия', from: 'auto', to: 'phases' })])
    expect(p.f.dbg.event).toHaveBeenCalledWith('comment-setting', { key: 'session', from: 'auto', to: 'phases' })
  })
})

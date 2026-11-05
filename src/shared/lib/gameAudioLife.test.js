import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installGameAudioLife, needsRewake, consumeRewake, markGameAudioSuspect } from './gameAudioLife.js'

// Фон/блокировка: журнал «[audio] visibility …», пометка «звук подозрительный» после возврата, идемпотентная установка
const logs = vi.hoisted(() => [])
vi.mock('./debug.js', () => ({ pLog: m => logs.push(m) }))
const notes = vi.hoisted(() => [])
vi.mock('./gameAudioSink.js', () => ({ gameAudioNote: (k, d) => notes.push([k, d]) }))

function env() {
  const docL = {}, winL = {}
  const add = o => (t, f) => { (o[t] ||= []).push(f) }
  const rm = o => (t, f) => { o[t] = (o[t] || []).filter(x => x !== f) }
  const doc = { visibilityState: 'visible', addEventListener: add(docL), removeEventListener: rm(docL) }
  const win = { addEventListener: add(winL), removeEventListener: rm(winL) }
  const fire = (o, t, ev = {}) => (o[t] || []).forEach(f => f(ev))
  return { doc, win, docL, winL, fire, nav: { audioSession: { type: 'play-and-record' } } }
}
let off, e, t, ctx
beforeEach(() => {
  logs.length = 0; notes.length = 0; consumeRewake(); t = 0; ctx = 'running'; e = env()
  off = installGameAudioLife({ doc: e.doc, win: e.win, nav: e.nav, now: () => t, ctxState: () => ctx })
})

describe('gameAudioLife', () => {
  it('hidden → visible: в журнале обе строки с состоянием контекста и типом сессии, звук помечен подозрительным с причиной и временем в фоне', () => {
    e.doc.visibilityState = 'hidden'; e.fire(e.docL, 'visibilitychange')
    t = 30000; ctx = 'interrupted'
    e.doc.visibilityState = 'visible'; e.fire(e.docL, 'visibilitychange')
    expect(logs[0]).toMatch(/\[audio\] visibility hidden: ctx=running, audioSession\.type=play-and-record/)
    expect(logs[1]).toMatch(/visibility visible: ctx=interrupted.*в фоне 30 с/)
    expect(needsRewake()).toMatch(/после 30 с в фоне/)
    expect(consumeRewake()).toMatch(/visible/)
    expect(needsRewake()).toBeNull() // забрали — следующий старт обычный
    expect(notes.some(([k, d]) => k === 'audio-life' && d.what === 'visibility hidden')).toBe(true)
    off()
  })

  it('pagehide / pageshow (из кэша) тоже помечают; blur → focus (блокировка без visibilitychange) — тоже', () => {
    e.fire(e.winL, 'pagehide'); t = 5000; e.fire(e.winL, 'pageshow', { persisted: true })
    expect(logs.some(l => l.includes('pagehide'))).toBe(true)
    expect(consumeRewake()).toMatch(/pageshow \(из кэша\)/)
    e.fire(e.winL, 'blur'); e.fire(e.winL, 'focus')
    expect(consumeRewake()).toMatch(/focus/)
    off()
  })

  it('focus без ухода в фон не помечает; visible при прерванном контексте без hidden — помечает (hidden не пришёл)', () => {
    e.fire(e.winL, 'focus')
    expect(needsRewake()).toBeNull()
    ctx = 'interrupted'; e.fire(e.docL, 'visibilitychange')
    expect(needsRewake()).toMatch(/visible/)
    off()
  })

  it('установка идемпотентна: второй вызов не дублирует слушателей; отписка снимает всё', () => {
    installGameAudioLife({ doc: e.doc, win: e.win })
    expect(e.docL.visibilitychange).toHaveLength(1)
    markGameAudioSuspect('вручную')
    expect(needsRewake()).toBe('вручную')
    off()
    expect(e.docL.visibilitychange).toHaveLength(0)
    expect(needsRewake()).toBeNull()
  })
})

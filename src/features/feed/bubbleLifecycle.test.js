import { describe, it, expect } from 'vitest'
import { watchAppLifecycle, isAppAway } from './bubbleLifecycle.js'

// Мини-цель событий: addEventListener/removeEventListener/emit без DOM
function target(extra = {}) {
  const map = new Map()
  return {
    ...extra,
    addEventListener: (n, f) => { if (!map.has(n)) map.set(n, new Set()); map.get(n).add(f) },
    removeEventListener: (n, f) => map.get(n)?.delete(f),
    emit: n => map.get(n)?.forEach(f => f()),
    count: () => [...map.values()].reduce((a, s) => a + s.size, 0),
  }
}
function setup(visibility = 'visible') {
  const doc = target({ visibilityState: visibility })
  const win = target()
  const log = []
  const stop = watchAppLifecycle(() => log.push('hide'), () => log.push('show'), { doc, win })
  return { doc, win, log, stop }
}

describe('watchAppLifecycle: подписка на уход приложения в фон / под шторку', () => {
  it('подписывается на все события и снимает их отпиской', () => {
    const { doc, win, stop } = setup()
    expect(doc.count()).toBe(3) // visibilitychange, freeze, resume
    expect(win.count()).toBe(4) // pagehide, pageshow, blur, focus
    stop()
    expect(doc.count() + win.count()).toBe(0)
  })

  it('каждое из событий ухода — onHide; повтор подряд не дублирует', () => {
    for (const [t, name] of [['win', 'blur'], ['win', 'pagehide'], ['doc', 'freeze']]) {
      const s = setup()
      s[t].emit(name)
      s[t].emit(name)
      expect(s.log).toEqual(['hide'])
    }
    const s = setup()
    s.doc.visibilityState = 'hidden'
    s.doc.emit('visibilitychange')
    s.win.emit('blur') // за visibilitychange приходит ещё и blur
    expect(s.log).toEqual(['hide'])
  })

  it('возврат (visible / focus / pageshow / resume) — onShow, и только после ухода', () => {
    const s = setup()
    s.win.emit('focus') // не уходили — ничего
    expect(s.log).toEqual([])
    s.win.emit('blur')
    s.win.emit('focus')
    s.win.emit('focus')
    expect(s.log).toEqual(['hide', 'show'])
    s.doc.visibilityState = 'hidden'
    s.doc.emit('visibilitychange')
    s.doc.visibilityState = 'visible'
    s.doc.emit('visibilitychange')
    expect(s.log).toEqual(['hide', 'show', 'hide', 'show'])
    s.win.emit('pagehide')
    s.win.emit('pageshow')
    s.win.emit('pagehide')
    s.doc.emit('resume')
    expect(s.log.slice(4)).toEqual(['hide', 'show', 'hide', 'show'])
  })

  it('focus при ещё скрытом документе — не возврат', () => {
    const s = setup()
    s.doc.visibilityState = 'hidden'
    s.doc.emit('visibilitychange')
    s.win.emit('focus')
    expect(s.log).toEqual(['hide'])
  })

  it('подписались при уже скрытой странице: onHide не зовётся, onShow — при возврате', () => {
    const s = setup('hidden')
    expect(isAppAway(s.doc)).toBe(true)
    s.win.emit('blur')
    expect(s.log).toEqual([])
    s.doc.visibilityState = 'visible'
    s.doc.emit('visibilitychange')
    expect(s.log).toEqual(['show'])
  })

  it('после отписки события не доходят', () => {
    const s = setup()
    s.stop()
    s.win.emit('blur')
    expect(s.log).toEqual([])
  })
})

import { describe, it, expect, vi } from 'vitest'
import { createMediaKeep, readMediaKeep, writeMediaKeep, MEDIA_KEEP_KEY } from './gameMediaKeep.js'

// «Громкость как у медиа»: беззвучный зацикленный <audio> на время игры (iPhone: без него звук Web Audio вдвое тише).
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m } }
function rig(mode = 'on') {
  const calls = []
  const el = { loop: false, currentTime: 5, setAttribute: vi.fn(), pause: vi.fn(() => calls.push('pause')), play: vi.fn(() => { calls.push('play'); return Promise.resolve() }) }
  const make = vi.fn(() => el)
  const log = vi.fn()
  return { keep: createMediaKeep({ make, read: () => mode, log }), el, make, log, calls }
}

describe('громкость как у медиа', () => {
  it('start: элемент создаётся один раз, зациклен, запущен; повторный start не перезапускает', async () => {
    const r = rig()
    expect(r.keep.start()).toBe(true)
    expect(r.el.loop).toBe(true); expect(r.el.setAttribute).toHaveBeenCalledWith('playsinline', '')
    expect(r.keep.isPlaying()).toBe(true)
    r.keep.start(); r.keep.start()
    expect(r.make).toHaveBeenCalledTimes(1); expect(r.el.play).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(r.log.mock.calls[0][0]).toContain('[audio] громкость как у медиа')
  })
  it('refresh: пауза → с начала → снова играет; stop: пауза и флаг; повторный stop молчит', () => {
    const r = rig()
    r.keep.start(); r.calls.length = 0
    r.keep.refresh()
    expect(r.calls).toEqual(['pause', 'play']); expect(r.el.currentTime).toBe(0)
    r.keep.stop()
    expect(r.keep.isPlaying()).toBe(false); expect(r.calls.at(-1)).toBe('pause')
    const n = r.el.pause.mock.calls.length
    r.keep.stop(); expect(r.el.pause.mock.calls.length).toBe(n)
  })
  it('выключено — ничего не создаёт; play отклонён (нет жеста) — флаг сбрасывается, не падает', async () => {
    const off = rig('off')
    expect(off.keep.start()).toBe(false); expect(off.keep.refresh()).toBe(false); expect(off.make).not.toHaveBeenCalled()
    const r = rig(); r.el.play = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })))
    r.keep.start()
    await Promise.resolve(); await Promise.resolve()
    expect(r.keep.isPlaying()).toBe(false); expect(r.log.mock.calls.at(-1)[0]).toContain('NotAllowedError')
  })
  it('настройка: по умолчанию выкл. (v3.3.202); включается только явным on; мусор = выкл.; сброс стирает ключ', () => {
    const st = mem()
    expect(readMediaKeep(st)).toBe('off')
    writeMediaKeep('on', st); expect(readMediaKeep(st)).toBe('on')
    st.setItem(MEDIA_KEEP_KEY, 'мусор'); expect(readMediaKeep(st)).toBe('off')
    writeMediaKeep('off', st); expect(readMediaKeep(st)).toBe('off')
    writeMediaKeep('auto', st); expect(st.m.has(MEDIA_KEEP_KEY)).toBe(false)
  })
})

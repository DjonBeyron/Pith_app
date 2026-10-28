import { describe, it, expect, vi } from 'vitest'
import { makeScenePlayLine } from './scenePlayLine.js'

// «Живой Пит v2» в пути воспроизведения реплики: v2 (рот кодами + огибающая) и зрачки — только у говорящего-маскота и только при animV2
const env = { hz: 20, data: '0fff' }
const scene = {
  characters: { a: { skin: 'kit', voice: {} }, b: { voice: {} } },
  options: {},
  timeline: [
    { who: 'a', text: 'Hi there', audioUrl: 'https://r2/0.mp3', wordTimings: [{ word: 'Hi', start: 0, end: 0.3 }], audioMeta: { hash: 'x', env }, translation: 'Привет', translationAudioUrl: 'https://r2/t.mp3', translationAudioMeta: { hash: 'y', env } },
    { who: 'b', text: 'Hello', audioUrl: 'https://r2/1.mp3', audioMeta: { hash: 'z', env } },
    { who: 'a', text: 'No env', audioUrl: 'https://r2/2.mp3' },
  ],
}

function harness(o = {}) {
  const look = { lineStart: vi.fn(), word: vi.fn(), lineEnd: vi.fn() }
  const calls = []
  const playAudio = vi.fn((line, el, cbs) => { calls.push(cbs); return () => {} })
  const opts = { sound: true, rate: 1, lowPower: false, voice: { translation: true }, ...o }
  const player = makeScenePlayLine({
    scene, opts: () => opts, getMouthEl: () => ({ getAttribute: () => null, setAttribute() {} }), setMode: () => {}, cache: { resolve: () => null, pin() {}, prefetch() {} },
    getAudio: () => ({}), allowed: () => false, speak: vi.fn(() => () => {}), playAudio, timers: { setInterval: () => 1, clearInterval: () => {} }, getLook: () => look,
  })
  return { player, look, calls, playAudio }
}

describe('scenePlayLine — «живой Пит v2»', () => {
  it('animV2 + маскот: v2 = { lv (огибающая из audioMeta.env), onWord }, зрачки получают начало реплики и границы слов', () => {
    const h = harness({ animV2: true })
    h.player.playLine(scene.timeline[0], 0, { onEnd() {} })
    const v2 = h.calls[0].v2
    expect(v2.lv.hz).toBe(20)
    expect(v2.lv.levels).toHaveLength(4)
    expect(h.look.lineStart).toHaveBeenCalledWith('a')
    v2.onWord(0)
    expect(h.look.word).toHaveBeenCalledWith('a')
  })

  it('нет огибающей — lv пустой (только буквы); флаг выключен — v2 нет вовсе, зрачки не трогаются', () => {
    const on = harness({ animV2: true })
    on.player.playLine(scene.timeline[2], 2, { onEnd() {} })
    expect(on.calls[0].v2.lv).toBeNull()
    const off = harness({ animV2: false })
    off.player.playLine(scene.timeline[0], 0, { onEnd() {} })
    expect(off.calls[0].v2).toBeNull()
    expect(off.look.lineStart).not.toHaveBeenCalled()
  })

  it('обычный кот (без skin) остаётся по-старому даже при включённом флаге', () => {
    const h = harness({ animV2: true })
    h.player.playLine(scene.timeline[1], 1, { onEnd() {} })
    expect(h.calls[0].v2).toBeNull()
    expect(h.look.lineStart).not.toHaveBeenCalled()
  })

  it('перевод («диктор») — рот закрыт, v2 нет; конец реплики и отмена закрывают взгляд (lineEnd)', () => {
    const h = harness({ animV2: true })
    const onEnd = vi.fn()
    const cancel = h.player.playLine(scene.timeline[0], 0, { onEnd })
    h.calls[0].onEnd()                       // оригинал отзвучал → пошёл перевод файлом
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1].v2).toBeNull()
    h.calls[1].onEnd()
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(h.look.lineEnd).toHaveBeenCalled()
    h.look.lineEnd.mockClear()
    cancel()
    expect(h.look.lineEnd).toHaveBeenCalled()
  })
})

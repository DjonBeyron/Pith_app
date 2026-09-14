import { describe, it, expect } from 'vitest'
import { parseScript, layersFromScript, layoutSequential, prepareSpeechLane, scriptFromLayers, DEMO_SCRIPT } from './speechLanePrepare.js'
import { layerShots, laneCollisions, hitTime } from './speechLaneTiming.js'

describe('сценарий → группы и слои', () => {
  it('подряд одинаковые фразы — одна группа с числом повторов, регистр не важен', () => {
    expect(parseScript('I. I. i. Try, try, try. I try! I try? I try')).toEqual([
      { text: 'I', n: 3 }, { text: 'Try', n: 3 }, { text: 'I try', n: 3 },
    ])
    expect(parseScript('')).toEqual([])
  })

  it('на каждую группу — диктор и ученик', () => {
    const l = layersFromScript('I. I. Try.')
    expect(l.map(x => `${x.text}/${x.role}/${x.n}`)).toEqual(['I/coach/2', 'I/user/2', 'Try/coach/1', 'Try/user/1'])
  })
})

describe('раскладка по очереди', () => {
  it('диктор n раз, следом ученик n раз, дальше следующая группа; дорожки без столкновений', () => {
    const out = layoutSequential(layersFromScript('I. I. Try.'))
    const [ic, iu, tc, tu] = out
    expect(layerShots(ic)).toHaveLength(2)
    expect(layerShots(iu)).toHaveLength(2)
    expect(layerShots(tc)).toHaveLength(1)
    // ученик — после последнего вылета диктора
    expect(layerShots(iu)[0].start).toBeGreaterThanOrEqual(layerShots(ic)[1].end)
    expect(layerShots(tc)[0].start).toBeGreaterThanOrEqual(layerShots(iu)[1].end)
    expect(layerShots(tu)[0].start).toBeGreaterThanOrEqual(layerShots(tc)[0].end)
    expect(laneCollisions(out).size).toBe(0)
  })

  it('слои с готовыми вылетами не трогает, очередь идёт после них', () => {
    const ready = { id: 'a', text: 'go', role: 'coach', lane: 2, clips: [{ start: 10, end: 12 }], repeats: [] }
    const [a, b] = layoutSequential([ready, { id: 'b', text: 'go', role: 'user', lane: 0, clips: [], repeats: [], n: 1 }])
    expect(a.clips).toEqual([{ start: 10, end: 12 }])
    expect(layerShots(b)[0].start).toBeGreaterThanOrEqual(12)
  })
})

describe('prepareSpeechLane — игра есть всегда', () => {
  it('пустая нода — демо-фраза, композиция покрывает все вылеты', () => {
    const s = prepareSpeechLane({})
    expect(s.source).toBe('демо-фраза')
    expect(s.layers.length).toBe(layersFromScript(DEMO_SCRIPT).length)
    const end = Math.max(...s.layers.flatMap(l => layerShots(l).map(x => x.end)))
    expect(s.timelineLen).toBeCloseTo(end)
    expect(s.audioClips).toEqual([])
  })

  it('сценарий без озвучки — слои по очереди', () => {
    const s = prepareSpeechLane({ script: 'Go. Go.' })
    expect(s.source).toBe('сценарий')
    expect(s.layers.map(l => l.role)).toEqual(['coach', 'user'])
    expect(layerShots(s.layers[0])).toHaveLength(2)
  })

  it('сценарий с озвучкой — диктор по таймингам, ученик следом за ним', () => {
    const wt = [{ w: 'Go.', t: 1.0 }, { w: 'Go.', t: 2.0 }]
    const s = prepareSpeechLane({ script: 'Go. Go.', duration: 4, wordTimings: wt })
    const [coach, user] = s.layers
    expect(hitTime(layerShots(coach)[0])).toBeCloseTo(1.5)   // середина 1.0–2.0
    expect(layerShots(user)).toHaveLength(2)
    expect(layerShots(user)[0].start).toBeGreaterThanOrEqual(layerShots(coach)[1].end)
    expect(s.audioClips).toHaveLength(1)
  })

  it('смонтированный таймлайн берётся как есть', () => {
    const layers = [{ id: 'x', text: 'hi', role: 'coach', lane: 1, clips: [{ start: 2, end: 4 }], repeats: [] }]
    const s = prepareSpeechLane({ timeline: { layers }, timelineLen: 9, audioClips: [{ id: 'c', at: 0, from: 0, len: 3 }] })
    expect(s.source).toBe('таймлайн')
    expect(s.layers[0].clips).toEqual([{ start: 2, end: 4 }])
    expect(s.timelineLen).toBe(9)
  })
})

describe('scriptFromLayers — сценарий из дорожек', () => {
  it('вылеты диктора и перевода по времени, каждый — предложение; ученик и скрытые не считаются', () => {
    const layers = [
      { id: 'a', text: 'try', role: 'coach', clips: [{ start: 5, end: 7 }], repeats: [{ start: 7, end: 9 }] },
      { id: 'tr', text: 'пытаться', role: 'translation', clips: [{ start: 9.5, end: 10 }], repeats: [] },
      { id: 'b', text: 'I', role: 'coach', clips: [{ start: 0, end: 2 }], repeats: [] },
      { id: 'c', text: 'I', role: 'user', clips: [{ start: 2, end: 4 }], repeats: [] },
      { id: 'd', text: 'nope', role: 'coach', visible: false, clips: [{ start: 1, end: 2 }], repeats: [] },
      { id: 'e', text: 'I try.', role: 'coach', clips: [{ start: 10, end: 12 }], repeats: [] },
    ]
    expect(scriptFromLayers(layers)).toBe('I. try. try. пытаться. I try.')
    // Круг замыкается: parseScript читает это обратно в те же группы
    expect(parseScript(scriptFromLayers(layers))).toEqual([{ text: 'I', n: 1 }, { text: 'try', n: 2 }, { text: 'пытаться', n: 1 }, { text: 'I try', n: 1 }])
  })
})

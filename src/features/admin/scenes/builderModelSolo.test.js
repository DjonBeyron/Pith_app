import { describe, it, expect } from 'vitest'
import { newDraft, setSolo, linesOfB, clearScene, fromScene } from './builderModel.js'
import { isSolo, PIT } from '../../scene/v2/scenePit.js'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { demoPitCircleScene } from '../../scene/v2/demoScenes.js'
import { lineAudioState } from '../../scene/v2/sceneVoice.js'
import { buildDraftActions } from './history/draftActions.js'

// Переключатель «Два кота / Один кот (Пит)» в модели черновика

describe('builderModel.setSolo', () => {
  it('на одного: a = Пит, b убран, реплики b → a; сцена валидна', () => {
    const d = newDraft()
    expect(linesOfB(d)).toBe(3)
    const s = setSolo(d, true)
    expect(isSolo(s)).toBe(true)
    expect(s.characters.a.name).toBe(PIT.name)
    expect(s.characters.b).toBeUndefined()
    expect(s.timeline.every(l => l.who === 'a')).toBe(true)
    expect(s.timeline).toHaveLength(d.timeline.length)
    expect(lintScene(s).filter(x => x.level === 'error')).toEqual([])
    expect(linesOfB(s)).toBe(0)
    expect(setSolo(s, true)).toBe(s) // уже одиночная — тот же объект
  })

  it('озвучка бывшей реплики b после перехода к Питу — «устарела» (другой голос)', () => {
    const d = newDraft()
    const i = d.timeline.findIndex(l => l.who === 'b')
    const tl = d.timeline.map((l, k) => (k === i
      ? { ...l, audioUrl: 'https://r2/x.mp3', wordTimings: [{ start: 0, end: 1 }], audioMeta: { hash: 'deadbeef', voiceId: 'v' } }
      : l))
    const s = setSolo({ ...d, timeline: tl }, true)
    expect(lineAudioState(s.timeline[i], s.characters.a)).toBe('stale')
  })

  it('обратно на двух: b по умолчанию, a (Пит) остаётся', () => {
    const solo = fromScene(demoPitCircleScene)
    const duo = setSolo(solo, false)
    expect(isSolo(duo)).toBe(false)
    expect(duo.characters.b.name).toBe('Кошка')
    expect(duo.characters.a.name).toBe('Пит')
    expect(setSolo(duo, false)).toBe(duo)
  })

  it('clearScene одиночной сцены — обе заготовки от a', () => {
    const s = clearScene(fromScene(demoPitCircleScene))
    expect(isSolo(s)).toBe(true)
    expect(s.timeline.map(l => l.who)).toEqual(['a', 'a'])
    expect(clearScene(newDraft()).timeline.map(l => l.who)).toEqual(['a', 'b'])
  })

  it('действие черновика setSolo с подписью шага', () => {
    const calls = []
    const actions = buildDraftActions((label, fn) => calls.push([label, fn(newDraft())]))
    actions.setSolo(true)
    expect(calls[0][0]).toBe('один кот (Пит)')
    expect(isSolo(calls[0][1])).toBe(true)
  })
})

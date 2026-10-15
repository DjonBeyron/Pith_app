import { describe, it, expect, vi } from 'vitest'
import { planVoiceAll, runVoicePlan, quotaVerdict, patchFromLine } from './voicePlan.js'
import { audioHash, voiceSpec } from '../../../scene/v2/sceneVoice.js'
import { demoOfficeScene } from '../../../scene/v2/demoScenes.js'

const clone = s => JSON.parse(JSON.stringify(s))
const URL_OK = 'https://pub-1.r2.dev/chat/a.mp3'
const ready = (scene, i, text = scene.timeline[i].text) => {
  const l = scene.timeline[i]
  l.text = text
  l.audioUrl = URL_OK
  l.wordTimings = [{ word: 'x', start: 0, end: 0.3 }]
  l.audioMeta = { hash: audioHash(text, voiceSpec(scene.characters[l.who])), voiceId: 'v', durationMs: 300 }
}

describe('planVoiceAll', () => {
  it('берёт только реплики без актуального файла; устаревшие — тоже; считает символы только по реальным вызовам', () => {
    const s = clone(demoOfficeScene)
    ready(s, 0)
    ready(s, 1)
    s.timeline[1].text = 'Текст поменяли.' // устарела
    const p = planVoiceAll(s)
    expect(p.items.map(x => x.index)).toEqual([1, 2, 3, 4, 5])
    expect(p.ready).toBe(1)
    expect(p.total).toBe(6)
    expect(p.generate).toBe(5)
    expect(p.chars).toBe(s.timeline.slice(1).reduce((n, l) => n + l.text.trim().length, 0))
  })
  it('кэш по hash: та же фраза тем же голосом — из готовой реплики или из первой в плане, без вызова', () => {
    const s = clone(demoOfficeScene)
    ready(s, 0, 'Привет!')
    s.timeline[2].text = 'Привет!'          // как №0 (a → a) — из готовой
    s.timeline[3].text = 'Повтор.'           // b
    s.timeline[5].text = 'Повтор.'           // b — как №3 внутри плана
    s.timeline[1].text = 'Привет!'           // b — другой голос? пока voiceId пуст у обоих → тот же spec → тоже из кэша
    const p = planVoiceAll(s)
    const byIndex = Object.fromEntries(p.items.map(x => [x.index, x.reuseFrom]))
    expect(byIndex[2]).toBe(0)
    expect(byIndex[1]).toBe(0)
    expect(byIndex[3]).toBeNull()
    expect(byIndex[5]).toBe(3)
    expect(p.generate).toBe(2) // №3 и №4
    // Разные голоса — разный hash, кэш не срабатывает
    s.characters.b.voice = { pitch: 1, rate: 1, voiceId: 'other' }
    expect(planVoiceAll(s).items.find(x => x.index === 1).reuseFrom).toBeNull()
  })
  it('пустые реплики пропускаются; всё озвучено — план пустой', () => {
    const s = clone(demoOfficeScene)
    s.timeline.forEach((_, i) => ready(s, i))
    expect(planVoiceAll(s).items).toEqual([])
    s.timeline[0].audioUrl = undefined
    s.timeline[0].text = '   '
    expect(planVoiceAll(s).items).toEqual([])
  })
  it('quotaVerdict: неизвестно / хватает / не хватает', () => {
    const plan = { chars: 100 }
    expect(quotaVerdict(plan, null)).toEqual({ known: false, remaining: null, enough: null })
    expect(quotaVerdict(plan, { used: 900, limit: 1000 })).toEqual({ known: true, remaining: 100, enough: true })
    expect(quotaVerdict(plan, { used: 950, limit: 1000 })).toEqual({ known: true, remaining: 50, enough: false })
    expect(quotaVerdict(plan, { used: 2000, limit: 1000 }).remaining).toBe(0)
  })
})

describe('runVoicePlan', () => {
  const plan = items => ({ items: items.map(([index, hash, reuseFrom = null]) => ({ index, text: `t${index}`, hash, who: 'a', reuseFrom })) })
  const patch = i => ({ audioUrl: `https://pub-1.r2.dev/${i}.mp3`, audioMeta: { hash: `h${i}` } })

  it('строго последовательно: следующая генерация не начинается, пока не закончилась предыдущая', async () => {
    let active = 0, maxActive = 0
    const order = []
    const generate = vi.fn(async item => {
      active += 1; maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 5))
      active -= 1; order.push(item.index)
      return patch(item.index)
    })
    const apply = vi.fn()
    const r = await runVoicePlan(plan([[0, 'a'], [1, 'b'], [2, 'c']]), { generate, apply })
    expect(maxActive).toBe(1)
    expect(order).toEqual([0, 1, 2])
    expect(apply.mock.calls.map(c => c[0])).toEqual([0, 1, 2])
    expect(apply.mock.calls[0][2]).toBe('original')
    expect(r).toEqual({ ok: [0, 1, 2], failed: [], stopped: false, skipped: [] })
  })
  it('ошибка одной реплики не обрывает остальные; итог — какие ок, какие нет и почему', async () => {
    const generate = vi.fn(async item => { if (item.index === 1) throw new Error('ElevenLabs 429'); return patch(item.index) })
    const progress = []
    const r = await runVoicePlan(plan([[0, 'a'], [1, 'b'], [2, 'c']]), { generate, apply: () => {}, onProgress: p => progress.push(p) })
    expect(r.ok).toEqual([0, 2])
    expect(r.failed).toEqual([{ index: 1, set: 'original', error: 'ElevenLabs 429' }])
    expect(progress.map(p => [p.done, p.ok])).toEqual([[1, true], [2, false], [3, true]])
    // Пустой результат — тоже ошибка реплики
    const r2 = await runVoicePlan(plan([[0, 'a']]), { generate: async () => ({}), apply: () => {} })
    expect(r2.failed[0].error).toMatch(/пустой результат/)
  })
  it('переиспользование: по hash внутри прогона и из готовой реплики (reusePatch) — без вызова generate', async () => {
    const generate = vi.fn(async item => patch(item.index))
    const apply = vi.fn()
    const reusePatch = vi.fn(j => ({ audioUrl: `https://pub-1.r2.dev/ready${j}.mp3` }))
    const r = await runVoicePlan(plan([[1, 'same'], [2, 'same', 1], [3, 'x', 0]]), { generate, apply, reusePatch })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[1]).toEqual([2, patch(1), 'original'])
    expect(apply.mock.calls[2][1].audioUrl).toBe('https://pub-1.r2.dev/ready0.mp3')
    expect(reusePatch).toHaveBeenCalledWith(0, 'original')
    expect(r.ok).toEqual([1, 2, 3])
  })
  it('остановка — между репликами: текущая доигрывает, остальные в skipped', async () => {
    let stop = false
    const generate = vi.fn(async item => { if (item.index === 1) stop = true; return patch(item.index) })
    const r = await runVoicePlan(plan([[0, 'a'], [1, 'b'], [2, 'c'], [3, 'd']]), { generate, apply: () => {}, isStopped: () => stop })
    expect(generate).toHaveBeenCalledTimes(2)
    expect(r.ok).toEqual([0, 1])
    expect(r.stopped).toBe(true)
    expect(r.skipped).toEqual([2, 3])
  })
  it('patchFromLine — только поля озвучки', () => {
    expect(patchFromLine({ text: 'x' })).toBeNull()
    expect(patchFromLine({ text: 'x', audioUrl: 'u', wordTimings: [1], audioMeta: { hash: 'h' }, translation: 't' })).toEqual({ audioUrl: 'u', wordTimings: [1], audioMeta: { hash: 'h' } })
  })
})

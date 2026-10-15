import { describe, it, expect } from 'vitest'
import { validateSceneV2 } from './sceneValidate.js'
import { lintScene, lintSize, SIZE_WARN_SHARE } from './sceneLint.js'
import { sceneByteSize, SCENE_MAX_BYTES } from './sceneNode.js'
import { demoOfficeScene } from './demoScenes.js'
import { sceneCheck } from '../../canvas/scenePickerModel.js'

// Лимит перевода ≤ 140 и предупреждение/ошибка о размере сцены (64 КБ)
const clone = s => JSON.parse(JSON.stringify(s))
const timings = n => Array.from({ length: n }, (_, i) => ({ word: 'ab', start: i * 0.3, end: i * 0.3 + 0.2 }))
const URL_OK = 'https://pub-1.r2.dev/chat/a.mp3'

describe('translation ≤ 140', () => {
  it('141 символ — ошибка валидатора с путём timeline[i].translation; 140 — ок', () => {
    const s = clone(demoOfficeScene)
    s.timeline[1].translation = 'x'.repeat(141)
    const errs = validateSceneV2(s)
    expect(errs).toEqual([expect.stringMatching(/^timeline\[1\]\.translation — не длиннее 140 символов \(сейчас 141\)/)])
    s.timeline[1].translation = 'x'.repeat(140)
    expect(validateSceneV2(s)).toEqual([])
  })
})

describe('размер сцены', () => {
  const heavy = (lines, words) => {
    const s = clone(demoOfficeScene)
    while (s.timeline.length < lines) s.timeline.push({ ...s.timeline[s.timeline.length % 6] })
    s.timeline = s.timeline.map(l => ({
      ...l, translation: 'y'.repeat(100),
      audioUrl: URL_OK, wordTimings: timings(words), audioMeta: { hash: 'a'.repeat(64), voiceId: 'v', durationMs: 1000 },
      translationAudioUrl: URL_OK, translationWordTimings: timings(words), translationAudioMeta: { hash: 'b'.repeat(64), voiceId: 'v', durationMs: 1000 },
    }))
    return s
  }
  it('обычная сцена — без замечаний о размере; ≥ 90% лимита — предупреждение с путём timeline; > лимита — ошибка', () => {
    expect(lintScene(demoOfficeScene).some(x => /КБ/.test(x.text))).toBe(false)
    const out = []
    lintSize(demoOfficeScene, out)
    expect(out).toEqual([])
    // Подбираем число слов, чтобы попасть в окно 90…100%
    let warn = null
    for (let w = 20; w <= 80 && !warn; w++) {
      const s = heavy(12, w)
      const b = sceneByteSize(s)
      if (b >= SCENE_MAX_BYTES * SIZE_WARN_SHARE && b <= SCENE_MAX_BYTES) warn = s
    }
    expect(warn, 'нашли сцену в окне 90…100%').not.toBeNull()
    const o = []
    lintSize(warn, o)
    expect(o).toEqual([{ level: 'warn', text: expect.stringMatching(/^timeline — сцена близка к лимиту 64 КБ \(\d+ КБ, 9\d%|100%\) из-за таймингов озвучки/) }])
    const big = heavy(12, 80)
    big.timeline = big.timeline.map(l => ({ ...l, text: 'z'.repeat(140) }))
    const bigOut = lintScene(big)
    expect(sceneByteSize(big)).toBeGreaterThan(SCENE_MAX_BYTES)
    expect(bigOut.some(x => x.level === 'error' && /^timeline — сцена больше 64 КБ/.test(x.text))).toBe(true)
    // Пикер ноды: ошибка размера приходит из линтера один раз, tooBig — true
    const chk = sceneCheck(big)
    expect(chk.tooBig).toBe(true)
    expect(chk.errors.filter(e => /64 КБ/.test(e)).length).toBe(1)
  })
})

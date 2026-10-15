import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

// Страж вёрстки голосовой панели ленты (feed-scene-voice.css): волны не режутся снизу, под кругом нет лишней пустоты
const read = p => fs.readFileSync(new URL(`../../../styles/${p}`, import.meta.url), 'utf8')
const css = read('feed-scene-voice.css')
const waves = read('player/panels/say-phrase-waves.css')
const sandboxCss = read('feed-sandbox.css')
const rule = (src, sel) => src.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
const px = (block, prop) => parseFloat(block.match(new RegExp(`(?:^|[\\s;])${prop}:\\s*(-?[\\d.]+)px`))?.[1])

describe('голосовая панель ленты: волны и нижний воздух', () => {
  const bodyH = px(rule(css, '.stVoice .stVoiceBody'), 'height')
  const clip = rule(css, '.stVoice .sayWaveClip')
  const padB = 12 // --say-pad-b (say-phrase.css)
  const center = 26 + (bodyH + padB - 26) / 2 // центр круга от верха тела

  it('слой волн достаёт вниз дальше самой большой волны (активация ×1,5 от якоря ×1,15)', () => {
    const maxScale = parseFloat(waves.match(/@keyframes sayActScale[\s\S]*?to\s*\{\s*transform:\s*scale\(([\d.]+)\)/)?.[1])
    const reach = (106.25 / 2) * 1.15 * maxScale
    const ext = -px(clip, 'bottom') // насколько слой ниже тела
    expect(ext).toBeGreaterThan(0)
    expect(bodyH - center + ext).toBeGreaterThanOrEqual(reach)
  })

  it('padding-bottom слоя держит центр круга на месте (слой ниже тела на ext, из них padB — штатные)', () => {
    expect(px(clip, 'padding-bottom')).toBe(-px(clip, 'bottom') - padB)
  })

  it('нижний отступ внутренней части не раздувает пустоту под кругом (≤ 12px), safe-area второй раз не добавляется', () => {
    expect(px(rule(css, '.stVoice .stInner'), 'padding-bottom')).toBeLessThanOrEqual(12)
    expect(css).not.toContain('safe-area-inset-bottom')
  })

  it('песочница рисует макеты нижних слоёв, и они гаснут под панелью', () => {
    expect(sandboxCss).toContain('.sbxStubPhrase')
    expect(sandboxCss).toContain('.sbxStubLearn')
    expect(sandboxCss).toMatch(/\.feedSlide\[data-scene-task\] \.sbxStubLearn/)
  })
})

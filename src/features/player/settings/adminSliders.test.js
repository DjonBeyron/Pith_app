import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Админские ползунки громкости: список (8 строк, «печатает» — один ползунок на
// typing-1 + typing-2, усиление до 200 % только у typing/xp-gain) и предпрослушивание
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const src = read('./AdminAudioSliders.jsx')

const play = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/lib/sounds.js', () => ({ playSound: play }))
const { previewSound, cancelSoundPreview, PLAY_GAP } = await import('./soundPreview.js')

describe('список ползунков громкости', () => {
  it('8 строк: «Печатает 1/2» слиты в один «Звук печатанья» на оба файла', () => {
    expect(src.match(/\{ names: \[/g)).toHaveLength(8)
    expect(src).toContain("{ names: ['typing-1', 'typing-2'], label: 'Звук печатанья', boost: true }")
    expect(src).not.toContain('Печатает 1')
    expect(src).not.toContain('Печатает 2')
    // каждый из остальных звуков (кроме typing-2, он в паре) — своя строка
    for (const n of ['message-in', 'answer-correct', 'answer-wrong', 'pin-message', 'xp-gain', 'level-up', 'lesson-locked']) {
      expect(src).toContain(`names: ['${n}']`)
    }
  })

  it('усиление (200 %) — только у печатанья и XP; нет Web Audio — 100 % и подпись', () => {
    expect(src.match(/boost: true/g)).toHaveLength(2)
    expect(src).toContain("{ names: ['xp-gain'], label: 'Начисление XP', boost: true }")
    expect(src).toContain('const max = canBoost ? BOOST_MAX_PCT : 100')
    expect(src).toContain('усиление недоступно на этом устройстве')
  })

  it('ползунок ставит ВСЕ имена своей строки, а превью играет первое (typing-1)', () => {
    expect(src).toContain('setVolume(names, p / 100); previewSound(name)')
    expect(src).toContain('const name = names[0]')
  })
})

describe('предпрослушивание на ползунке', () => {
  beforeEach(() => { play.mockClear(); vi.useFakeTimers() })
  afterEach(() => { cancelSoundPreview(); vi.useRealTimers() })

  it('играет мимо пользовательского выключателя (ignoreFilter) и не чаще PLAY_GAP', () => {
    let t = 10000
    const now = () => t
    previewSound('typing-1', now)
    expect(play).toHaveBeenCalledWith('typing-1', 'админ-ползунок', { ignoreFilter: true })
    t += 50
    previewSound('typing-1', now)
    expect(play).toHaveBeenCalledTimes(1)
    t += PLAY_GAP
    vi.advanceTimersByTime(PLAY_GAP)
    expect(play).toHaveBeenCalledTimes(2)
  })
})

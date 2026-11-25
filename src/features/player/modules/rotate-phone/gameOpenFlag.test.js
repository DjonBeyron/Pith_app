import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { setGameOpen } from './gameOpenFlag.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const fakeDoc = () => { const set = new Set(); return { set, documentElement: { classList: { toggle: (c, on) => { if (on) set.add(c); else set.delete(c) } } } } }

describe('флаг «игра открыта»: под оверлеем игры всё замирает', () => {
  it('класс gameOpen стоит, пока открыта хотя бы одна игра («Игра заново» монтирует новую раньше, чем снимет прежнюю)', () => {
    const doc = fakeDoc()
    expect(setGameOpen(true, doc)).toBe(1); expect(doc.set.has('gameOpen')).toBe(true)
    expect(setGameOpen(true, doc)).toBe(2)
    expect(setGameOpen(false, doc)).toBe(1); expect(doc.set.has('gameOpen')).toBe(true)
    expect(setGameOpen(false, doc)).toBe(0); expect(doc.set.has('gameOpen')).toBe(false)
    expect(setGameOpen(false, doc)).toBe(0) // лишнее снятие счётчик в минус не уводит
  })

  it('игра поднимает флаг, а стили ставят на паузу анимации панели и вкладки — тем же правилом, что под уроком', () => {
    expect(read('./WordLaneGame.jsx')).toContain('useGameOpenFlag()')
    const css = read('../../../../styles/lesson-open.css')
    for (const sel of ['.shellV2Nav *', '.shellV2Nav *::before', '.shellV2Nav *::after']) { expect(css).toContain(`html.lessonOpen ${sel}`); expect(css).toContain(`html.gameOpen ${sel}`) }
    expect(css).toContain('html.gameOpen .shellV2Content *:not(.playerStage, .playerStage *, .reviewScreen, .reviewScreen *)')
    expect(css.match(/animation-play-state: paused !important/g)).toHaveLength(1) // пауза, а не animation: none — после игры анимации идут с того же места
  })

  it('микрофон и звук флаг не трогает (это делает только флаг «урок открыт»)', () => {
    expect(read('./gameOpenFlag.js')).not.toMatch(/import .*(gameMic|gameAudio|audioSession|lessonOpen)/)
  })
})

// Закрыли панель ⚙ (там же «Отправить в GitHub» с диктовкой): игра остаётся на паузе, «Продолжить» — только тапом (владелец 2026-11-17)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const game = readFileSync(new URL('./WordLaneGame.jsx', import.meta.url), 'utf8')
const hud = readFileSync(new URL('./WordLaneHud.jsx', import.meta.url), 'utf8')

describe('закрытие панели ⚙ не снимает паузу само', () => {
  it('hudChange: открыли — пауза; закрыли — resume ТОЛЬКО для «Перезапустить ступень» (why = stage)', () => {
    const line = game.split('\n').find(l => l.includes('const hudChange'))
    expect(line).toContain("f.pause('hud')")
    expect(line).toContain("why === 'stage' && f.paused) pause.resume()")
    expect(line).not.toContain("why !== 'game'")
  })
  it('кнопка «Перезапустить ступень» передаёт why = stage, простое закрытие — без причины', () => {
    expect(hud).toContain("setOpen(false, 'stage')")
    expect(hud).toContain('const close = () => setOpen(false)')
  })
})

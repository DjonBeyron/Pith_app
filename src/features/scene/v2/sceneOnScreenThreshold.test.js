import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Рамка кружка Пита (solo, crop.scale 1) — кадр в ~20 раз больше видимого круга: видимая доля ≈ 4 %.
// Порог IntersectionObserver 0.05 считал её «вне экрана», режиссёр стоял на авто-паузе, тап по кружку ничего не запускал
describe('SceneRenderer — «на экране» для кадра, обрезанного кружком', () => {
  it('порог IntersectionObserver — 0 (любой видимый пиксель)', () => {
    const src = readFileSync(new URL('./SceneRenderer.jsx', import.meta.url), 'utf8')
    expect(src).toContain('{ threshold: 0 }')
    expect(src).not.toContain('threshold: 0.05')
  })
})

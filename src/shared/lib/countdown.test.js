import { describe, it, expect } from 'vitest'
import { createCountdown } from './countdown.js'

describe('createCountdown', () => {
  it('считает остаток и сообщает, что время вышло', () => {
    const c = createCountdown(6000)
    c.resume(0)
    expect(c.tick(1500)).toEqual({ leftMs: 4500, fraction: 0.75, expired: false })
    expect(c.tick(6000)).toEqual({ leftMs: 0, fraction: 0, expired: true })
    expect(c.tick(9000).expired).toBe(true)
  })

  it('скрытая вкладка время не тратит: после возвращения отсчёт идёт дальше с того же места', () => {
    const c = createCountdown(6000)
    c.resume(0)
    c.tick(2000)
    expect(c.tick(12000, false).leftMs).toBe(4000) // 10 с в фоне не в счёт
    c.resume(12000)
    expect(c.tick(13000).leftMs).toBe(3000)
  })

  it('пауза (панель не активна): пока tick не зовут, время стоит; resume начинает с нуля прошедшего', () => {
    const c = createCountdown(5000)
    c.resume(0)
    c.tick(1000)
    c.resume(20000) // вернулись после сигнала
    expect(c.tick(21000).leftMs).toBe(3000)
  })
})

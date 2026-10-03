import { describe, it, expect, beforeEach } from 'vitest'

// <audio> — пустышка: считаем созданные и запущенные звуки
const created = []
let plays = 0
class FakeAudio {
  constructor(src) { this.src = src; this.currentTime = 0; created.push(src) }
  play() { plays += 1; return Promise.resolve() }
  load() {}
  addEventListener() {}
  removeEventListener() {}
}
globalThis.Audio = FakeAudio
const { playSound, setSoundsMuted } = await import('./sounds.js')

describe('беззвучный режим колоды глушит звуки интерфейса', () => {
  beforeEach(() => { created.length = 0; plays = 0; setSoundsMuted(false) })

  it('обычно звук идёт', () => {
    playSound('message-in')
    expect(plays).toBe(1)
  })

  it('«Не могу слушать»: сообщения чата и «верно»/«неверно» молчат — звук даже не создаётся', () => {
    setSoundsMuted(true)
    playSound('message-in')
    playSound('answer-correct')
    playSound('answer-wrong')
    expect(plays).toBe(0)
    expect(created).toHaveLength(0)
  })

  it('звук вернули — снова звучит', () => {
    setSoundsMuted(true)
    playSound('pin-message')
    setSoundsMuted(false)
    playSound('pin-message')
    expect(plays).toBe(1)
  })
})

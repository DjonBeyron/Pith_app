import { describe, it, expect, beforeEach, vi } from 'vitest'
import { suppressSound, isSoundQuiet, _resetSoundQuiet } from '../soundQuiet.js'
import { createSayQuiet } from './sayQuietWindow.js'
import { quietTailMs, QUIET_TAIL_MS } from './sayHints.js'

// Воспроизведение жалобы «верно сказал фразу — звука нет» (iPhone, Vosk, v3.2.1924): окно тишины держалось QUIET_TAIL_MS после результата,
// а панель играла answer-correct в тот же миг (phase passed) — звук попадал в окно и отбрасывался навсегда. Последовательность: тап → результат → passed → finish.
beforeEach(() => { _resetSoundQuiet(); vi.useFakeTimers() })

const plays = []
// как playSound(): подавлен окном → отложится (answer-correct) или пропадёт; иначе играет сразу
const play = name => { if (!suppressSound(name, () => play(name))) plays.push(name) }

describe('окно тишины «Сказать фразу»: звук верного ответа не пропадает', () => {
  beforeEach(() => { plays.length = 0 })

  it('Vosk: микрофон к результату уже закрыт — окно закрывается сразу, answer-correct в момент passed играет без задержки', () => {
    const q = createSayQuiet()
    q.open()
    expect(isSoundQuiet()).toBe(true)
    q.close({ engine: 'vosk' }) // результат → phase passed
    expect(isSoundQuiet()).toBe(false)
    play('answer-correct') // эффект passed
    expect(plays).toEqual(['answer-correct'])
  })

  it('системное распознавание: хвост сохраняется, но answer-correct не пропадает — играет один раз, когда хвост кончился (до ухода шага)', () => {
    const q = createSayQuiet()
    q.open()
    q.close({ engine: 'system' })
    play('answer-correct')
    expect(plays).toEqual([]) // хвост: системный сигнал конца записи
    vi.advanceTimersByTime(QUIET_TAIL_MS)
    expect(plays).toEqual(['answer-correct'])
    expect(isSoundQuiet()).toBe(false)
  })

  it('панель ушла раньше конца хвоста (dispose): отложенный звук всё равно играет, окно не залипает', () => {
    const q = createSayQuiet()
    q.open()
    q.close({ engine: 'system' })
    play('answer-correct')
    q.dispose()
    expect(plays).toEqual(['answer-correct'])
    expect(isSoundQuiet()).toBe(false)
    vi.advanceTimersByTime(QUIET_TAIL_MS * 2)
    expect(plays).toEqual(['answer-correct']) // повторно не играет
  })

  it('новая попытка в хвосте отменяет таймер; повторный close не удлиняет хвост; во время записи звук подавлен', () => {
    const q = createSayQuiet()
    q.open(); q.close({ engine: 'system' })
    vi.advanceTimersByTime(QUIET_TAIL_MS - 100)
    q.open() // тап до конца хвоста
    vi.advanceTimersByTime(1000)
    expect(isSoundQuiet()).toBe(true)
    q.close({ engine: 'system' }); q.close({ engine: 'system' })
    vi.advanceTimersByTime(QUIET_TAIL_MS)
    expect(isSoundQuiet()).toBe(false)
  })

  it('хвост: 0 для Vosk, QUIET_TAIL_MS для системного и неизвестного движка', () => {
    expect(quietTailMs({ engine: 'vosk' })).toBe(0)
    expect(quietTailMs({ engine: 'system' })).toBe(QUIET_TAIL_MS)
    expect(quietTailMs(null)).toBe(QUIET_TAIL_MS)
  })
})

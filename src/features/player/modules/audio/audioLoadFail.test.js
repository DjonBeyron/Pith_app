import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('голосовое, чей файл не загрузился (404)', () => {
  const mod = read('./AudioModule.jsx')
  const hook = read('./useAudioLoadFail.js')

  it('кнопка: ↻ и подпись «не загрузилось», кольцо — пока грузится после тапа', () => {
    expect(mod).toContain('loadFail.failed ? <RetryIcon />')
    expect(mod).toContain("'не загрузилось'")
    expect(mod).toContain('audio.paused && audio.readyState < 2) setBuffering(true)')
  })

  it('один повтор по тапу с меткой в адресе, потом урок идёт дальше (onGiveUp → onDone)', () => {
    expect(mod).toContain('loadFail.gaveUp() || (loadFail.failed && !loadFail.retry())')
    expect(mod).toContain('onGiveUp')
    expect(mod).toContain('onDone?.()')
    expect(hook).toContain('triesRef.current >= 1')
    expect(hook).toContain('_r=${token}')
    expect(hook).toContain('flushSync') // адрес обновлён синхронно — play() остаётся в том же касании
  })

  it('автоповтор без тапа через AUTO_RETRY_MS, после второй ошибки — таймер: текст печатается, нода завершается (как заглушка админа)', () => {
    expect(hook).toContain('AUTO_RETRY_MS')
    expect(hook).toContain('cbRef.current.onRetry?.()')
    expect(mod).toContain('onGiveUp: () => setTimerMode(true)')
    expect(mod).toContain('(adminPreview && !src) || timerMode')
    expect(mod).toContain('ms: stubMs')
  })

  it('NotSupportedError от play() считается сбоем загрузки, AbortError — нет', () => {
    expect(mod).toContain("err.name === 'NotSupportedError') loadFail.fail('play()')")
    expect(mod).not.toMatch(/AbortError'\) loadFail/)
  })
})

import { describe, it, expect } from 'vitest'
import { describeAudioFail, soundStatusText, SOURCE_LABEL } from './sceneAudioFail.js'

// Подписи причин отказа файла озвучки и строки статуса «звук: …» — по-русски, без пустот
describe('sceneAudioFail — причина отката на синтез/таймер словами', () => {
  it('известные причины и коды MediaError', () => {
    expect(describeAudioFail('not-allowed')).toMatch(/NotAllowedError/)
    expect(describeAudioFail('not-supported')).toMatch(/404\/403/)
    expect(describeAudioFail('media-error-4')).toMatch(/SRC_NOT_SUPPORTED/)
    expect(describeAudioFail('media-error-2')).toMatch(/сети/)
    expect(describeAudioFail('media-error-9')).toMatch(/код 9/)
    expect(describeAudioFail('play-rejected-AbortError')).toBe('play() отклонён (AbortError)')
    expect(describeAudioFail('load-timeout')).toMatch(/7 с/)
  })
  it('неизвестная/пустая причина не даёт пустую строку', () => {
    expect(describeAudioFail(undefined)).toBe('неизвестная причина (unknown)')
    expect(describeAudioFail('что-то')).toBe('неизвестная причина (что-то)')
  })
  it('статус предпросмотра: источник, а при отказе — ещё и причина', () => {
    expect(soundStatusText('audio', null)).toBe('звук: файл')
    expect(soundStatusText('speech', null)).toBe(`звук: ${SOURCE_LABEL.speech}`)
    expect(soundStatusText(undefined, null)).toBe('звук: таймер')
    expect(soundStatusText('audio', null, false)).toBe('звук: без звука') // галка «звук» снята — источник не важен
    expect(soundStatusText('timer', { reason: 'not-supported' })).toMatch(/^звук: таймер — файл не завёлся: файл недоступен/)
  })
})

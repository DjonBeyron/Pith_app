import { describe, it, expect, vi } from 'vitest'
import { VoskError, isQuotaError, diagnoseFetchFailure, isRetryable, cellularWarning, errorText, MODEL_MB } from './voskErrors.js'

describe('voskErrors: тексты по-русски из кодов', () => {
  it('адрес недоступен с кодом', () => {
    expect(new VoskError('http', { status: 404 }).message).toBe('Адрес недоступен (код 404). Проверьте адрес модели')
  })
  it('CORS, сеть, место, веб-страница, отмена', () => {
    expect(new VoskError('cors').message).toMatch(/закрыт CORS.*правило CORS на бакете/)
    expect(new VoskError('network').message).toMatch(/Сеть пропала — повторите/)
    expect(new VoskError('quota').message).toMatch(/Нет места на устройстве \(QuotaExceeded\)/)
    expect(new VoskError('html').message).toMatch(/веб-страница/)
    expect(new VoskError('cancelled').message).toMatch(/отменено/)
    expect(new VoskError('incomplete', { detail: '10.0 МБ из 40.0 МБ' }).message).toMatch(/не полностью \(10\.0 МБ из 40\.0 МБ\)/)
  })
  it('errorText: свои ошибки, переполнение хранилища браузера и чужие', () => {
    expect(errorText(new VoskError('stall'))).toMatch(/зависло/)
    expect(errorText({ name: 'QuotaExceededError' })).toMatch(/QuotaExceeded/)
    expect(errorText(new Error('boom'))).toBe('boom')
  })
  it('isQuotaError узнаёт варианты разных браузеров', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaError({ code: 22 })).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError(new Error('x'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })
})

describe('voskErrors: CORS или сеть', () => {
  it('HEAD no-cors дошёл → CORS; не дошёл → сеть; офлайн → сеть без запроса', async () => {
    const ok = vi.fn(async () => ({ type: 'opaque' }))
    expect((await diagnoseFetchFailure('https://h/m', { fetchFn: ok, online: true })).code).toBe('cors')
    expect(ok).toHaveBeenCalledWith('https://h/m', { method: 'HEAD', mode: 'no-cors' })
    expect((await diagnoseFetchFailure('u', { fetchFn: async () => { throw new TypeError('x') }, online: true })).code).toBe('network')
    const never = vi.fn()
    expect((await diagnoseFetchFailure('u', { fetchFn: never, online: false })).code).toBe('network')
    expect(never).not.toHaveBeenCalled()
  })
})

describe('voskErrors: повторы и мобильная сеть', () => {
  it('повторяем сеть/зависание/обрыв/5xx/429; не повторяем 404, CORS, отмену, веб-страницу', () => {
    for (const e of [new VoskError('network'), new VoskError('stall'), new VoskError('incomplete'), new VoskError('http', { status: 503 }), new VoskError('http', { status: 429 })]) expect(isRetryable(e)).toBe(true)
    for (const e of [new VoskError('http', { status: 404 }), new VoskError('cors'), new VoskError('cancelled'), new VoskError('html'), new Error('x')]) expect(isRetryable(e)).toBe(false)
  })
  it('предупреждение: cellular, экономия трафика, медленная сеть; wifi и нет API — без предупреждения', () => {
    expect(cellularWarning({ type: 'cellular' })).toMatch(new RegExp(`Wi-Fi нужен: модель ${MODEL_MB} МБ`))
    expect(cellularWarning({ type: 'wifi', saveData: true })).toMatch(/экономия трафика/)
    expect(cellularWarning({ effectiveType: '3g' })).toMatch(/Wi-Fi нужен/)
    expect(cellularWarning({ type: 'wifi', effectiveType: '4g' })).toBeNull()
    expect(cellularWarning(undefined)).toBeNull()
  })
})

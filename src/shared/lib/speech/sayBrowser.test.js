import { describe, it, expect, afterEach } from 'vitest'
import { isFirefoxUa, isFirefoxBrowser } from './sayBrowser.js'

const UA = {
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/128.0 Mobile/15E148 Safari/605.1.15',
  firefoxIpad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.1 Mobile/15E148 Safari/605.1.15',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  chromeDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
}

describe('isFirefoxUa — Firefox по User-Agent', () => {
  it('Firefox на десктопе, Android и iPhone/iPad (FxiOS) — да', () => {
    for (const k of ['firefoxDesktop', 'firefoxMac', 'firefoxAndroid', 'firefoxIos', 'firefoxIpad']) expect(isFirefoxUa(UA[k]), k).toBe(true)
  })

  it('Safari, Chrome (в т.ч. CriOS), Edge — нет', () => {
    for (const k of ['safariIos', 'safariMac', 'chromeDesktop', 'chromeAndroid', 'chromeIos', 'edge']) expect(isFirefoxUa(UA[k]), k).toBe(false)
  })

  it('пустое, undefined и не-строки — нет (не блокируем зря); слово firefox без версии — нет', () => {
    for (const v of ['', undefined, null, 0, {}]) expect(isFirefoxUa(v)).toBe(false)
    expect(isFirefoxUa('Mozilla/5.0 FirefoxLike')).toBe(false)
  })
})

describe('isFirefoxBrowser — текущий браузер', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const setUa = ua => Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true })
  afterEach(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator })

  it('читает navigator.userAgent', () => {
    setUa(UA.firefoxDesktop); expect(isFirefoxBrowser()).toBe(true)
    setUa(UA.safariIos); expect(isFirefoxBrowser()).toBe(false)
  })

  it('navigator недоступен или бросает — false', () => {
    delete globalThis.navigator
    expect(isFirefoxBrowser()).toBe(false)
    Object.defineProperty(globalThis, 'navigator', { get() { throw new Error('denied') }, configurable: true })
    expect(isFirefoxBrowser()).toBe(false)
  })
})

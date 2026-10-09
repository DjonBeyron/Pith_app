import { describe, it, expect, vi, afterEach } from 'vitest'
import { shouldCheckUpdate, isNewerBuild, ownBuild, askSw, confirmBoot } from './shellClient.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('shellClient: чистые части', () => {
  it('проверка новой версии — не чаще раза в 10 минут', () => {
    expect(shouldCheckUpdate(1000, 0)).toBe(false)
    expect(shouldCheckUpdate(10 * 60 * 1000, 0)).toBe(true)
    expect(shouldCheckUpdate(10 * 60 * 1000 - 1, 0)).toBe(false)
  })

  it('сообщение о новой версии касается страницы, только если BUILD_ID воркера отличается от её собственного', () => {
    expect(isNewerBuild('B2', 'B1')).toBe(true)
    expect(isNewerBuild('B1', 'B1')).toBe(false) // первая установка воркера под только что загруженной страницей
    expect(isNewerBuild('B2', null)).toBe(false) // dev: свой BUILD_ID неизвестен
    expect(isNewerBuild(null, 'B1')).toBe(false)
  })

  it('ownBuild: берёт meta pithy-build, токен dev-сборки (__BUILD_ID__) считает отсутствием', () => {
    const meta = content => ({ querySelector: () => ({ content }) })
    vi.stubGlobal('document', meta('3.2.1-ab12cd34'))
    expect(ownBuild()).toBe('3.2.1-ab12cd34')
    vi.stubGlobal('document', meta('__BUILD_ID__'))
    expect(ownBuild()).toBeNull()
    vi.stubGlobal('document', { querySelector: () => null })
    expect(ownBuild()).toBeNull()
  })
})

describe('shellClient: обмен с воркером', () => {
  it('askSw: без воркера-контроллера — null сразу; с воркером — ответ по MessageChannel; молчит — null по таймауту', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { controller: null } })
    expect(await askSw({ type: 'x' })).toBeNull()
    const sent = []
    vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage: (m, ports) => { sent.push(m); ports[0].postMessage({ type: 'shell-status', enabled: true }) } } } })
    expect(await askSw({ type: 'shell-status' })).toEqual({ type: 'shell-status', enabled: true })
    expect(sent).toEqual([{ type: 'shell-status' }])
    vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage: () => {} } } })
    expect(await askSw({ type: 'x' }, 20)).toBeNull()
  })

  it('confirmBoot шлёт boot-ok воркеру; без воркера молчит', () => {
    const posted = []
    vi.stubGlobal('document', { querySelector: () => ({ content: 'B1' }) })
    vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage: m => posted.push(m) } } })
    confirmBoot()
    expect(posted).toEqual([{ type: 'boot-ok', buildId: 'B1' }])
    vi.stubGlobal('navigator', { serviceWorker: undefined })
    expect(() => confirmBoot()).not.toThrow()
  })
})

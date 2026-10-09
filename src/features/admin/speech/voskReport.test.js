import { describe, it, expect } from 'vitest'
import { TEST_GRAMMAR, makeAttempt, isHit, verdict, attemptLine, buildVoskReport } from './voskReport.js'

const stats = (conf, start, end, extra = {}) => ({ words: [{ word: 'x', conf, start, end }], firstPartialMs: 300, resultMs: 900, ...extra })

describe('voskReport: тест закрытого словаря', () => {
  it('словарь теста: try, trying, [unk]', () => {
    expect(JSON.parse(TEST_GRAMMAR)).toEqual(['try', 'trying', '[unk]'])
  })
  it('попытка: что услышали, уверенность и время слова', () => {
    const a = makeAttempt('try', ' try ', stats(0.9123, 0.4, 0.71))
    expect(a).toMatchObject({ say: 'try', heard: 'try', conf: 0.91, start: 0.4, end: 0.71, resultMs: 900, firstPartialMs: 300 })
    expect(isHit(a)).toBe(true)
    expect(isHit(makeAttempt('try', '[unk]', {}))).toBe(false)
    expect(makeAttempt('try', '', {})).toMatchObject({ heard: '', conf: null, start: null })
  })
  it('вывод: «try» остался «try» — словарь не исправляет; подмена на «trying» — исправил', () => {
    expect(verdict([])).toMatch(/по очереди/)
    expect(verdict([makeAttempt('try', 'try', {})])).toMatch(/НЕ исправляет/)
    expect(verdict([makeAttempt('try', 'trying', {})])).toMatch(/подменил/)
    expect(verdict([makeAttempt('try', '[unk]', {})])).toMatch(/не из списка/)
  })
  it('отчёт компактный: модель, адрес, размер, загрузка, задержка, что услышали', () => {
    const attempts = [makeAttempt('try', 'try', stats(0.95, 0.3, 0.6)), makeAttempt('trying', 'trying', stats(0.88, 0.3, 0.8))]
    const text = buildVoskReport({ url: 'https://pub-1.r2.dev/chat/m.tar.gz', size: 40265318, from: 'network', downloadMs: 12300, libMs: 340, modelMs: 5210, heap: 54, attempts })
    expect(text).toContain('m.tar.gz @ pub-1.r2.dev, 38.4 МБ, скачана за 12.3 с')
    expect(text).toContain('библиотека 340 мс, модель в память 5210 мс')
    expect(text).toContain('сказал «try» → услышали «try» (уверенность 0.95, слово 0.3–0.6 с), итог 900 мс')
    expect(text).toContain('Вывод: Сказали «try» — услышано «try»')
    expect(text.split('\n').length).toBeLessThanOrEqual(7)
    expect(attemptLine(attempts[1])).toContain('«trying»')
    expect(buildVoskReport({ url: 'x', from: 'cache', attempts: [] })).toContain('из кеша устройства')
  })
})

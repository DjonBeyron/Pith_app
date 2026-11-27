import { describe, it, expect } from 'vitest'
import { loafEntry } from './useLagTrace.js'

const script = (o = {}) => ({ duration: 10, forcedStyleAndLayoutDuration: 0, sourceFunctionName: 'x', invoker: 'FrameRequestCallback', ...o })

describe('запись длинного кадра браузера (loafEntry)', () => {
  it('тяжёлый скрипт и вынужденный пересчёт называются файлом и позицией (имена в сборке сжаты)', () => {
    const e = { startTime: 100, duration: 727, styleAndLayoutStart: 800, scripts: [script({ duration: 541, forcedStyleAndLayoutDuration: 465, sourceFunctionName: 'qu', sourceURL: 'https://x.app/assets/index-AbCd.js?v=1', sourceCharPosition: 12345, invokerType: 'animation-frame-callback' })] }
    const t = loafEntry(e).text
    expect(t).toContain('дольше всех qu 541 мс [index-AbCd.js:12345, animation-frame-callback]')
    expect(t).toContain('вынужденный пересчёт стилей 465 мс (больше всего в qu [index-AbCd.js:12345')
  })
  it('лёгкий кадр — без позиции, как раньше', () => {
    const t = loafEntry({ startTime: 0, duration: 60, styleAndLayoutStart: 50, scripts: [script({ duration: 30, forcedStyleAndLayoutDuration: 5, sourceURL: 'a/b.js', sourceCharPosition: 1 })] }).text
    expect(t).toBe('кадр браузера 60 мс: скрипт 30 мс (дольше всех x 30 мс), из них вынужденный пересчёт стилей 5 мс, стили и раскладка 10 мс')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { whyNotIdle } from './launchWhy.js'

// Кнопка «Полная гонка» была серой после озвучки без объяснения: модуль пересоздавался по key={voice.rev} и заново ждал Vosk. Теперь linesRev и строка-причина
describe('RaceBlock: причина серой кнопки и перечитывание реплик без пересоздания модуля', () => {
  it('whyNotIdle называет причину', () => {
    expect(whyNotIdle({ busy: true })).toBe('запускаю…')
    expect(whyNotIdle({ ready: false, vosk: 'preparing' })).toContain('готовлю')
    expect(whyNotIdle({ ready: false, vosk: 'need' })).toContain('скачать')
    expect(whyNotIdle({ ready: false, vosk: 'failed' })).toContain('сбой')
    expect(whyNotIdle({ ready: true })).toBe('')
  })
  it('модуль получает linesRev, а не key: озвучка реплик не пересоздаёт игру', () => {
    for (const f of ['RaceBlock.jsx', 'RehearsalPolishBlock.jsx']) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
      expect(src, f).toContain('linesRev={voice.rev}'); expect(src, f).not.toContain('key={voice.rev}')
    }
    const mod = readFileSync(new URL('../../player/modules/rotate-phone/RotatePhoneModule.jsx', import.meta.url), 'utf8')
    expect(mod).toContain('}, [linesRev])'); expect(mod).toContain('vosk: vosk.status')
  })
})

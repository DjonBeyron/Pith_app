import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

// Стражи тихой фоновой загрузки: shared не зависит от админки; библиотека/движок Vosk здесь не грузятся; в приложение хук
// подключён ровно один раз; все «главные» загрузки сообщают о занятости сети.
const src = resolve(import.meta.dirname, '../../..')
const read = p => readFileSync(resolve(src, p), 'utf8')
const importLines = text => text.split('\n').filter(l => /^\s*(import\b|.*\bawait import\()/.test(l)).join('\n')
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))

describe('границы слоёв', () => {
  it('src/shared ничего не импортирует из features/admin (и вообще из features)', () => {
    for (const f of walk(resolve(src, 'shared')).filter(p => /\.(js|jsx)$/.test(p) && !/\.test\./.test(p))) {
      expect(importLines(readFileSync(f, 'utf8')), f).not.toMatch(/features\//)
    }
  })
  it('фоновая загрузка не тянет движок и библиотеку vosk-browser (только скачать в кэш)', () => {
    const bg = ['voskBackground.js', 'voskBgDownload.js', 'voskBgPolicy.js', 'voskBgLock.js', 'voskBgStatus.js', 'voskBgSchedule.js', 'voskParts.js', 'useVoskBackground.js']
    for (const f of bg) expect(importLines(read(`shared/lib/vosk/${f}`)), f).not.toMatch(/vosk-browser|voskEngine|voskSession/)
  })
  it('в бандл приложения попадает только лёгкий планировщик: App.jsx не импортирует движок', () => {
    expect(importLines(read('app/App.jsx'))).not.toMatch(/vosk-browser|voskEngine/)
  })
})

describe('подключение', () => {
  it('useVoskBackground() вызывается в App.jsx ровно один раз, без параметров', () => {
    expect(read('app/App.jsx').match(/useVoskBackground\(\)/g)).toHaveLength(1)
    const others = walk(src).filter(p => /\.(js|jsx)$/.test(p) && !/\.test\./.test(p) && !p.endsWith('useVoskBackground.js') && !p.endsWith('App.jsx'))
    for (const f of others) expect(readFileSync(f, 'utf8'), f).not.toMatch(/useVoskBackground\(/)
  })
  it('сеть «занята» объявляют: файлы урока (preloadFetch), озвучка слов (wordAudioPlayer), лента (FeedSwiper)', () => {
    expect(read('features/player/preloadFetch.js')).toMatch(/beginNetBusy\(\)[\s\S]*finally \{ endBusy\(\) \}/)
    expect(read('features/player/word-audio/wordAudioPlayer.js')).toMatch(/beginNetBusy\(\)[\s\S]*finally \{ endBusy\(\) \}/)
    expect(read('features/feed/FeedSwiper.jsx')).toMatch(/setFeedActive\(active\); return \(\) => setFeedActive\(false\)/)
  })
  it('админская строка статуса стоит только в блоке модели админ-пробы', () => {
    const users = walk(src).filter(p => /\.(js|jsx)$/.test(p) && !/\.test\./.test(p) && /VoskBackgroundStatus/.test(readFileSync(p, 'utf8')) && !p.endsWith('VoskBackgroundStatus.jsx'))
    expect(users.map(p => p.split('/').pop())).toEqual(['VoskModelBlock.jsx'])
  })
  it('Service Worker и кеш оболочки модель не трогают (кеш vosk-parts-v1 так же чужой для воркера)', () => {
    const sw = readFileSync(resolve(src, '../public/push-sw.js'), 'utf8')
    expect(sw).not.toMatch(/vosk/i)
  })
})

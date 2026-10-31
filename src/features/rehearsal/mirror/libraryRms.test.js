import { describe, it, expect } from 'vitest'
import { libraryRms } from './libraryRms.js'
import { CHUNKS } from './mirrorFixtures.js'

describe('libraryRms: громкость диктора по файлам кусков библиотеки', () => {
  const lib = new Map([["i'm", { url: 'a.mp3', duration: 0.4 }], ['trying', { url: 'b.mp3', duration: 0.6 }], ['to learn', { url: 'c.mp3', duration: 0.7 }]])
  it('среднее по файлам кусков; сбой загрузки и пустая библиотека — null', async () => {
    const rms = await libraryRms(CHUNKS, { cache: lib, load: async url => url, analyze: async url => ({ rms: url === 'a.mp3' ? 0.1 : url === 'b.mp3' ? 0.2 : 0.3 }) })
    expect(rms).toBeCloseTo(0.2, 5)
    expect(await libraryRms(CHUNKS, { cache: lib, load: async () => { throw new Error('offline') } })).toBeNull()
    expect(await libraryRms(CHUNKS, { cache: new Map() })).toBeNull()
  })
})

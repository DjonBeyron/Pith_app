import { describe, it, expect } from 'vitest'
import { phraseTokens, phraseNodes, phraseItem } from './phraseDrill.js'

describe('закрепление фразы', () => {
  it('слова фразы: по пробелам, одиночные знаки прочь, апострофы на месте', () => {
    expect(phraseTokens("I'm trying to cook")).toEqual(["I'm", 'trying', 'to', 'cook'])
    expect(phraseTokens('Keep going · test — ok?')).toEqual(['Keep', 'going', 'test', 'ok?'])
    expect(phraseTokens('')).toEqual([])
  })

  it('с видео: видео → через 1,5 с «собери фразу»; без видео — только сборка', () => {
    const withVideo = phraseNodes({ id: 'm', title: 'Hold on', videoUrl: 'https://r2/v.mp4' })
    expect(withVideo.map(n => n.type)).toEqual(['video', 'phrase_assembly'])
    expect(withVideo[0].typeData.video.r2Url).toBe('https://r2/v.mp4')
    expect(withVideo[0].triggers[0]).toMatchObject({ if: 'timer', then: 'phrase-assemble' })
    expect(withVideo[1].typeData.phrase_assembly.words).toEqual(['Hold', 'on'])
    expect(withVideo[1].triggers.map(t => t.if)).toEqual(['phrase_correct', 'phrase_wrong'])
    const noVideo = phraseNodes({ id: 'm', title: 'Hold on', videoUrl: null })
    expect(noVideo.map(n => [n.type, n.seq])).toEqual([['phrase_assembly', 1]])
  })

  it('пункт очереди без слова и без «Знаю»', () => {
    expect(phraseItem({ id: 'm1', title: 'Hold on' })).toMatchObject({ key: 'phrase:m1', kind: 'phrase', word: null, attempt: 2 })
  })
})

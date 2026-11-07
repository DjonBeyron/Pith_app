import { describe, it, expect } from 'vitest'
import { wordVoiced, unvoicedWords, phraseWordsVoiced, voicedPhraseTest } from './racePhraseWordVoice.js'
import { raceTexts } from './raceTexts.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// Озвучка слов фразы: слово звучит голосом диктора только из библиотеки word_audio (ключ wordKey). Нет записи — тишина (голоса системы нет), поэтому демо берёт фразу с озвучкой каждого слова.
const lib = new Map([['see', { url: 'r2/see.mp3' }], ['you', { url: 'r2/you.mp3' }], ['later', { url: null }], ["i'm", { url: 'r2/im.mp3' }]])

describe('озвучка слов фразы (racePhraseWordVoice.js)', () => {
  it('слово — по wordKey (регистр, знаки по краям, апостроф); без url или без библиотеки — нет', () => {
    expect(wordVoiced('See', lib)).toBe(true); expect(wordVoiced('you,', lib)).toBe(true); expect(wordVoiced('I’m', lib)).toBe(true)
    expect(wordVoiced('later', lib)).toBe(false); expect(wordVoiced('see', null)).toBe(false); expect(wordVoiced('', lib)).toBe(false)
  })
  it('фраза: озвучено каждое слово — да; список неозвученных', () => {
    expect(unvoicedWords('See you later', lib)).toEqual(['later']); expect(phraseWordsVoiced('See you later', lib)).toBe(false)
    expect(phraseWordsVoiced('See you!', lib)).toBe(true); expect(phraseWordsVoiced('', lib)).toBe(false)
  })
  it('проверка для демо: библиотека не загружена — не судим (любая фраза), загружена — по словам', () => {
    expect(voicedPhraseTest(null)('Good night')).toBe(true)
    expect(voicedPhraseTest(lib)('See you later')).toBe(false); expect(voicedPhraseTest(lib)('See you')).toBe(true)
  })
  it('прогрев: слова ВСЕХ фраз плана, включая запасные (own: false), попадают в тексты библиотеки игры (raceTexts → cfg.extraWords → wordsPlan.now)', () => {
    const texts = raceTexts({ game: 'race', chunks: ['Hello'], words: [], phrases: PHRASE_FIXTURE }).map(t => t.toLowerCase())
    for (const w of ['see', 'you', 'later', 'nice', 'meet', "i'm"]) expect(texts).toContain(w)
  })
})

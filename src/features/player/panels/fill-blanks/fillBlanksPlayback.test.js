import { describe, it, expect, beforeEach, vi } from 'vitest'

// Сквозная проверка «каждое выбранное слово звучит»: тот же путь, что в
// FillBlanksPanel.pickOption (blankPickWordKey → playWord / stopWord), на ноде БЕЗ поля
// voiceWords (как все уже готовые уроки), с настоящим проигрывателем и пустышкой <audio>
const lib = new Map(['tries', 'trys', 'cooks', 'cook', 'is going'].map(k => [k, { url: `https://audio.test/${k}.mp3` }]))
vi.mock('../../../../shared/lib/wordAudio/wordAudioApi.js', () => ({ cachedWordAudio: () => lib }))
const plays = []
class FakeAudio {
  constructor(src) { this.src = src }
  play() { plays.push(this.src.split('/').pop()); return Promise.resolve() }
  pause() { plays.push('pause') }
  load() {}
}
globalThis.Audio = FakeAudio
const { playWord, stopWord, releaseWordAudio } = await import('../../word-audio/wordAudioPlayer.js')
const { blankPickWordKey } = await import('./fillBlanksVoice.js')
const { collectLessonWords } = await import('../../../../shared/lib/wordAudio/collectLessonWords.js')

// как pickOption в панели
function pick(fbData, picked, index, value) {
  const key = blankPickWordKey({ fbData, picked, index, value })
  if (key) playWord(key); else stopWord()
}

const fbData = { // voiceWords НЕТ — поведение по умолчанию
  template: 'She tr___s ___ cook.',
  blanks: [
    { options: ['ie', 'y', 'ye'], answer: 'ie' },
    { options: ['to', 'is going'], answer: 'to' },
  ],
}

describe('«Составь предложение»: каждый выбранный вариант звучит (озвучка включена по умолчанию)', () => {
  beforeEach(() => { releaseWordAudio(); plays.length = 0 })

  it('верный, неверный и повторный выбор — на каждый тап запускается слово', () => {
    pick(fbData, {}, 0, 'ie')
    expect(plays.filter(p => p !== 'pause')).toEqual(['tries.mp3'])
    pick(fbData, { 0: 'ie' }, 0, 'y')
    expect(plays.filter(p => p !== 'pause')).toEqual(['tries.mp3', 'trys.mp3'])
    pick(fbData, { 0: 'y' }, 0, 'y')
    expect(plays.filter(p => p !== 'pause')).toEqual(['tries.mp3', 'trys.mp3', 'trys.mp3'])
  })

  it('вариант из нескольких слов играет целиком', () => {
    pick(fbData, { 0: 'ie' }, 1, 'is going')
    expect(plays.filter(p => p !== 'pause')).toEqual(['is going.mp3']) // не обрезок «is»
  })

  it('слова нет в базе → предыдущее слово глушится, а не доигрывает поверх', () => {
    pick(fbData, {}, 0, 'ie')
    pick(fbData, {}, 0, 'ye') // «tryes» в тестовой базе нет
    expect(plays).toEqual(['tries.mp3', 'pause'])
  })

  it('явное voiceWords:false — тишина (и прежнее слово глушится)', () => {
    pick({ ...fbData, voiceWords: false }, {}, 0, 'ie')
    expect(plays.filter(p => p !== 'pause')).toEqual([])
  })

  it('каждый вариант каждого пропуска попадает в список «нужна озвучка»/прогрев', () => {
    const wanted = collectLessonWords([{ type: 'fill_blanks', typeData: { fill_blanks: fbData } }])
    for (const [i, b] of fbData.blanks.entries()) {
      for (const v of b.options) {
        const key = blankPickWordKey({ fbData, picked: {}, index: i, value: v })
        expect(key && wanted.has(key), `вариант «${v}» (${key})`).toBe(true)
      }
    }
  })
})

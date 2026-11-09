import { describe, it, expect, vi } from 'vitest'
import { phraseAudioOf, phraseAudioItems, phraseSlotKey, phraseWordKey, playPhraseAudio, wordLeadMs, wordVoiceMs } from './racePhraseAudio.js'
import { phraseAudioMap, phraseAudio } from './plan/racePhraseOf.js'
import { planContext } from './plan/racePhrasePool.js'
import { createPhraseVoice, JOIN_OVERLAP_MS, STEP_GAP_MS } from './racePhraseVoice.js'
import { phraseKey } from '../game2/game2Phrase.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { readRehearsalCfg } from '../rehearsal/rehearsalCfg.js'
import { wordsPlan } from '../player/modules/rotate-phone/wordLaneStart.js'
import { fixtureSource } from '../rehearsal/rehearsalFixtures.js'

// Озвучка фраз целиком (CONCEPT_PHRASES.md → «Озвучка фраз целиком»): запись в word_audio по ключу phrase:<normText> (читают все), план из памяти, прогрев, чтение Пита — целиком или по словам впритык.
const [nice, from] = PHRASE_FIXTURE
const map = new Map([['phrase:nice to meet you', { key: 'phrase:nice to meet you', url: 'r2/nice.mp3', duration: 1.2 }], ['nice', { url: 'w/nice.mp3' }]])

describe('где Пит берёт целую запись фразы', () => {
  it('phrase.audio плана главнее; нет — запись word_audio phrase:<normText>; нет и её — null', () => {
    expect(phraseWordKey(nice)).toBe('phrase:nice to meet you'); expect(phraseWordKey({ text: '...' })).toBeNull()
    expect(phraseAudioOf({ ...nice, audio: { url: 'plan.mp3', duration: 1 } }, map).url).toBe('plan.mp3')
    expect(phraseAudioOf(nice, map)).toEqual({ url: 'r2/nice.mp3', duration: 1.2 })
    expect(phraseAudioOf({ text: 'Nice, to meet you!' }, map)?.url).toBe('r2/nice.mp3') // ключ без знаков и регистра
    expect(phraseAudioOf(from, map)).toBeNull(); expect(phraseAudioOf(nice, null)).toBeNull()
  })
  it('план из памяти находит запись: второй источник word_audio phrase:<key> поверх game2_phrases (rh2_phrase:<key>)', () => {
    const game2 = { [phraseKey(nice.text)]: { url: 'old.mp3', duration: 2 }, [phraseKey(from.text)]: { url: 'g2/from.mp3', duration: 1 } }
    const m = phraseAudioMap(game2, map)
    expect(phraseAudio(m, 'nice to meet you')).toEqual({ url: 'r2/nice.mp3', duration: 1.2 }); expect(phraseAudio(m, 'where are you from').url).toBe('g2/from.mp3')
    expect(phraseAudio(planContext({ audioMap: {}, wordAudio: map }).audioMap, 'nice to meet you').url).toBe('r2/nice.mp3')
    expect(phraseAudioMap(null, null)).toEqual({})
  })
  it('прогрев: только озвученные фразы плана, слот phrase:<ключ>, без повторов', () => {
    const plan = { game: 'race', phrases: [nice, from, { ...nice, id: 'dup' }] }
    expect(phraseAudioItems(plan, map)).toEqual([{ key: 'phrase:nice to meet you', url: 'r2/nice.mp3' }])
    expect(phraseAudioItems(plan, {})).toEqual([])
    expect(phraseSlotKey(nice)).toBe('phrase:nice to meet you')
  })
  it('прогрев игры: целые фразы плана — в cfg.phraseAudio и в фоновой части wordsPlan (late), к этапу фраз', () => {
    const cfg = readRehearsalCfg({ ...fixtureSource('three'), game: 'race', phrases: [{ ...nice, audio: { url: 'r2/nice.mp3', duration: 1.2 } }, from, PHRASE_FIXTURE[2]] })
    expect(cfg.phraseAudio).toEqual([{ key: 'phrase:nice to meet you', url: 'r2/nice.mp3' }])
    const wp = wordsPlan({ cfg, lines: {} })
    expect(wp.late).toContainEqual({ key: 'phrase:nice to meet you', url: 'r2/nice.mp3' }); expect(wp.now.some(x => x.url === 'r2/nice.mp3')).toBe(false)
  })
  it('играет буфером слота, если он прогрет; нет — элементом <audio>', () => {
    const track = vi.fn(), slot = vi.fn(() => true)
    expect(playPhraseAudio(nice, { url: 'u' }, { has: () => true, slot, track })).toBe('buffer'); expect(slot).toHaveBeenCalledWith('phrase:nice to meet you'); expect(track).not.toHaveBeenCalled()
    expect(playPhraseAudio(nice, { url: 'u' }, { has: () => false, slot, track })).toBe('track'); expect(track).toHaveBeenCalledWith('u')
  })
  it('тишина в начале файла слова — из замера прогрева; нет файла или замера — 0', () => {
    const lib = map
    expect(wordLeadMs('Nice', lib, () => ({ lead: 70, ms: 300 }))).toBe(70)
    expect(wordLeadMs('meet', lib, () => ({ lead: 70 }))).toBe(0); expect(wordLeadMs('Nice', lib, () => null)).toBe(0)
    expect(wordVoiceMs('Nice', 1, lib, () => ({ lead: 70, ms: 300 }))).toBe(370); expect(wordVoiceMs('Nice', 2, lib, () => ({ lead: 70, ms: 300 }))).toBe(185) // длина голоса до проигрывания (демо «Скажи»): замер прогрева
    expect(wordVoiceMs('Nice', 1, new Map([['nice', { url: 'w/nice.mp3', duration: 0.62 }]]), () => null)).toBe(620); expect(wordVoiceMs('xyz', 1, lib, () => null)).toBe(0) // нет замера — длина файла; нет озвучки — 0
  })
})

describe('Пит читает фразу (racePhraseVoice)', () => {
  const make = ({ audio = null, lead = () => 40, voiced = 300, hasWord = () => true } = {}) => {
    const said = [], logs = [], timers = [], cat = { busyLeft: () => 0, holdBusy: vi.fn(), onStop: () => () => {} }
    const sayText = (t, op) => { said.push(`${t}${op?.tight ? '/tight' : ''}`); op?.onSay?.(voiced) }
    const v = createPhraseVoice({ ctx: () => ({ sayText, sayLine: id => said.push(`line:${id}`), cat }), hasRu: () => false, audioOf: () => audio, play: (p, a) => said.push(`whole:${a.url}`), lead, hasWord, log: l => logs.push(l),
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => {} })
    const flush = () => { const gaps = []; for (let i = 0; i < 50 && timers.length; i++) { const t = timers.shift(); gaps.push(t.ms); t.fn() } return gaps }
    return { v, said, logs, flush, cat }
  }
  it('есть целая запись — один файл, Пит занят на её длину; журнал «целая запись»', () => {
    const a = make({ audio: { url: 'r2/nice.mp3', duration: 1.2 } })
    a.v.pre({ mode: 'hear', target: nice }, {}); a.flush()
    expect(a.said).toEqual(['whole:r2/nice.mp3']); expect(a.cat.holdBusy).toHaveBeenCalledWith(1200)
    expect(a.logs[0]).toBe('[phrase-voice] фраза «Nice to meet you»: целая запись'); expect(a.logs[1]).toMatch(/^\[mouth\] фраза «Nice to meet you»: огибающая 0 точек/) // буфера нет — рот по буквам на всю длину
  })
  it('нет записи — по словам впритык: следующее слово через голос прежнего минус тишина в начале своего файла, без STEP_GAP_MS; журнал «по словам (N)»', () => {
    const a = make()
    a.v.pre({ mode: 'hear', target: nice }, {}); const gaps = a.flush()
    expect(a.said).toEqual(['Nice/tight', 'to/tight', 'meet/tight', 'you/tight'])
    expect(gaps.slice(0, 3)).toEqual([260, 260, 260]); expect(gaps[3]).toBe(STEP_GAP_MS) // после последнего слова — обычный зазор цепочки
    expect(a.logs).toEqual(['[phrase-voice] фраза «Nice to meet you»: по словам (4)'])
  })
  it('слово без озвучки в библиотеке — строка журнала «слово … без озвучки» (чтение по словам не виснет: цепочка идёт по длине из onSay)', () => {
    const a = make({ hasWord: w => w !== 'meet' })
    a.v.pre({ mode: 'hear', target: nice }, {}); a.flush()
    expect(a.said).toEqual(['Nice/tight', 'to/tight', 'meet/tight', 'you/tight'])
    expect(a.logs).toEqual(['[phrase-voice] фраза «Nice to meet you»: по словам (4)', '[phrase-voice] слово «meet» без озвучки (нет в библиотеке слов) — не прозвучит'])
  })
  it('нахлёст ограничен JOIN_OVERLAP_MS (длинная тишина в начале файла не съедает конец прежнего слова)', () => {
    const a = make({ lead: () => 400 })
    a.v.pre({ mode: 'hear', target: nice }, {}); expect(a.flush()[0]).toBe(300 - JOIN_OVERLAP_MS)
  })
})

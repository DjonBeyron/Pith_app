import { describe, it, expect } from 'vitest'
import { voiceWrong, LOUD_PEAK, SOFT_VOICE_MS } from './racePhraseVoiceWrong.js'
import { createSayView } from './racePhraseSayView.js'
import { createWrongWord, VOICE_SOFT } from './racePhraseWrongWord.js'
import { mountMask } from './racePhraseMaskView.js'
import { PEAK_MIN } from './racePhraseDraftHold.js'
import { rig, flush } from './racePhraseListenRig.js'

// Стражи v3.3.401 (владелец iPhone: «первое слово неверное, говорю очень громко — визуально ничего»). Громкий голос, а Vosk не вернул ни одного слова цели (итог пуст / «[unk]»), на ПЕРВОМ слове —
// мягкое красное (слово без рывка). Шум, эхо, тихий и короткий голос, дыхание, верное слово — без красного. Журнал 11:43 (v3.3.398) таких заходов не содержал: пустые итоги пилюль — пик ≤ 0,009.
const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
const base = { kind: 'final', wordByWord: false, text: '', breath: false, progressed: false, anySaid: false, noise: false, voiced: true, peak: 0.05, voiceMs: 900 }

describe('voiceWrong: условия мягкого красного', () => {
  it('проход 2, пустой итог, громко и долго, слов в попытке нет — мягкое красное', () => {
    expect(voiceWrong(base)).toEqual({ why: 'voice-soft', soft: true, peak: 0.05 })
    expect(voiceWrong({ ...base, voiceMs: null })).toMatchObject({ soft: true }) // длина неизвестна — защищает пик
  })
  it('шум / эхо / тихо / коротко / не голос / дыхание / не первое слово / итог со словами / черновик — красного нет', () => {
    for (const patch of [{ noise: true }, { peak: 0.011 }, { peak: LOUD_PEAK - 0.001 }, { voiceMs: SOFT_VOICE_MS - 1 }, { voiced: false }, { breath: true }, { anySaid: true }, { progressed: true }, { text: 'to' }, { kind: 'partial' }])
      expect(voiceWrong({ ...base, ...patch })).toBe(null)
  })
  it('проход 1: прежнее жёсткое правило без изменений (пик ≥ PEAK_MIN, не шум, не выдох, нового слова нет), мягкого там нет', () => {
    expect(voiceWrong({ ...base, wordByWord: true, peak: PEAK_MIN })).toEqual({ why: 'voice', peak: PEAK_MIN })
    expect(voiceWrong({ ...base, wordByWord: true, peak: PEAK_MIN - 0.001 })).toBe(null)
    expect(voiceWrong({ ...base, wordByWord: true, breath: true })).toBe(null) // «выдох» (v3.3.318) — красного нет и громко
    expect(voiceWrong({ ...base, wordByWord: true, noise: true })).toBe(null)
  })
})

describe('слушатель, проход 2: громкое неверное первое слово как «[unk]» / пустой итог', () => {
  const loud = r => { r.cur().cb.onLevel(0.001); r.cur().cb.onLevel(0.001); r.cur().cb.onLevel(0.001); r.cur().cb.onLevel(0.08); r.cur().cb.onLevel(0.09) }
  it('итог «[unk]» при громком голосе: kind wrong, soft', async () => {
    const r = rig([FROM]); await flush(); loud(r)
    r.cur().cb.onPartial('[unk]'); r.advance(500); r.cur().cb.onResult('[unk]', { words: [], voiceMs: 800 }); r.advance(10); await flush()
    expect(r.hears.filter(h => h.kind === 'wrong')).toMatchObject([{ why: 'voice-soft', soft: true }])
    expect(r.got).toEqual([]) // зачёта нет — только вид
    r.l.stop()
  })
  it('пустой итог при громком голосе — тоже; тот же заход ещё раз — красное один раз на итог', async () => {
    const r = rig([FROM]); await flush(); loud(r)
    r.cur().cb.onResult('', { words: [], voiceMs: 700 }); r.advance(10); await flush()
    expect(r.hears.filter(h => h.kind === 'wrong').length).toBe(1)
    r.l.stop()
  })
  it('шум (фон 0,003, без голоса), короткий звук, тихий голос, верное слово — красного нет', async () => {
    const quiet = rig([FROM]); await flush()
    for (const v of [0.003, 0.003, 0.003, 0.004, 0.005]) quiet.cur().cb.onLevel(v)
    quiet.cur().cb.onResult('[unk]', { words: [], voiceMs: 900 }); quiet.advance(10); await flush()
    const short = rig([FROM]); await flush(); loud(short)
    short.cur().cb.onResult('[unk]', { words: [], voiceMs: 200 }); short.advance(10); await flush()
    const ok = rig([FROM]); await flush(); loud(ok)
    ok.cur().cb.onPartial('where'); ok.cur().cb.onResult('where', { words: [], voiceMs: 900 }); ok.advance(10); await flush()
    for (const x of [quiet, short, ok]) { expect(x.hears.some(h => h.kind === 'wrong')).toBe(false); x.l.stop() }
  })
  it('не первое слово (слово «where» уже принято): мягкого красного нет', async () => {
    const r = rig([FROM]); await flush(); loud(r)
    r.cur().cb.onPartial('where'); r.advance(100)
    r.cur().cb.onResult('', { words: [], voiceMs: 900 }); r.advance(10); await flush()
    expect(r.hears.some(h => h.kind === 'wrong')).toBe(false); r.l.stop()
  })
})

describe('вид: мягкое красное — слово красное, рывка нет, неверным словом не считается', () => {
  it('createWrongWord: soft попадает в подпись (shown), но не в рывок (check → null)', () => {
    const w = createWrongWord({ words: FROM.words }); w.ear({ kind: 'wrong', why: 'voice-soft', soft: true })
    expect(w.check(new Map(), 0)).toBe(null); expect(w.shown()).toBe(VOICE_SOFT)
  })
  it('SayView: красим первое слово, onWrong и рывок не зовутся; обычное «wrong» — как раньше (рывок есть)', () => {
    const run = ev => {
      const logs = [], fired = [], wrongs = []
      const mask = mountMask({}, 'Where are you from')
      const sv = createSayView({ pass: 1, text: 'Where are you from', n: 4, mask, log: s => logs.push(s), nudge: () => fired.push(1), el: {}, onWrong: w => wrongs.push(w) })
      sv.ear(ev); sv.frame(10, false, 0)
      return { logs, wrongs, red: mask.words()[0].state === 'miss' }
    }
    const soft = run({ kind: 'wrong', soft: true }), hard = run({ kind: 'wrong' })
    expect(soft.red).toBe(true); expect(soft.wrongs).toEqual([]); expect(soft.logs.some(s => /рывок/.test(s))).toBe(false)
    expect(hard.red).toBe(true); expect(hard.wrongs.length).toBe(1); expect(hard.logs.some(s => /рывок/.test(s))).toBe(true)
  })
})

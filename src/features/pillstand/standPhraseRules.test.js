import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STAND_PHRASES, STAND_MIX } from './pillStandData.js'
import { phraseTokens } from '../pitrace/racePhraseData.js'
import { rig, flush } from '../pitrace/racePhraseListenRig.js'
import { sameWord } from '../pitrace/racePhraseWrongWord.js'
import { TAIL_HOLD_MS } from '../pitrace/racePhraseTailHold.js'
import { UNK_FINAL_MS } from '../pitrace/racePhraseListen.js'

// ОДИН БОЛЬШОЙ ТЕСТ правил «Скажи», проход 1 (правила владельца 2026-11-20…21, v3.3.314–322): каждое правило проверяется на КАЖДОЙ фразе стенда — и подборки из 24 фраз (STAND_MIX), и всех остальных
// (STAND_PHRASES), на настоящем слушателе игры с настройками игры (holdFirst включён). Правило, которое работает на «Where are you from», обязано работать на любой фразе: длинной, из двух слов, с сокращениями.
// Подставной Vosk: черновик (onPartial), итог захода (onResult), громкость (onLevel). Упал — в имени теста фраза и правило.
const all = [...new Set([...STAND_MIX, ...STAND_PHRASES.map(p => p.en)])].map(en => ({ en, words: phraseTokens(en), mix: STAND_MIX.includes(en) }))
const mk = async p => { const r = rig([{ key: p.en, words: p.words }], { wordByWord: true, holdFirst: true }); await flush(); return r }
const voice = r => { for (const v of [0.002, 0.15, 0.17, 0.05, 0.002]) r.cur().cb.onLevel(v) } // фон, слово, фон
const final = async (r, text, stats = {}) => { r.cur().cb.onResult(text, { words: [], ...stats }); r.advance(10); await flush() }
const alive = r => { const s = new Set(); for (const w of r.words) { if (w.gone) s.delete(w.index); else s.add(w.index) } return [...s].sort((a, b) => a - b) } // слова, засчитанные сейчас (с учётом откатов)
const sure = r => [...new Set(r.words.filter(w => !w.draft && !w.gone).map(w => w.index))].sort((a, b) => a - b) // подтверждённые
const upTo = n => Array.from({ length: n }, (_, i) => i)
/** Сказать слова 0…n-1 честно: черновик, пауза, итог захода */
const say = async (r, p, n) => { for (let i = 0; i < n; i++) { voice(r); r.cur().cb.onPartial(p.words[i]); r.advance(TAIL_HOLD_MS + 100); await final(r, p.words[i]) } }
const differ = (a, b) => !sameWord(a, b) && !sameWord(b, a)

describe('стенд: в подборке 24 фразы, все есть среди фраз стенда, у каждой ≥ 2 слов', () => {
  it('состав', () => {
    expect(STAND_MIX).toHaveLength(24)
    for (const en of STAND_MIX) expect(STAND_PHRASES.some(p => p.en === en), en).toBe(true)
    for (const p of all) expect(p.words.length, p.en).toBeGreaterThanOrEqual(2)
  })
})

describe('правила включены везде: игра и все пресеты стенда берут один слушатель с настройками по умолчанию', () => {
  it('ни сцена фраз, ни стенд не выключают «слово только по итогу захода» (holdFirst) и не подменяют слушатель', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    for (const dir of ['pitrace', 'pillstand']) for (const f of readdirSync(join(root, dir)).filter(x => /\.jsx?$/.test(x) && !/\.test\.|Rig\.js$|Stub\.js$/.test(x))) {
      const src = readFileSync(join(root, dir, f), 'utf8')
      expect(/holdFirst\s*:\s*false/.test(src), `${dir}/${f} выключает правило`).toBe(false)
    }
    expect(readFileSync(join(root, 'pitrace/racePhraseListen.js'), 'utf8')).toContain('holdFirst = true')
  })
})

describe.each(all)('«$en»', p => {
  const n = p.words.length, last = n - 1

  it('1. верная фраза по словам: каждое слово засчитано по итогу захода и по порядку; линия не уходит вперёд; последнее слово закрывает фразу чисто', async () => {
    const r = await mk(p)
    for (let i = 0; i < n; i++) {
      voice(r); r.cur().cb.onPartial(p.words[i])
      expect(alive(r), `черновик «${p.words[i]}» слово не двигает`).toEqual(upTo(i)); expect(r.got).toEqual([])
      r.advance(TAIL_HOLD_MS + 100); expect(r.cur().stopped, 'слушатель сам просит итог').toBeGreaterThan(0)
      await final(r, p.words[i])
      if (i < last) expect(sure(r)).toEqual(upTo(i + 1))
    }
    expect(r.got.map(g => [g.phraseKey, g.ratio])).toEqual([[p.en, 1]])
    r.l.stop()
  })

  it('2. первое слово само не засчитывается: шум комнаты, щелчок («[unk]» в итоге), выдох (пустой итог после 2,6 с звука), тишина', async () => {
    const noise = await mk(p)
    for (const v of [0.0069, 0.007, 0.0089, 0.0091, 0.0107, 0.0112]) noise.cur().cb.onLevel(v)
    noise.cur().cb.onPartial(p.words[0]); noise.advance(1000); await final(noise, p.words[0])
    expect(alive(noise), 'шум').toEqual([]); expect(noise.hears.some(h => h.kind === 'wrong'), 'шум — не неверное слово').toBe(false)
    const click = await mk(p)
    voice(click); click.cur().cb.onPartial(p.words[0]); click.advance(TAIL_HOLD_MS + 100); await final(click, '[unk]')
    expect(alive(click), 'щелчок').toEqual([])
    const breath = await mk(p)
    voice(breath); breath.cur().cb.onPartial(p.words[0]); breath.advance(3500); await final(breath, '', { voiceMs: 2603 })
    expect(alive(breath), 'выдох').toEqual([]); expect(breath.hears.some(h => h.kind === 'wrong'), 'выдох — не неверное слово').toBe(false)
    const quiet = await mk(p)
    quiet.advance(20000); expect(alive(quiet), 'тишина').toEqual([]); expect(quiet.got).toEqual([])
    noise.l.stop(); click.l.stop(); breath.l.stop(); quiet.l.stop()
  })

  it('3. неверное слово на любом месте: Vosk в черновике подставил ожидаемое слово, итог — «[unk]» → слово не засчитано, слух шлёт «неверное слово»; потом верное — засчитано', async () => {
    for (let k = 0; k < n; k++) {
      const r = await mk(p); await say(r, p, k)
      voice(r); r.cur().cb.onPartial(p.words[k]); r.advance(TAIL_HOLD_MS + 100); await final(r, '[unk]')
      expect(alive(r), `место ${k + 1}: чужое слово`).toEqual(upTo(k)); expect(r.got, `место ${k + 1}`).toEqual([])
      expect(r.hears.some(h => h.kind === 'wrong'), `место ${k + 1}: красное`).toBe(true)
      await say(r, { ...p, words: p.words.slice(k) }, 1) // теперь верное слово
      if (k < last) expect(sure(r), `место ${k + 1}: верное после неверного`).toEqual(upTo(k + 1)); else expect(r.got.map(g => g.ratio)).toEqual([1])
      r.l.stop()
    }
  })

  it('4. хоть сто раз неверно — линия стоит; слово «вперёд», сказанное после неверного, не запоминается: его надо сказать заново', async () => {
    if (n < 3) return
    for (let k = 0; k + 2 < n; k++) {
      if (!differ(p.words[k + 1], p.words[k + 2]) || !differ(p.words[k], p.words[k + 2])) continue
      const r = await mk(p); await say(r, p, k + 1)
      for (let t = 0; t < 5; t++) { voice(r); r.cur().cb.onPartial(`[unk] ${p.words[k + 2]}`); r.advance(UNK_FINAL_MS + 50); await final(r, `[unk] ${p.words[k + 2]}`) } // неверное + слово через одно, пять раз
      expect(alive(r), `после ${k + 1} слов`).toEqual(upTo(k + 1))
      await say(r, { ...p, words: p.words.slice(k + 1) }, 1) // сказано ожидаемое — засчитано только оно
      expect(alive(r), `после ожидаемого слова ${k + 2}`).toEqual(upTo(k + 2)); expect(r.got).toEqual([])
      r.l.stop()
    }
  })

  it('5. одним заходом «верное + неверное + дальше» — засчитано только слово до неверного', async () => {
    if (n < 3) return
    const r = await mk(p)
    voice(r); const text = `${p.words[0]} [unk] ${p.words.slice(2).join(' ')}`
    r.cur().cb.onPartial(text); r.advance(UNK_FINAL_MS + 50); await final(r, text)
    expect(alive(r)).toEqual([0]); expect(r.got).toEqual([])
    r.l.stop()
  })

  it('6. топтание на слове («to to to» Vosk слышит как «to the to»): слово, за которым идёт повтор прошлого, не засчитывается — линия не перескакивает', async () => {
    for (let k = 0; k + 1 < n; k++) {
      const a = p.words[k], b = p.words[k + 1], c = p.words[k + 2]
      if (!differ(a, b) || (c && !differ(a, c)) || p.words.slice(0, k).some(w => !differ(w, a))) continue
      const r = await mk(p); await say(r, p, k)
      voice(r); r.cur().cb.onPartial(`${a} ${b} ${a} ${a}`); r.advance(TAIL_HOLD_MS + 100); await final(r, `${a} ${b} ${a} ${a}`)
      expect(alive(r), `«${a} ${b} ${a} ${a}»`).toEqual(upTo(k + 1))
      r.l.stop()
    }
  })

  it('7. последнее слово: черновик фразу не закрывает (Vosk предсказывает); итог «[unk]» — не закрывает; итог с верным словом — закрывает', async () => {
    const r = await mk(p); await say(r, p, last)
    voice(r); r.cur().cb.onPartial(p.words[last]); r.advance(5000)
    expect(r.got, 'по черновику').toEqual([]); expect(alive(r)).toEqual(upTo(last))
    await final(r, '[unk]'); expect(r.got, 'итог «[unk]»').toEqual([])
    voice(r); r.cur().cb.onPartial(p.words[last]); r.advance(TAIL_HOLD_MS + 100); await final(r, p.words[last])
    expect(r.got.map(g => g.ratio)).toEqual([1])
    r.l.stop()
  })

  it('8. слитная речь: слова идут одним заходом — каждое принимается, когда за ним появилось следующее, заход не рвётся; фразу закрывает итог', async () => {
    const r = await mk(p)
    for (let i = 0; i < n; i++) {
      r.cur().cb.onLevel(0.002); r.cur().cb.onLevel(0.16) // голос идёт без пауз
      r.cur().cb.onPartial(p.words.slice(0, i + 1).join(' ')); r.advance(150)
      expect(alive(r), `черновик из ${i + 1} слов`).toEqual(upTo(i))
      if (i < last) expect(r.cur().stopped, 'заход не рвём, пока говорят').toBe(0)
    }
    r.advance(TAIL_HOLD_MS + 200); await final(r, p.words.join(' '))
    expect(r.got.map(g => g.ratio)).toEqual([1])
    r.l.stop()
  })
})

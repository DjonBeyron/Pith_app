import { describe, it, expect } from 'vitest'
import { strictHits, orderedHits } from './racePhraseScore.js'
import { rig, flush, P } from './racePhraseListenRig.js'
import { createWrongWord } from './racePhraseWrongWord.js'

// Журнал владельца 2026-11-26 09:26:42–09:26:45 (v3.3.371, iPhone, игра, «Скажи», проход 1 «по слову», цель «I'm trying to learn»). Комментарий: «фраза засчиталась очень странно: вначале остановилась на втором слове,
// я начал повторять второе слово, и потом она засчиталась полностью». В журнале: черновик «am» → «am trying» (+476 мс, принято слово 1) → «am trying to learn» (+979 мс: НИ ОДНОГО нового слова, «[fill] сказано «to»:
// «trying» красным») → через 1,8 с черновик «am trying to learn trying» (слово 1 продержалось 1 с — подтверждено, фраза 100 %). Кадры ровные (fps 60, худший 17 мс), Vosk услышал всю фразу за секунду.
// Причина — строгая цепочка (strictHits): «I'm» — два токена («i am»); сначала примерялись ОБА токена услышанного, а «am trying» подходит «I'm» по опорной части «am» — слово съедало и «trying», и ожидаемого
// «trying» в услышанном уже не было. После подтверждения слова 1 (base = 1) цепочка шла со второго слова — потому повтор «trying» и «засчитал всё разом».
const W = P.learn.words
const bits = (heard, base = 0, open = false) => strictHits(W, heard, base, open).map(Number).join('')

describe('«I\'m», услышанное как «am», занимает одно слово услышанного', () => {
  it('strictHits: «am trying», «am trying to learn» — слова по порядку; полное «i am …» и «i\'m …» — как раньше', () => {
    expect(bits('am')).toBe('1000')
    expect(bits('am trying')).toBe('1100')
    expect(bits('am trying to')).toBe('1110')
    expect(bits('am trying to learn')).toBe('1111')
    expect(bits('i am trying to learn')).toBe('1111'); expect(bits("i'm trying to learn")).toBe('1111'); expect(bits('im trying to')).toBe('1110')
    expect(bits('i trying')).toBe('0000') // одно «i» — не «I'm» (опорная часть — «am»): цепочка не начата
    expect(bits('trying to learn', 1)).toBe('1111') // слово 1 подтверждено — как было
    expect(orderedHits(W, 'am trying to learn').map(Number).join('')).toBe('1111') // проход 2 считал верно и раньше
  })
  it('слушатель, как в журнале: «am» → «am trying» → «am trying to learn» — слова 2 и 3 приняты этим же черновиком, последнее ждёт итог, итог закрывает фразу', async () => {
    const r = rig([P.learn], { wordByWord: true, holdFirst: true }); await flush()
    const alive = () => { const a = new Set(); for (const w of r.words) { if (w.gone) a.delete(w.index); else a.add(w.index) } return [...a].sort() }
    r.cur().cb.onPartial('am'); expect(alive()).toEqual([]) // слово хвостом черновика — только итогом (правило v3.3.322)
    r.advance(476); r.cur().cb.onPartial('am trying'); expect(alive()).toEqual([0])
    r.advance(503); r.cur().cb.onPartial('am trying to learn'); expect(alive()).toEqual([0, 1, 2]); expect(r.got).toEqual([]) // было: [0] — «trying» и «to» терялись
    r.cur().cb.onResult('am trying to learn', { words: [] })
    expect(r.got.map(g => g.ratio)).toEqual([1]); expect(alive()).toEqual([0, 1, 2, 3])
    r.l.stop()
  })
  it('красного «trying» больше нет: к кадру проверки слова 1–3 уже сказаны, «to» — слово этого же захода', () => {
    const w = createWrongWord({ words: W })
    w.ear({ kind: 'partial', text: 'am trying' }); expect(w.check(new Map([[0, true]]), 0)).toBeNull(); expect(w.shown()).toBeNull()
    w.ear({ kind: 'partial', text: 'am trying to learn' }); expect(w.check(new Map([[0, true], [1, true], [2, true]]), 500)).toBeNull(); expect(w.shown()).toBeNull()
    const old = createWrongWord({ words: W }) // как было в журнале: сказано только слово 1 — «to» читалось как неверное вместо «trying»
    old.ear({ kind: 'partial', text: 'am trying' }); old.check(new Map([[0, true]]), 0)
    old.ear({ kind: 'partial', text: 'am trying to learn' }); old.check(new Map([[0, true]]), 500); expect(old.shown()).toBe('to')
  })
})

// v3.3.373 — владелец: «нужно, чтобы и подобные фразы типа I'm или he's не вызывали проблем». Все сокращения «местоимение + глагол»: Vosk может отдать один глагол («is» за «he's»),
// слитную форму («he's»), раздельную («he is») или форму без апострофа («hes») — во всех случаях цепочка прохода 1 идёт дальше и следующее слово не съедается.
describe('сокращения «местоимение + глагол» в строгой цепочке прохода 1', () => {
  const CASES = [
    ["He's trying to learn", ['is', 'he is', "he's", 'hes']],
    ["She's my best friend", ['is', 'she is', "she's", 'shes']],
    ["You're trying to learn", ['are', 'you are', "you're", 'youre']],
    ["We're going home now", ['are', 'we are', "we're"]],
    ["They're very good friends", ['are', 'they are', "they're", 'theyre']],
    ["It's nice to meet", ['is', 'it is', "it's", 'its']],
    ["That's what I want", ['is', 'that is', "that's", 'thats']],
    ["What's your name please", ['is', 'what is', "what's", 'whats']],
    ["I've been there before", ['have', 'i have', "i've", 'ive']],
    ["I'll call you later", ['will', 'i will', "i'll"]],
    ["I'd like some tea", ['would', 'i would', "i'd"]],
    ["I'm trying to learn", ['am', 'i am', "i'm", 'im']],
  ]
  for (const [phrase, heads] of CASES) {
    const words = phrase.split(' '), rest = words.slice(1).join(' ').toLowerCase()
    it(`«${phrase}»: первое слово в любой записи — вся фраза по порядку, слова не съедаются`, () => {
      for (const h of heads) {
        expect(strictHits(words, `${h} ${rest}`), `услышано «${h} ${rest}»`).toEqual(words.map(() => true))
        expect(strictHits(words, `${h} ${words[1].toLowerCase()}`), `услышано «${h} ${words[1]}»`).toEqual(words.map((_, i) => i < 2))
        expect(orderedHits(words, `${h} ${rest}`), `по порядку «${h} ${rest}»`).toEqual(words.map(() => true))
      }
    })
  }
  it('одно местоимение сокращение не зажигает (иначе глагол в «he is» остался бы лишним словом); отрицания по половине не засчитываются', () => {
    expect(strictHits(["He's", 'trying'], 'he')).toEqual([false, false])
    expect(strictHits(["He's", 'trying'], 'he is trying')).toEqual([true, true])
    expect(strictHits(["Don't", 'worry'], 'do worry')).toEqual([false, false])
    expect(strictHits(["Don't", 'worry'], 'dont worry')).toEqual([true, true])
    expect(strictHits(["Don't", 'worry'], 'do not worry')).toEqual([true, true])
  })
  it('сокращение в середине фразы: «I think he is right», услышанное с одним глаголом и полностью', () => {
    const w = ['I', 'think', "he's", 'right']
    expect(strictHits(w, 'i think is right')).toEqual([true, true, true, true])
    expect(strictHits(w, 'i think he is right')).toEqual([true, true, true, true])
    expect(strictHits(w, "i think he's right")).toEqual([true, true, true, true])
  })
})

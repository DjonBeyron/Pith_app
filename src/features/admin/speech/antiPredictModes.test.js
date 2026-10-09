import { describe, it, expect } from 'vitest'
import {
  AP_KEY, DEFAULT_SETTINGS, MAX_ALTS, BOOST, sanitizeSettings, readSettings, writeSettings, detectFeatures, modeSupported,
  effectiveSettings, activeModes, wrongFormsOfWord, generateWrongForms, keyWordsOf, parseWrongList, buildJsgf, buildVoskGrammar,
  configureRecognition,
} from './antiPredictModes.js'

function memStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
const broken = () => ({ getItem() { throw new Error('x') }, setItem() { throw new Error('x') } })

class Rec { constructor() { this.lang = 'en-US'; this.maxAlternatives = 3; this.continuous = false } }
const full = () => {
  class P { constructor(phrase, boost) { this.phrase = phrase; this.boost = boost } }
  class G { constructor() { this.items = [] } get length() { return this.items.length } addFromString(s, w) { this.items.push({ s, w }) } }
  // как в Chrome: атрибуты IDL — аксессоры на прототипе (feature-detect смотрит именно туда)
  class R extends Rec {
    constructor() { super(); this._pl = false; this._ph = []; this._gr = new G() }
    get processLocally() { return this._pl }
    set processLocally(v) { this._pl = v }
    get phrases() { return this._ph }
    set phrases(v) { this._ph = v }
    get grammars() { return this._gr }
    set grammars(v) { this._gr = v }
  }
  R.available = async () => 'available'
  R.install = async () => true
  return { SpeechRecognition: R, SpeechRecognitionPhrase: P, SpeechGrammarList: G, R }
}

describe('настройки', () => {
  it('по умолчанию всё выключено; мусор и чужой язык отбрасываются', () => {
    expect(readSettings(memStore())).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(memStore({ [AP_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(broken())).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ lang: 'fr-FR', alts: 'yes', words: true })).toEqual({ ...DEFAULT_SETTINGS, words: true })
  })
  it('запись и чтение; ошибка хранилища не роняет', () => {
    const s = memStore()
    writeSettings({ ...DEFAULT_SETTINGS, lang: 'en-GB', alts: true }, s)
    expect(readSettings(s)).toMatchObject({ lang: 'en-GB', alts: true, history: false })
    expect(() => writeSettings(DEFAULT_SETTINGS, broken())).not.toThrow()
  })
})

describe('feature-detect', () => {
  it('нет распознавания — ничего не поддерживается', () => {
    const f = detectFeatures({})
    expect(f.recognition).toBe(false)
    expect(modeSupported('alts', f)).toBe(false)
  })
  it('iPhone-подобный браузер: распознавание есть, а processLocally / phrases / grammar — нет', () => {
    const f = detectFeatures({ webkitSpeechRecognition: Rec })
    expect(f).toMatchObject({ recognition: true, local: false, phrases: false, grammar: false, localInstall: false })
    expect(['lang', 'alts', 'history', 'words'].every(id => modeSupported(id, f))).toBe(true)
    expect(['local', 'phrases', 'grammar'].some(id => modeSupported(id, f))).toBe(false)
  })
  it('Chrome 142+: всё есть, включая available/install', () => {
    const w = full()
    const f = detectFeatures(w)
    expect(f).toMatchObject({ recognition: true, local: true, localAvailable: true, localInstall: true, phrases: true, grammar: true })
  })
  it('режимы, которых на устройстве нет, отбрасываются из настроек и списка активных', () => {
    const f = detectFeatures({ webkitSpeechRecognition: Rec })
    const s = { ...DEFAULT_SETTINGS, lang: 'en-GB', alts: true, local: true, phrases: true }
    expect(effectiveSettings(s, f)).toMatchObject({ lang: 'en-GB', alts: true, local: false, phrases: false })
    expect(activeModes(s, f)).toEqual(['lang:en-GB', 'alts'])
    expect(activeModes(DEFAULT_SETTINGS, f, true)).toEqual(['oneword'])
    expect(activeModes(DEFAULT_SETTINGS, f)).toEqual([])
  })
})

describe('ошибочные формы', () => {
  it('таблица и суффиксы', () => {
    expect(wrongFormsOfWord('trying')).toEqual(['try', 'tried', 'tries'])
    expect(wrongFormsOfWord('Going,')).toEqual(['go', 'goes', 'went'])
    expect(wrongFormsOfWord('am')).toEqual(['is', 'are'])
    expect(wrongFormsOfWord('has')).toEqual(['have'])
    expect(wrongFormsOfWord('playing')).toEqual(['play'])
    expect(wrongFormsOfWord('running')).toEqual(['run'])
    expect(wrongFormsOfWord('wanted')).toEqual(['want'])
    expect(wrongFormsOfWord('shells')).toEqual(['shell'])
    expect(wrongFormsOfWord('this')).toEqual([])
    expect(wrongFormsOfWord('station')).toEqual([])
    expect(wrongFormsOfWord('to')).toEqual([])
  })
  it("«I'm trying» → фразы с подменой одного слова", () => {
    expect(generateWrongForms("I'm trying")).toEqual(["I'm try", "I'm tried", "I'm tries"])
    expect(generateWrongForms('I am trying to please both')).toEqual([
      'I is trying to please both', 'I are trying to please both',
      'I am try to please both', 'I am tried to please both', 'I am tries to please both',
    ])
    expect(generateWrongForms('hello world')).toEqual([])
    expect(generateWrongForms("I'm trying.")[0]).toBe("I'm try.")
    expect(generateWrongForms('She has apples', 1)).toEqual(['She have apples'])
  })
  it('ключевые слова и разбор поля', () => {
    expect(keyWordsOf("I'm trying")).toEqual(['trying'])
    expect(keyWordsOf('I am trying to try')).toEqual(['am', 'trying'])
    expect(parseWrongList("I'm try, I'm tried;\n i'm TRY ,, I'm trying", "I'm trying")).toEqual(["I'm try", "I'm tried", 'i\'m TRY'])
    expect(parseWrongList('', 'x')).toEqual([])
  })
})

describe('грамматики', () => {
  it('JSGF из эталона и ошибочных форм', () => {
    expect(buildJsgf("I'm trying", ["I'm try", "I'm tried"])).toBe("#JSGF V1.0; grammar g; public <p> = i'm trying | i'm try | i'm tried;")
    expect(buildJsgf('Hello, World!', [])).toBe('#JSGF V1.0; grammar g; public <p> = hello world;')
  })
  it('словарь Vosk: сокращённая и полная формы, без дублей, [unk] в конце', () => {
    expect(JSON.parse(buildVoskGrammar("I'm trying", ["I'm try"]))).toEqual(["i'm trying", 'i am trying', "i'm try", 'i am try', '[unk]'])
    expect(JSON.parse(buildVoskGrammar('go home', []))).toEqual(['go home', '[unk]'])
  })
})

describe('configureRecognition: свойства распознавателя по режимам', () => {
  const wrong = ["I'm try", "I'm tried"]
  const cfg = (rec, settings, w = full()) => configureRecognition(rec, { reference: "I'm trying", lang: 'en-US', extra: { settings: { ...DEFAULT_SETTINGS, ...settings }, wrong } }, w)

  it('без режимов не меняет ничего (поведение пробы прежнее)', () => {
    const w = full()
    const rec = new w.R()
    const info = cfg(rec, {}, w)
    expect(rec).toMatchObject({ lang: 'en-US', maxAlternatives: 3, continuous: false, processLocally: false })
    expect(rec.phrases).toEqual([])
    expect(info).toMatchObject({ lang: 'en-US', maxAlternatives: 3, continuous: false, processLocally: false, phrases: 0, grammars: 0, skipped: [] })
  })
  it('1 язык, 2 альтернативы, 5 continuous', () => {
    const w = full()
    const rec = new w.R()
    const info = cfg(rec, { lang: 'en-AU', alts: true, words: true }, w)
    expect(rec).toMatchObject({ lang: 'en-AU', maxAlternatives: MAX_ALTS, continuous: true })
    expect(info).toMatchObject({ lang: 'en-AU', maxAlternatives: 10, continuous: true })
  })
  it('6 processLocally', () => {
    const w = full()
    const rec = new w.R()
    expect(cfg(rec, { local: true }, w).processLocally).toBe(true)
    expect(rec.processLocally).toBe(true)
  })
  it('7 phrases: верная и ошибочные фразы с одинаковым boost', () => {
    const w = full()
    const rec = new w.R()
    const info = cfg(rec, { phrases: true }, w)
    expect(rec.phrases.map(p => [p.phrase, p.boost])).toEqual([["I'm trying", BOOST], ["I'm try", BOOST], ["I'm tried", BOOST]])
    expect(info.phrases).toBe(3)
  })
  it('8 grammars: JSGF добавлен с весом 1', () => {
    const w = full()
    const rec = new w.R()
    const info = cfg(rec, { grammar: true }, w)
    expect(rec.grammars.items).toEqual([{ s: "#JSGF V1.0; grammar g; public <p> = i'm trying | i'm try | i'm tried;", w: 1 }])
    expect(info.grammars).toBe(1)
  })
  it('комбинация режимов применяется вместе', () => {
    const w = full()
    const rec = new w.R()
    cfg(rec, { lang: 'en-GB', alts: true, words: true, local: true, phrases: true, grammar: true }, w)
    expect(rec).toMatchObject({ lang: 'en-GB', maxAlternatives: 10, continuous: true, processLocally: true })
    expect(rec.phrases).toHaveLength(3)
    expect(rec.grammars.length).toBe(1)
  })
  it('нет API на устройстве: ошибка попадает в skipped, остальное применяется', () => {
    const rec = new Rec()
    const info = configureRecognition(rec, { reference: 'x', extra: { settings: { ...DEFAULT_SETTINGS, alts: true, phrases: true, grammar: true } } }, {})
    expect(rec.maxAlternatives).toBe(10)
    expect(info.skipped).toHaveLength(2)
    expect(info).toMatchObject({ processLocally: null, phrases: null, grammars: null })
  })
  it('phrases: присваивание недоступно → добавляем через push', () => {
    const w = full()
    const rec = new w.R()
    const arr = []
    Object.defineProperty(rec, 'phrases', { get: () => arr, set() { throw new Error('read-only') } })
    cfg(rec, { phrases: true }, w)
    expect(arr).toHaveLength(3)
  })
  it('без extra (хук вызван без снимка) — ничего не меняет', () => {
    const rec = new Rec()
    expect(() => configureRecognition(rec, { reference: 'x' }, {})).not.toThrow()
    expect(rec.maxAlternatives).toBe(3)
  })
})

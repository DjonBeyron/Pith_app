import { describe, it, expect } from 'vitest'
import { tokenizeRu, normTextRu, phraseFormsRu } from '../../../../shared/lib/speech/speechMatchRu.js'
import { analyzeTargets, targetGrammar } from './wordLaneMatch.js'
import { createWordListener, MODEL_WAIT_MS } from './wordLaneListen.js'
import { runtimeOf, voskRuntimeRu } from '../../../../shared/lib/vosk/voskRuntimes.js'
import { voskRuntime } from '../../../../shared/lib/vosk/voskRuntime.js'
import { modelUrlOf, readRuModelUrl, writeRuModelUrl, resetRuModelUrl, defaultRuModelUrl, VOSK_RU_MODEL_URL, VOSK_RU_URL_KEY } from '../../../../shared/lib/vosk/voskConfigRu.js'
import { VOSK_MODEL_URL } from '../../../../shared/lib/vosk/voskConfig.js'

// Русская модель Vosk для прохода «назови перевод» игры «Встряхни память»: разбор кириллицы, словарь (грамматика), выбор модели слушателем, ожидание модели при переключении, адрес модели.
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] } } }

describe('кириллица: разбор слов', () => {
  it('tokenizeRu: нижний регистр, ё ≡ е, знаки убраны, дефис делит слово; английский tokenize кириллицу стирал', () => {
    expect(tokenizeRu('Ещё, ЕЩЕ!')).toEqual(['еще', 'еще'])
    expect(tokenizeRu('кто-то  пытается')).toEqual(['кто', 'то', 'пытается'])
    expect(tokenizeRu('')).toEqual([]); expect(tokenizeRu(null)).toEqual([])
    expect(normTextRu('Ёлка!')).toBe('елка')
  })
  it('phraseFormsRu: слово как записано и без «ё»; без «ё» — одна запись; пусто — нет записей', () => {
    expect(phraseFormsRu('Ещё')).toEqual(['ещё', 'еще']); expect(phraseFormsRu('учиться')).toEqual(['учиться']); expect(phraseFormsRu('я пытаюсь')).toEqual(['я пытаюсь']); expect(phraseFormsRu('')).toEqual([])
  })
})

describe('русские цели: что услышал Vosk (analyzeTargets с lang ru)', () => {
  const targets = ['пытаюсь', 'учиться', 'я']
  it('без lang кириллицу не видно (английский разбор), с lang ru цели распознаются', () => {
    expect(analyzeTargets('учиться', targets).seq).toEqual([]) // английский tokenize стёр кириллицу
    expect(analyzeTargets('учиться', targets, true, 'ru').seq).toEqual([1])
    expect(analyzeTargets('я пытаюсь учиться', targets, true, 'ru').seq).toEqual([2, 0, 1])
  })
  it('чужое слово и [unk] — промахи; ё ≡ е; регистр не важен; недосказанная многословная цель — хвост', () => {
    expect(analyzeTargets('учиться [unk]', targets, true, 'ru')).toMatchObject({ seq: [1], misses: 1 })
    expect(analyzeTargets('Ещё', ['еще'], true, 'ru').seq).toEqual([0]); expect(analyzeTargets('еще', ['ещё'], true, 'ru').seq).toEqual([0])
    expect(analyzeTargets('кот', targets, true, 'ru')).toMatchObject({ seq: [], misses: 1 })
    expect(analyzeTargets('я', ['я пытаюсь'], false, 'ru').tail).toEqual({ target: 0, tokens: 1 })
    expect(analyzeTargets('я пытаюсь', ['я пытаюсь'], true, 'ru').seq).toEqual([0])
  })
})

describe('русский словарь Vosk (targetGrammar с lang ru)', () => {
  it('слова кириллицей строчными, ё и е как две записи, [unk]; без lang — слов нет (кириллица стёрта)', () => {
    const g = JSON.parse(targetGrammar(['Учиться', 'Ещё'], 1, null, 'ru'))
    expect(g).toEqual(['учиться', 'ещё', 'еще', '[unk]', '[unk]']) // уровень из слов и «не то», затем общий [unk]
    expect(targetGrammar(['Учиться'], 1)).toBeNull()
    const two = JSON.parse(targetGrammar(['пытаюсь', 'учиться'], 2, null, 'ru'))
    expect(two).toContain('пытаюсь учиться'); expect(two).toContain('учиться [unk]'); expect(two).toContain('[unk]')
  })
})

describe('слушатель: выбор модели по языку', () => {
  const fakeListen = (log, script) => async (model, grammar, cb) => {
    log.push({ model, grammar })
    queueMicrotask(() => { cb.onReady?.(); script.partials?.forEach(p => cb.onPartial(p)); cb.onResult(script.result, { words: [] }) })
    return { stop() {}, cancel() {} }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))
  it('по умолчанию слушает основной (английский) прогрев, lang ru — русский; модели не путаются', () => {
    expect(runtimeOf('ru')).toBe(voskRuntimeRu); expect(runtimeOf('en')).toBe(voskRuntime)
  })
  it('lang ru: русская модель, русский словарь, русские цели засчитываются', async () => {
    const log = [], seen = []
    const ru = { getModel: () => 'RU' }, en = { getModel: () => 'EN' }
    const l = createWordListener({ targets: ['учиться', 'пытаюсь'], lang: 'ru', maxWords: 1, runtime: ru, listen: fakeListen(log, { partials: ['учиться'], result: 'учиться' }), onChange: s => seen.push(s), setTimer: () => 0 })
    l.start(); await tick(); await tick()
    expect(log[0].model).toBe('RU'); expect(JSON.parse(log[0].grammar)).toContain('учиться')
    expect(Math.max(...seen.map(s => s.hits))).toBe(1); expect(seen.at(-1).seq).toEqual([0])
    l.dispose()
    const log2 = []
    const l2 = createWordListener({ targets: ['try'], runtime: en, listen: fakeListen(log2, { partials: ['try'], result: 'try' }), onChange: () => {}, setTimer: () => 0 })
    l2.start(); await tick(); expect(log2[0].model).toBe('EN'); l2.dispose()
  })
  it('модель ещё грузится (переключение): слушатель ждёт её, а не сообщает «нет модели»; не дождался — unavailable', async () => {
    let model = null, t = 0, snap = { expecting: true, loading: false }
    const seen = [], timers = []
    const rt = { getModel: () => model, snapshot: () => snap }
    const l = createWordListener({ targets: ['учиться'], lang: 'ru', runtime: rt, listen: fakeListen([], { result: 'учиться' }), onChange: s => seen.push(s.status), now: () => t, setTimer: fn => { timers.push(fn); return timers.length } })
    l.start()
    expect(seen).toEqual(['starting']); expect(timers).toHaveLength(1) // ждёт, не 'unavailable'
    t += 2000; timers.shift()(); expect(seen).toEqual(['starting', 'starting']) // всё ещё ждём
    model = 'RU'; t += 2000; timers.shift()(); await tick()
    expect(seen).toContain('listening')
    l.dispose()
    // не дождался
    const seen2 = []; let t2 = 0; const tm = []
    const l2 = createWordListener({ targets: ['учиться'], lang: 'ru', runtime: { getModel: () => null, snapshot: () => snap }, listen: fakeListen([], {}), onChange: s => seen2.push(s.status), now: () => t2, setTimer: fn => { tm.push(fn); return tm.length } })
    l2.start(); t2 += MODEL_WAIT_MS + 1; tm.shift()()
    expect(seen2.at(-1)).toBe('unavailable'); l2.dispose()
    snap = { expecting: false, loading: false }
  })
  it('noVosk (тап вместо речи в проходе без русской модели): модель не нужна, цели засчитываются через tap()', () => {
    const seen = []
    const l = createWordListener({ targets: ['учиться', 'пытаюсь'], lang: 'ru', noVosk: true, runtime: { getModel: () => null }, onChange: s => seen.push(s), setTimer: () => 0 })
    l.start(); expect(seen.at(-1).status).toBe('listening'); expect(l.available()).toBe(true)
    l.tap(1); expect(seen.at(-1).seq).toEqual([1]); l.dispose()
  })
})

describe('адрес русской модели', () => {
  it('по умолчанию — tar.gz из нашего public/vosk (свой домен, без github.io); VITE_VOSK_RU_MODEL_URL важнее; сохранённый админом важнее всего', () => {
    expect(VOSK_RU_MODEL_URL).toBe('/vosk/vosk-model-small-ru-0.22.tar.gz'); expect(VOSK_RU_MODEL_URL).not.toMatch(/github\.io/); expect(VOSK_MODEL_URL).toMatch(/^https:/)
    expect(defaultRuModelUrl({})).toBe(VOSK_RU_MODEL_URL); expect(defaultRuModelUrl({ VITE_VOSK_RU_MODEL_URL: ' https://r2/ru.tar.gz ' })).toBe('https://r2/ru.tar.gz')
    const st = memStore(); expect(readRuModelUrl(st, {})).toBe(VOSK_RU_MODEL_URL)
    writeRuModelUrl('https://mine/ru.tar.gz', st); expect(st.getItem(VOSK_RU_URL_KEY)).toBe('https://mine/ru.tar.gz'); expect(readRuModelUrl(st, { VITE_VOSK_RU_MODEL_URL: 'x' })).toBe('https://mine/ru.tar.gz')
    expect(resetRuModelUrl(st, {})).toBe(VOSK_RU_MODEL_URL); expect(readRuModelUrl(st, {})).toBe(VOSK_RU_MODEL_URL)
  })
  it('modelUrlOf: по языку; ключи русской и английской моделей разные', () => {
    const st = memStore({ [VOSK_RU_URL_KEY]: 'ru-url' })
    expect(modelUrlOf('ru', st, {})).toBe('ru-url'); expect(modelUrlOf('en', st, {})).toBe(VOSK_MODEL_URL); expect(modelUrlOf(undefined, st, {})).toBe(VOSK_MODEL_URL)
    expect(VOSK_RU_URL_KEY).not.toBe('pithy_admin_vosk_model_url_v1')
  })
})

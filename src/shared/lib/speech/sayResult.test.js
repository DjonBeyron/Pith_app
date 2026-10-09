import { describe, it, expect } from 'vitest'
import { sayOutcome, judgeRun, interimDiffers, phraseWords, sayEventProps, MAX_TAPS, SAY_EVENTS } from './sayResult.js'
import { readSayData, parseKeywords, clampThreshold, keywordsMissingInPhrase } from './sayPhraseData.js'
import { sayStatus, micLabel } from './sayStatus.js'
import { failureCopy } from './sayTexts.js'
import { emptyView } from './speechController.js'

describe('sayOutcome — правила результата (никогда не штрафуем)', () => {
  it('прошёл с 1–2 нажатия без автоповторов → success, clean', () => {
    expect(sayOutcome({ kind: 'passed', taps: 1 })).toMatchObject({ result: 'success', success: true, clean: true, penalty: false, trigger: 'say_done' })
    expect(sayOutcome({ kind: 'passed', taps: 2 })).toMatchObject({ result: 'success', clean: true })
  })

  it('прошёл с 3 нажатия или после автоповторов связи → success без метки «чисто»', () => {
    expect(sayOutcome({ kind: 'passed', taps: 3 })).toMatchObject({ result: 'success', clean: false })
    expect(sayOutcome({ kind: 'passed', taps: 1, autoRetries: 2 })).toMatchObject({ result: 'success', clean: false })
  })

  it('«Получилось» (самооценка) → success без бонуса', () => {
    expect(sayOutcome({ kind: 'self_ok', taps: 1 })).toMatchObject({ result: 'success', success: true, clean: false, penalty: false })
  })

  it('«Не могу говорить» / пропуск → skipped: без XP и без штрафа, урок идёт дальше', () => {
    const o = sayOutcome({ kind: 'skip', taps: 3 })
    expect(o).toMatchObject({ result: 'skipped', success: false, penalty: false, trigger: 'say_done' })
  })

  it('ветка say_skip используется, только если она соединена', () => {
    expect(sayOutcome({ kind: 'skip', hasSkipLink: true }).trigger).toBe('say_skip')
    expect(sayOutcome({ kind: 'skip', hasSkipLink: false }).trigger).toBe('say_done')
    expect(sayOutcome({ kind: 'self_ok', hasSkipLink: true }).trigger).toBe('say_done')
  })

  it('ни один исход не штрафует', () => {
    for (const kind of ['passed', 'self_ok', 'skip', 'solve']) {
      for (const taps of [1, 2, MAX_TAPS]) expect(sayOutcome({ kind, taps }).penalty).toBe(false)
    }
  })
})

describe('judgeRun — порог и ключевые слова', () => {
  const view = (...texts) => ({ ...emptyView, alternatives: texts.map(text => ({ text, confidence: 0.9 })), final: { text: texts[0], confidence: 0.9 } })
  const d = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })

  it('порядок слов не важен, опечатки допустимы', () => {
    expect(judgeRun(view('please both I am trying to'), d).passed).toBe(true)
    expect(judgeRun(view('I am tryin to pleas both'), d).passed).toBe(true)
  })

  it('порог ноды: 4 из 6 слов — 67% — не проходит при 70, проходит при 60', () => {
    const v = view('I am trying please')
    expect(judgeRun(v, d).ratioPct).toBe(67)
    expect(judgeRun(v, d).passed).toBe(false)
    expect(judgeRun(v, readSayData({ phrase: d.phrase, keywords: 'please', threshold: 60 })).passed).toBe(true)
  })

  it('ключевое слово обязательно: порог пройден, а «please» нет — не засчитано', () => {
    expect(judgeRun(view('I am trying to both'), d).passed).toBe(false)
    expect(judgeRun(view('I am trying to both'), readSayData({ phrase: d.phrase })).passed).toBe(true)
  })

  it('решение — ТОЛЬКО по главному варианту (alts[0]); лучший из остальных не выбирается', () => {
    expect(judgeRun(view('banana', 'I am trying to please both'), d).passed).toBe(false)
    expect(judgeRun(view('I am trying to please both', 'banana'), d).passed).toBe(true)
    expect(judgeRun(view('banana', 'I am trying to please both'), d).heard).toBe('banana')
  })

  it('намеренная ошибка: «I\'m try to please both» при эталоне «I\'m trying…» — обычный режим проходит (5/6), «Строго» — нет', () => {
    const ref = readSayData({ phrase: "I'm trying to please both", keywords: 'please' })
    const strict = readSayData({ phrase: "I'm trying to please both", keywords: 'please', strict: true, threshold: 50 })
    const v = view("I'm try to please both")
    expect(judgeRun(v, ref)).toMatchObject({ passed: true, ratioPct: 83, missed: ['trying'] })
    expect(judgeRun(v, strict)).toMatchObject({ passed: false, ratioPct: 83 })
    expect(judgeRun(view("I'm trying to please both"), strict).passed).toBe(true)
    // регистр, знаки и сокращения («I'm» = «I am») нормализуются и в строгом режиме
    expect(judgeRun(view('i am trying, to PLEASE both!'), strict).passed).toBe(true)
  })

  it('interimDiffers: движок «исправил» слово (interim «try» → final «trying») — для админской диагностики', () => {
    expect(interimDiffers("I'm try", "I'm trying")).toBe(true)
    expect(interimDiffers("i'm trying", "I'm trying!")).toBe(false)
    expect(interimDiffers('', "I'm trying")).toBe(false)
  })

  it('пустое услышанное не проходит', () => {
    expect(judgeRun({ ...emptyView }, d).passed).toBe(false)
  })
})

describe('phraseWords — раскраска слов как написал автор', () => {
  it('услышанные ok, пропущенные miss; до проверки без тона', () => {
    const d = readSayData({ phrase: 'I am trying to please both' })
    const v = judgeRun({ ...emptyView, alternatives: [{ text: 'I am trying to please', confidence: 1 }] }, d)
    expect(phraseWords(d.phrase, v).map(w => `${w.text}:${w.tone}`)).toEqual(['I:ok', 'am:ok', 'trying:ok', 'to:ok', 'please:ok', 'both:miss'])
    expect(phraseWords(d.phrase, null).every(w => w.tone === null)).toBe(true)
  })

  it('сокращение «I’m» (два токена) — ok, только если услышаны оба; знаки препинания сохраняются', () => {
    const d = readSayData({ phrase: "I'm here, please." })
    const full = judgeRun({ ...emptyView, alternatives: [{ text: 'I am here please', confidence: 1 }] }, d)
    expect(phraseWords(d.phrase, full).map(w => `${w.text}:${w.tone}`)).toEqual(["I'm:ok", 'here,:ok', 'please.:ok'])
    const part = judgeRun({ ...emptyView, alternatives: [{ text: 'here please', confidence: 1 }] }, d)
    expect(phraseWords(d.phrase, part)[0].tone).toBe('miss')
  })
})

describe('sayEventProps — формат аналитики', () => {
  it('поля attempts, passed, ratio, perm, explainer_shown; без текста и звука', () => {
    const p = sayEventProps({ perm: 'granted', explained: true, taps: 2, autoRetries: 1, passed: true, ratioPct: 83, clean: false })
    expect(p).toEqual({ perm: 'granted', explainer_shown: true, attempts: 2, auto_retries: 1, passed: true, ratio: 83, clean: false })
    for (const v of Object.values(p)) expect(['number', 'boolean', 'string']).toContain(typeof v)
  })

  it('interim_differs — флаг без текста', () => {
    expect(sayEventProps({ passed: true, interimDiffers: true })).toEqual({ passed: true, interim_differs: true })
    expect(sayEventProps({ passed: true, interimDiffers: false }).interim_differs).toBe(false)
  })

  it('пустые поля опускаются; имена событий по заданию', () => {
    expect(sayEventProps({ perm: 'prompt', taps: 1 })).toEqual({ perm: 'prompt', attempts: 1 })
    expect(Object.values(SAY_EVENTS)).toEqual(['say_phrase_start', 'say_phrase_result', 'say_phrase_skip', 'say_phrase_self_ok'])
    for (const name of Object.values(SAY_EVENTS)) expect(name).toMatch(/^[a-z][a-z0-9_]{1,39}$/) // как проверяет log_events на сервере
  })
})

describe('данные ноды', () => {
  it('значения по умолчанию: порог 70, en-US, «Послушать» включена', () => {
    expect(readSayData({ phrase: ' Hello ' })).toMatchObject({ phrase: 'Hello', threshold: 70, passRatio: 0.7, lang: 'en-US', listenAudio: true, keywords: [] })
    expect(readSayData(undefined).phrase).toBe('')
  })

  it('showPhrase по умолчанию true (отсутствие = true), strict по умолчанию false; strict поднимает порог до 100%', () => {
    expect(readSayData({ phrase: 'Hi' })).toMatchObject({ showPhrase: true, strict: false, passRatio: 0.7 })
    expect(readSayData({ phrase: 'Hi', showPhrase: false })).toMatchObject({ showPhrase: false })
    expect(readSayData({ phrase: 'Hi', showPhrase: 'no', strict: 'yes' })).toMatchObject({ showPhrase: true, strict: false })
    expect(readSayData({ phrase: 'Hi', strict: true, threshold: 60 })).toMatchObject({ strict: true, threshold: 100, passRatio: 1 })
  })

  it('порог 50–100; en-GB; listenAudio=false отключает кнопку', () => {
    expect(clampThreshold(10)).toBe(50)
    expect(clampThreshold(250)).toBe(100)
    expect(clampThreshold('85')).toBe(85)
    expect(clampThreshold('')).toBe(70)
    expect(clampThreshold('abc')).toBe(70)
    expect(readSayData({ lang: 'en-GB', listenAudio: false, threshold: 90 })).toMatchObject({ lang: 'en-GB', listenAudio: false, passRatio: 0.9 })
    expect(readSayData({ lang: 'fr-FR' }).lang).toBe('en-US')
  })

  it('ключевые слова через запятую, без пустых и повторов; лишних сверх фразы подсвечиваем', () => {
    expect(parseKeywords('please, Both ;please,, ')).toEqual(['please', 'Both'])
    expect(keywordsMissingInPhrase('I am here', 'am, please')).toEqual(['please'])
  })
})

describe('sayStatus и тексты', () => {
  const base = { view: emptyView, verdict: null, errorCode: null, fallbackReason: null }

  it('основные состояния: подписи на плашке микрофона, строка под ней пуста', () => {
    expect(micLabel({ ...base, phase: 'idle' })).toEqual({ label: 'Нажмите, чтобы говорить', mode: 'idle' })
    expect(micLabel({ ...base, phase: 'run', view: { ...emptyView, status: 'starting' } }).mode).toBe('busy')
    expect(micLabel({ ...base, phase: 'run', view: { ...emptyView, status: 'listening', interim: 'I am' } })).toEqual({ label: 'Слушаю…', mode: 'listening' })
    expect(micLabel({ ...base, phase: 'run', view: { ...emptyView, status: 'done' } })).toEqual({ label: 'Обрабатываем…', mode: 'busy' })
    expect(micLabel({ ...base, phase: 'passed', verdict: { ratioPct: 100 } })).toMatchObject({ label: 'Верно!', mode: 'ok' })
    expect(micLabel({ ...base, phase: 'fallback', fallbackReason: 'denied' })).toEqual({ label: 'Микрофон выключен', mode: 'off' })
    expect(micLabel({ ...base, phase: 'fallback', fallbackReason: 'unsupported' }).mode).toBe('off')
    for (const phase of ['idle', 'explain', 'passed']) expect(sayStatus({ ...base, phase }).status).toBe(null)
    expect(sayStatus({ ...base, phase: 'run', view: { ...emptyView, status: 'listening', interim: 'I am' } })).toMatchObject({ status: null })
    expect(sayStatus({ ...base, phase: 'run', view: { ...emptyView, status: 'retrying', notice: 'Слабая связь, пробуем ещё раз (2 из 3)…' } }).status).toMatch(/Слабая связь, пробуем ещё раз \(2 из 3\)/)
  })

  it('сказанного текста в строке статуса нет вообще (его видит только админ — sayAdmin.js)', () => {
    const v = { ...emptyView, status: 'listening', interim: 'SECRET interim' }
    expect(JSON.stringify(sayStatus({ ...base, phase: 'run', view: v }))).not.toMatch(/SECRET/)
    expect(JSON.stringify(sayStatus({ ...base, phase: 'failed', verdict: { missed: ['both'], heard: 'SECRET heard' } }))).not.toMatch(/SECRET/)
    expect(sayStatus({ ...base, phase: 'passed', verdict: { ratioPct: 100, heard: 'x' } })).not.toHaveProperty('heard')
  })

  it('неудачи: тишина → «Говорите громче»; «Не расслышали: …» только при скрытой фразе; запасной режим — по причине', () => {
    expect(sayStatus({ ...base, phase: 'failed', errorCode: 'no-speech' }).hint).toBe('Говорите громче и ближе к микрофону.')
    const v = { missed: ['please', 'both'], heard: 'I am' }
    expect(sayStatus({ ...base, phase: 'failed', verdict: v }).hint).toBe(null) // фраза в чате: слова подсвечены там
    expect(sayStatus({ ...base, phase: 'failed', verdict: v, showPhrase: false }).hint).toBe('Не расслышали: please, both')
    expect(sayStatus({ ...base, phase: 'fallback', fallbackReason: 'denied' }).status).toMatch(/настройках/)
    expect(sayStatus({ ...base, phase: 'fallback', fallbackReason: 'unsupported' }).status).toMatch(/недоступна/)
    expect(sayStatus({ ...base, phase: 'fallback', fallbackReason: 'cant_speak' }).status).toMatch(/без микрофона/)
    expect(failureCopy('network').status).toMatch(/Слабая связь/)
  })

  it('пояснение про микрофон — тексты задания (показывает попап)', async () => {
    const t = await import('./sayTexts.js')
    expect(t.EXPLAIN_BTN).toBe('Понятно, включить микрофон')
    expect(t.SAY_LABEL).toBe('Произнесите фразу')
    expect(t.CANT_SPEAK_LINK).toBe('Я не могу говорить')
  })

  it('честная формулировка: не обещаем, что звук не покидает телефон', async () => {
    const { EXPLAIN_TEXT } = await import('./sayTexts.js')
    expect(EXPLAIN_TEXT).toMatch(/не записываем и не сохраняем звук/)
    expect(EXPLAIN_TEXT).toMatch(/распознаёт ваш телефон или браузер/)
    expect(EXPLAIN_TEXT).not.toMatch(/не покидает/)
  })
})

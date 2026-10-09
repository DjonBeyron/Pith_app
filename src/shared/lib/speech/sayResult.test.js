import { describe, it, expect } from 'vitest'
import { sayOutcome, judgeRun, interimDiffers, failReason, sayEventProps, SAY_EVENTS } from './sayResult.js'
import { readSayData, parseKeywords, clampThreshold, keywordsMissingInPhrase } from './sayPhraseData.js'
import { micLabel } from './sayMic.js'
import { emptyView } from './speechController.js'

describe('sayOutcome — правила результата (никогда не штрафуем)', () => {
  it('проверка пройдена → success, XP как раньше, триггер say_done', () => {
    expect(sayOutcome({ kind: 'passed' })).toMatchObject({ result: 'success', success: true, penalty: false, trigger: 'say_done' })
  })

  it('«Я не могу говорить» / пропуск → skipped: без XP и без штрафа, урок идёт дальше', () => {
    expect(sayOutcome({ kind: 'skip' })).toMatchObject({ result: 'skipped', success: false, penalty: false, trigger: 'say_done' })
  })

  it('ветка say_skip используется, только если она соединена', () => {
    expect(sayOutcome({ kind: 'skip', hasSkipLink: true }).trigger).toBe('say_skip')
    expect(sayOutcome({ kind: 'skip', hasSkipLink: false }).trigger).toBe('say_done')
    expect(sayOutcome({ kind: 'solve', hasSkipLink: true }).trigger).toBe('say_done')
  })

  it('«Получилось»/«Ещё раз» удалены: ни kind self_ok, ни clean, ни MAX_TAPS, ни события say_phrase_self_ok', () => {
    expect(sayOutcome({ kind: 'passed', taps: 3, autoRetries: 2 })).not.toHaveProperty('clean')
    expect(Object.values(SAY_EVENTS)).not.toContain('say_phrase_self_ok')
  })

  it('ни один исход не штрафует', () => {
    for (const kind of ['passed', 'skip', 'solve']) expect(sayOutcome({ kind }).penalty).toBe(false)
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

describe('failReason — причина неудачи для подсказки и аналитики', () => {
  it('тишина, связь, «почти» (≥50% слов), «не то»; коды ошибок как есть; без неудачи — null', () => {
    expect(failReason({ errorCode: 'no-speech' })).toBe('silence')
    expect(failReason({ errorCode: 'silence' })).toBe('silence')
    expect(failReason({ errorCode: 'network' })).toBe('network')
    expect(failReason({ errorCode: 'audio-capture' })).toBe('audio-capture')
    expect(failReason({ verdict: { passed: false, ratio: 0.5 } })).toBe('partial')
    expect(failReason({ verdict: { passed: false, ratio: 0.33 } })).toBe('mismatch')
    expect(failReason({ verdict: { passed: true, ratio: 1 } })).toBe(null)
    expect(failReason({})).toBe(null)
  })
})

describe('sayEventProps — формат аналитики', () => {
  it('поля attempts, passed, ratio, perm, explainer_shown; без текста и звука', () => {
    const p = sayEventProps({ perm: 'granted', explained: true, taps: 2, autoRetries: 1, passed: false, ratioPct: 83, reason: 'partial', failStreak: 2 })
    expect(p).toEqual({ perm: 'granted', explainer_shown: true, attempts: 2, auto_retries: 1, passed: false, ratio: 83, reason: 'partial', fail_streak: 2 })
    for (const v of Object.values(p)) expect(['number', 'boolean', 'string']).toContain(typeof v)
  })

  it('interim_differs — флаг без текста', () => {
    expect(sayEventProps({ passed: true, interimDiffers: true })).toEqual({ passed: true, interim_differs: true })
    expect(sayEventProps({ passed: true, interimDiffers: false }).interim_differs).toBe(false)
  })

  it('пустые поля опускаются; имена событий по заданию', () => {
    expect(sayEventProps({ perm: 'prompt', taps: 1 })).toEqual({ perm: 'prompt', attempts: 1 })
    expect(Object.values(SAY_EVENTS)).toEqual(['say_phrase_start', 'say_phrase_result', 'say_phrase_skip'])
    for (const name of Object.values(SAY_EVENTS)) expect(name).toMatch(/^[a-z][a-z0-9_]{1,39}$/) // как проверяет log_events на сервере
  })
})

describe('данные ноды', () => {
  it('значения по умолчанию: порог 70, en-US, «Послушать» включена', () => {
    expect(readSayData({ phrase: ' Hello ' })).toMatchObject({ phrase: 'Hello', threshold: 70, passRatio: 0.7, lang: 'en-US', listenAudio: true, keywords: [] })
    expect(readSayData(undefined).phrase).toBe('')
  })

  it('strict у существующих нод (поля нет) = false; strict поднимает порог до 100%; старое поле showPhrase игнорируется', () => {
    expect(readSayData({ phrase: 'Hi' })).toMatchObject({ strict: false, passRatio: 0.7 })
    expect(readSayData({ phrase: 'Hi', strict: 'yes' })).toMatchObject({ strict: false })
    expect(readSayData({ phrase: 'Hi', strict: true, threshold: 60 })).toMatchObject({ strict: true, threshold: 100, passRatio: 1 })
    expect(readSayData({ phrase: 'Hi', showPhrase: false })).not.toHaveProperty('showPhrase')
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

describe('micLabel и тексты панели (внутри панели нет подсказок)', () => {
  const base = { verdict: null, fallbackReason: null }

  it('основные состояния: «Нажмите, чтобы говорить» → «Произнесите фразу» (тап) → «Попробуйте сказать ещё раз» (неудача) → «Готово» в круге; системные «Микрофон выключен» / «Проверка голоса недоступна»', () => {
    expect(micLabel({ ...base, phase: 'idle' })).toEqual({ label: 'Нажмите, чтобы говорить', mode: 'idle' })
    expect(micLabel({ ...base, phase: 'explain' })).toEqual({ label: 'Нажмите, чтобы говорить', mode: 'idle' }) // идёт попап пояснения
    expect(micLabel({ ...base, phase: 'failed' })).toEqual({ label: 'Попробуйте сказать ещё раз', mode: 'retry' }) // микрофон снова доступен сразу
    expect(micLabel({ ...base, phase: 'run' })).toEqual({ label: 'Произнесите фразу', mode: 'prep' })              // эквалайзер уже живой, «стоп» ещё нельзя
    expect(micLabel({ ...base, phase: 'run', go: true })).toEqual({ label: 'Произнесите фразу', mode: 'listening' })
    expect(micLabel({ ...base, phase: 'passed' })).toEqual({ label: '', mode: 'ok' })                              // «Готово» рисует сам круг
    expect(micLabel({ ...base, phase: 'fallback', fallbackReason: 'denied' })).toEqual({ label: 'Микрофон выключен', mode: 'off' })
    expect(micLabel({ ...base, phase: 'fallback', fallbackReason: 'cant_speak' })).toEqual({ label: 'Микрофон выключен', mode: 'off' })
    expect(micLabel({ ...base, phase: 'fallback', fallbackReason: 'unsupported' })).toEqual({ label: 'Проверка голоса недоступна', mode: 'off' })
  })

  it('режима «Обрабатываем…», «Включаем микрофон…», sayStatus и текстов-подсказок панели (Почти!, Не хватило, совет) больше нет', async () => {
    const t = await import('./sayTexts.js')
    for (const gone of ['MIC_PROCESSING', 'MIC_STARTING', 'ALMOST_STATUS', 'MISSED_PREFIX', 'SLOW_ADVICE', 'SILENCE_STATUS', 'NETWORK_STATUS', 'DENIED_HINT', 'failureCopy']) {
      expect(t, gone).not.toHaveProperty(gone)
    }
    const mod = await import('./sayMic.js')
    expect(mod).not.toHaveProperty('sayStatus')
  })

  it('пояснение про микрофон — тексты задания (показывает попап)', async () => {
    const t = await import('./sayTexts.js')
    expect(t.EXPLAIN_BTN).toBe('Понятно, включить микрофон')
    expect(t.SAY_LABEL).toBe('Произнесите фразу')
    expect(t.MIC_RETRY).toBe('Попробуйте сказать ещё раз')
    expect(t.DONE).toBe('Готово')
    expect(t.CANT_SPEAK_LINK).toBe('Я не могу говорить')
  })

  it('честная формулировка: не обещаем, что звук не покидает телефон', async () => {
    const { EXPLAIN_TEXT } = await import('./sayTexts.js')
    expect(EXPLAIN_TEXT).toMatch(/не записываем и не сохраняем звук/)
    expect(EXPLAIN_TEXT).toMatch(/распознаёт ваш телефон или браузер/)
    expect(EXPLAIN_TEXT).not.toMatch(/не покидает/)
  })
})

import { describe, it, expect } from 'vitest'
import { sayReducer, initialSayState, planTap, isGo, STOP_ARM_MS } from './sayFlow.js'
import { emptyView } from './speechController.js'
import { readSayData } from './sayPhraseData.js'

const data = readSayData({ phrase: 'I am trying to please both', keywords: 'please', threshold: 70 })
const alt = text => ({ text, confidence: 0.9 })
const done = (text, extra = {}) => ({ ...emptyView, status: 'done', runNo: 1, attempt: 1, final: alt(text), alternatives: [alt(text)], ...extra })
const run = () => sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data })

describe('sayReducer', () => {
  it('начало: фаза run, попытка №1, данные фиксируются на тап', () => {
    const s = run()
    expect(s).toMatchObject({ phase: 'run', taps: 1, data })
  })

  it('верно сказали → passed с вердиктом и событием result', () => {
    const s = sayReducer(run(), { type: 'view', view: done('I am trying to please both') })
    expect(s.phase).toBe('passed')
    expect(s.verdict.ratioPct).toBe(100)
    expect(s.event).toMatchObject({ name: 'say_phrase_result', extra: { passed: true, ratioPct: 100 } })
    expect(s.settledRun).toBe(1)
  })

  it('порог 70% и ключевое слово: без «please» не засчитано, даже если слов достаточно', () => {
    const s = sayReducer(run(), { type: 'view', view: done('I am trying to both') })
    expect(s.phase).toBe('failed')
    expect(s.verdict.passed).toBe(false)
  })

  it('автоповторы связи записываются: passed после network ×2 → autoRetries=2', () => {
    const s = sayReducer(run(), { type: 'view', view: done('I am trying to please both', { attempt: 3 }) })
    expect(s).toMatchObject({ phase: 'passed', autoRetries: 2 })
    expect(s.event.extra.autoRetries).toBe(2)
  })

  it('ошибка network после автоповторов → failed с кодом; not-allowed → fallback denied', () => {
    const net = sayReducer(run(), { type: 'view', view: { ...emptyView, status: 'error', runNo: 1, error: 'network', attempt: 3 } })
    expect(net).toMatchObject({ phase: 'failed', errorCode: 'network' })
    const den = sayReducer(run(), { type: 'view', view: { ...emptyView, status: 'error', runNo: 1, error: 'not-allowed', attempt: 1 } })
    expect(den).toMatchObject({ phase: 'fallback', fallbackReason: 'denied' })
    expect(den.event.extra).toMatchObject({ passed: false, reason: 'denied' })
  })

  it('конец без текста (остановили до речи) → «не слышу речь»', () => {
    const s = sayReducer(run(), { type: 'view', view: { ...emptyView, status: 'done', runNo: 1, final: null } })
    expect(s).toMatchObject({ phase: 'failed', errorCode: 'no-speech' })
  })

  it('итог обрабатывается один раз на заход; события вне записи игнорируются', () => {
    const s1 = sayReducer(run(), { type: 'view', view: done('I am trying to please both') })
    const s2 = sayReducer(s1, { type: 'view', view: done('whatever') })
    expect(s2.phase).toBe('passed')
    const idle = initialSayState({ action: 'listen' })
    expect(sayReducer(idle, { type: 'view', view: done('I am trying to please both') }).phase).toBe('idle')
  })

  it('сворачивание: попытка не тратится, панель снова готова', () => {
    const s = sayReducer(run(), { type: 'interrupt' })
    expect(s).toMatchObject({ phase: 'idle', taps: 0 })
  })

  it('пояснение → explain; fallback onlyIdle не перебивает идущую запись; enable возвращает к микрофону', () => {
    const e = sayReducer(initialSayState({ action: 'explain' }), { type: 'explain' })
    expect(e).toMatchObject({ phase: 'explain', explainer: true })
    expect(sayReducer(run(), { type: 'fallback', reason: 'denied', onlyIdle: true }).phase).toBe('run')
    const f = initialSayState({ action: 'fallback', reason: 'cant_speak' })
    expect(f).toMatchObject({ phase: 'fallback', fallbackReason: 'cant_speak' })
    expect(sayReducer(f, { type: 'enable' })).toMatchObject({ phase: 'idle', fallbackReason: null })
  })
})

describe('пояснение, причины неудач, строка админа', () => {
  it('попап пояснения: закрыли мимо кнопки → снова готов, флаг пояснения не ставится; «Понятно» → запись', () => {
    const e = sayReducer(initialSayState({ action: 'explain' }), { type: 'explain' })
    expect(sayReducer(e, { type: 'explainCancel' })).toMatchObject({ phase: 'idle' })
    expect(sayReducer(run(), { type: 'explainCancel' }).phase).toBe('run') // чужую фазу не трогаем
    expect(sayReducer(e, { type: 'begin', data })).toMatchObject({ phase: 'run', taps: 1 })
  })

  it('событие результата несёт interimDiffers: движок «исправил» слово (interim ≠ final) — без текста', () => {
    const a = sayReducer(run(), { type: 'view', view: done('I am trying to please both', { lastInterim: 'I am try to please both' }) })
    expect(a.event.extra.interimDiffers).toBe(true)
    const b = sayReducer(run(), { type: 'view', view: done('I am trying to please both', { lastInterim: 'i am trying to please both' }) })
    expect(b.event.extra.interimDiffers).toBe(false)
  })

  it('«Строго»: намеренная ошибка не проходит, обычный режим проходит', () => {
    const loose = readSayData({ phrase: "I'm trying to please both", keywords: 'please' })
    const strict = readSayData({ phrase: "I'm trying to please both", keywords: 'please', strict: true })
    const view = done("I'm try to please both")
    expect(sayReducer(sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data: loose }), { type: 'view', view }).phase).toBe('passed')
    expect(sayReducer(sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data: strict }), { type: 'view', view }).phase).toBe('failed')
  })
})

describe('причины неудач и серия (дефолтные ответы, аналитика)', () => {
  const fail = (s, view) => sayReducer(s, { type: 'view', view })
  const twice = () => {
    const a = fail(run(), done('I am', { runNo: 1 }))
    return fail(sayReducer(a, { type: 'begin', data }), done('I am', { runNo: 2 }))
  }

  it('«почти» (≥50%) → partial; сказали не то → mismatch; тишина → silence; связь → network; серия растёт и сбрасывается успехом', () => {
    const partial = fail(run(), done('I am trying', { runNo: 1 }))
    expect(partial).toMatchObject({ phase: 'failed', failStreak: 1 })
    expect(partial.event.extra).toMatchObject({ passed: false, reason: 'partial', failStreak: 1, ratioPct: 50 })
    expect(fail(run(), done('banana apple', { runNo: 1 })).event.extra.reason).toBe('mismatch')
    expect(fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'no-speech' }).event.extra.reason).toBe('silence')
    expect(fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'network' }).event.extra.reason).toBe('network')
    expect(twice().failStreak).toBe(2)
    expect(twice().taps).toBe(2)
    const ok = fail(sayReducer(twice(), { type: 'begin', data }), done('I am trying to please both', { runNo: 3 }))
    expect(ok).toMatchObject({ phase: 'passed', failStreak: 0 })
  })

  it('после неудачи тап по микрофону снова начинает попытку: число попыток не ограничено (счёт идёт для аналитики)', () => {
    let s = run()
    for (let i = 1; i <= 6; i++) {
      s = fail(s, done('banana', { runNo: i }))
      expect(planTap({ view: s.view, decision: { action: 'listen' } })).toEqual({ act: 'begin' })
      s = sayReducer(s, { type: 'begin', data })
    }
    expect(s.taps).toBe(7)
  })
})

describe('тап по кругу: сразу «идёт запись»; «можно остановить» = движок слушает И прошла защита от двойного тапа', () => {
  const listening = (extra = {}) => ({ ...emptyView, status: 'listening', runNo: 1, attempt: 1, ...extra })

  it('тап сразу переводит в run (круг и эквалайзер живые, не дожидаясь распознавания); защита 250–500 мс; морфинга, точек и failShow в состоянии нет', () => {
    expect(STOP_ARM_MS).toBeGreaterThanOrEqual(250)
    expect(STOP_ARM_MS).toBeLessThanOrEqual(500)
    const s = run()
    expect(s).toMatchObject({ phase: 'run', armed: false, reply: null })
    for (const gone of ['morphDone', 'failShow', 'dots', 'dotsDone']) expect(s).not.toHaveProperty(gone)
    expect(sayReducer(s, { type: 'arm' }).armed).toBe(true)
    expect(sayReducer(initialSayState({ action: 'listen' }), { type: 'arm' }).armed).toBe(false) // вне записи защиты нет
    expect(sayReducer(s, { type: 'morphEnd' })).toBe(s) // старые действия морфинга больше не обрабатываются
  })

  it('«можно остановить» = защита прошла И движок слушает: audiostart раньше конца защиты — ждём её; защита раньше audiostart — ждём audiostart', () => {
    let early = sayReducer(run(), { type: 'view', view: listening() })      // audiostart пришёл раньше
    expect(isGo(early)).toBe(false)
    early = sayReducer(early, { type: 'arm' })
    expect(isGo(early)).toBe(true)
    let late = sayReducer(run(), { type: 'arm' })                            // защита кончилась, audiostart ещё нет
    expect(isGo(late)).toBe(false)
    late = sayReducer(late, { type: 'view', view: listening() })
    expect(isGo(late)).toBe(true)
  })

  it('автоповтор (attempt > 1) защиту не повторяет: «можно остановить» сразу по audiostart', () => {
    const s = sayReducer(run(), { type: 'view', view: listening({ attempt: 2 }) })
    expect(isGo(s)).toBe(true)
  })

  it('тап до «можно остановить» игнорируется, после — «стоп»; во время ожидания разрешения — игнор; тап при идущей попытке не запускает вторую запись', () => {
    expect(planTap({ view: { ...emptyView, status: 'listening' }, decision: { action: 'listen' }, go: false })).toEqual({ act: 'ignore' })
    expect(planTap({ view: { ...emptyView, status: 'listening' }, decision: { action: 'listen' }, go: true })).toEqual({ act: 'stop' })
    expect(planTap({ view: { ...emptyView, status: 'starting' }, decision: { action: 'listen' }, go: true })).toEqual({ act: 'ignore' })
    // старт стоит в очереди перезапуска (статус ещё idle), но попытка уже идёт — второй begin нельзя
    expect(planTap({ view: emptyView, decision: { action: 'listen' }, running: true })).toEqual({ act: 'ignore' })
    expect(planTap({ view: emptyView, decision: { action: 'listen' }, running: false })).toEqual({ act: 'begin' })
    expect(planTap({ view: emptyView, decision: { action: 'fallback', reason: 'denied' } })).toEqual({ act: 'fallback', reason: 'denied' })
    expect(planTap({ view: emptyView, decision: { action: 'explain' } })).toEqual({ act: 'explain' })
  })

  it('сворачивание сбрасывает защиту', () => {
    const s = sayReducer(sayReducer(run(), { type: 'arm' }), { type: 'interrupt' })
    expect(s).toMatchObject({ armed: false, phase: 'idle' })
  })
})

describe('реплика ученика в чат (state.reply) после неудачной попытки', () => {
  const fail = (s, view) => sayReducer(s, { type: 'view', view })

  it('неверно сказали: reply = распознанный текст (с заглавной), n = номер неудачи; рядом с подсказкой hint', () => {
    const s = fail(run(), done('banana apple'))
    expect(s.reply).toEqual({ text: 'Banana apple', n: 1 })
    expect(s.hint.kind).toBe('mismatch')
    const again = fail(sayReducer(s, { type: 'begin', data }), done('i am trying', { runNo: 2 }))
    expect(again.reply).toEqual({ text: 'I am trying', n: 2 })
    expect(again.hint.kind).toBe('partial')
  })

  it('реплика есть и при выключенных подсказках (hintsOn=false): подсказки нет, реплика уходит', () => {
    const off = readSayData({ phrase: 'I am trying to please both', hintsOn: false })
    const s = fail(sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data: off }), done('banana'))
    expect(s.hint).toBe(null)
    expect(s.reply).toEqual({ text: 'Banana', n: 1 })
  })

  it('тишина, ошибка движка и «остановили до речи» — реплики нет (только подсказка); успех и новая попытка реплику снимают', () => {
    const quiet = fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'no-speech' })
    expect(quiet).toMatchObject({ phase: 'failed', reply: null })
    expect(quiet.hint.kind).toBe('silence')
    expect(fail(run(), { ...emptyView, status: 'done', runNo: 1, final: null }).reply).toBe(null)
    expect(fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'network', attempt: 3 }).reply).toBe(null)
    const wrong = fail(run(), done('banana'))
    expect(sayReducer(wrong, { type: 'begin', data }).reply).toBe(null)
    expect(fail(sayReducer(wrong, { type: 'begin', data }), done('I am trying to please both', { runNo: 2 })).reply).toBe(null)
  })

  it('отказ микрофона (not-allowed): ни реплики, ни крестика — режим «Микрофон выключен»', () => {
    const den = fail(run(), { ...emptyView, status: 'error', runNo: 1, error: 'not-allowed', attempt: 1 })
    expect(den).toMatchObject({ phase: 'fallback', reply: null })
  })
})

describe('строка админа: остаётся после результата/ошибки/таймаута, очищается только новой записью', () => {
  const listening = { ...emptyView, status: 'listening', runNo: 1, attempt: 1, interim: 'I am try', lastInterim: 'I am try' }
  const step = (s, view) => sayReducer(s, { type: 'view', view })

  it('живой interim → результат: строка остаётся с interim и final', () => {
    let s = step(run(), listening)
    expect(s.adminLine.text).toBe('Админ: слышу «I am try»')
    s = step(s, done('I am trying to please both', { lastInterim: 'I am try to please both' }))
    expect(s.phase).toBe('passed')
    expect(s.adminLine.text).toContain('interim: «I am try to please both» → final: «I am trying to please both»')
    expect(s.adminLine.note).toContain('звуки приложения подавлены')
  })

  it('ошибка/тишина/таймаут: прежний interim остаётся и дополняется причиной; строку не стирают', () => {
    let s = step(run(), listening)
    s = step(s, { ...emptyView, status: 'error', runNo: 1, error: 'silence', lastInterim: 'I am try' })
    expect(s.phase).toBe('failed')
    expect(s.adminLine.text).toBe('Админ: silence · слышал «I am try»')
    // дальнейшие нейтральные события (idle) её не сбрасывают
    expect(step(s, emptyView).adminLine.text).toBe('Админ: silence · слышал «I am try»')
  })

  it('начало НОВОЙ записи очищает строку (тап на микрофон), раньше — нет', () => {
    let s = step(run(), done('banana', { runNo: 1, lastInterim: 'banana' }))
    expect(s.adminLine.text).toMatch(/услышали «banana»|interim/)
    const kept = s.adminLine
    expect(sayReducer(s, { type: 'dot', n: 2 }).adminLine).toBe(kept)
    s = sayReducer(s, { type: 'begin', data })
    expect(s.adminLine).toBe(null)
  })

  it('слова, подтверждённые только final (строгий режим), попадают в note строки админа', () => {
    const strictData = readSayData({ phrase: "I'm trying to please both", strict: true })
    const s0 = sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data: strictData })
    const s = step(s0, done('I am trying to please both', { lastInterim: 'I am try to please both' }))
    expect(s.verdict.engineFixed).toEqual(['trying'])
    expect(s.adminLine.note).toMatch(/слово trying подтверждено только final \(корректировка движка\)/)
    expect(s.event.extra.engineFixed).toBe(1)
  })
})

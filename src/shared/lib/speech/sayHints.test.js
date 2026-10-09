import { describe, it, expect } from 'vitest'
import { hintKind, fillHint, buildHint, QUIET_TAIL_MS, HINT_DELAY_MS } from './sayHints.js'
import { readSayData } from './sayPhraseData.js'
import { sayEventProps } from './sayResult.js'
import { HINT_DEFAULTS, HINT_SILENCE_DEFAULT, HINT_MISMATCH_DEFAULT, HINT_PARTIAL_DEFAULT } from './sayTexts.js'

const data = (extra = {}) => readSayData({ phrase: 'I am trying to please both', ...extra })

describe('hintKind — какая подсказка по итогу попытки', () => {
  it('тишина/пропуск речи/связь/запись не началась → silence; не то → mismatch; почти → partial', () => {
    for (const errorCode of ['no-speech', 'silence', 'network', 'no-start', 'start-failed', 'aborted']) expect(hintKind({ errorCode }), errorCode).toBe('silence')
    expect(hintKind({ verdict: { passed: false, ratio: 0.2 } })).toBe('mismatch')
    expect(hintKind({ verdict: { passed: false, ratio: 0.5 } })).toBe('partial')
    expect(hintKind({ verdict: { passed: false, ratio: 0.83 } })).toBe('partial')
  })

  it('успех и системные ошибки, требующие действия ученика, подсказки не получают', () => {
    expect(hintKind({ verdict: { passed: true, ratio: 1 } })).toBe(null)
    expect(hintKind({})).toBe(null)
    for (const errorCode of ['audio-capture', 'service-not-allowed', 'language-not-supported']) expect(hintKind({ errorCode }), errorCode).toBe(null)
  })
})

describe('fillHint — подстановка {ok} и {missed}', () => {
  it('слова через запятую, повторы убираются; текст как есть, без экранирования', () => {
    expect(fillHint('Верно: {ok}. Не хватило: {missed}.', { ok: ['i', 'am'], missed: ['to', 'to', 'please'] })).toBe('Верно: i, am. Не хватило: to, please.')
    expect(fillHint('<b>{ok}</b> & {missed}', { ok: ['a'], missed: ['b'] })).toBe('<b>a</b> & b')
  })

  it('верных слов нет → выпадает предложение с {ok} (вариант без «Верно»); слов не хватает нет → выпадает предложение с {missed}', () => {
    expect(fillHint(HINT_PARTIAL_DEFAULT, { ok: [], missed: ['both'] })).toBe('Почти! Не хватило: both.')
    expect(fillHint(HINT_PARTIAL_DEFAULT, { ok: ['i'], missed: [] })).toBe('Почти! Верно: i.')
    expect(fillHint(HINT_PARTIAL_DEFAULT, {})).toBe('Почти!')
  })

  it('шаблон без подстановок остаётся как есть; лишние пробелы схлопываются', () => {
    expect(fillHint('  Ещё   раз!  ', { ok: ['a'] })).toBe('Ещё раз!')
    expect(fillHint('', {})).toBe('')
  })
})

describe('buildHint — готовая подсказка для чата', () => {
  const almost = { passed: false, ratio: 0.67, matched: ['i', 'am', 'trying', 'both'], missed: ['to', 'please'] }

  it('дефолты: три текста из sayTexts.js (единый источник); по умолчанию «Не слышу вас…», «Не совсем…», «Почти! Верно: …. Не хватило: ….»', () => {
    expect(HINT_SILENCE_DEFAULT).toBe('Не слышу вас. Говорите громче и ближе к микрофону.')
    expect(HINT_MISMATCH_DEFAULT).toBe('Не совсем. Попробуйте ещё раз, чуть медленнее.')
    expect(HINT_PARTIAL_DEFAULT).toBe('Почти! Верно: {ok}. Не хватило: {missed}.')
    expect(HINT_DEFAULTS).toEqual({ silence: HINT_SILENCE_DEFAULT, mismatch: HINT_MISMATCH_DEFAULT, partial: HINT_PARTIAL_DEFAULT })
    expect(buildHint(data(), { errorCode: 'no-speech' })).toEqual({ kind: 'silence', text: HINT_SILENCE_DEFAULT })
    expect(buildHint(data(), { verdict: { passed: false, ratio: 0.2, matched: [], missed: ['x'] } })).toEqual({ kind: 'mismatch', text: HINT_MISMATCH_DEFAULT })
    expect(buildHint(data(), { verdict: almost })).toEqual({ kind: 'partial', text: 'Почти! Верно: I, am, trying, both. Не хватило: to, please.' })
  })

  it('слова в подсказке — в написании автора (регистр из фразы), «i» → «I»', () => {
    const d = readSayData({ phrase: 'I am in London, please' })
    expect(buildHint(d, { verdict: { passed: false, ratio: 0.6, matched: ['i', 'am', 'london'], missed: ['in', 'please'] } }).text).toBe('Почти! Верно: I, am, London. Не хватило: in, please.')
  })

  it('автор переопределяет текст в ноде; пустое/пробельное поле = дефолт', () => {
    const d = data({ hintSilence: 'Громче!', hintMismatch: '   ', hintPartial: 'Было: {ok}; нет: {missed}' })
    expect(buildHint(d, { errorCode: 'network' }).text).toBe('Громче!')
    expect(buildHint(d, { verdict: { passed: false, ratio: 0.1, missed: [] } }).text).toBe(HINT_MISMATCH_DEFAULT)
    expect(buildHint(d, { verdict: almost }).text).toBe('Было: I, am, trying, both; нет: to, please')
  })

  it('hintsOn=false отключает все подсказки; отсутствие поля = включено', () => {
    expect(buildHint(data({ hintsOn: false }), { errorCode: 'no-speech' })).toBe(null)
    expect(buildHint(data({ hintsOn: false }), { verdict: almost })).toBe(null)
    expect(readSayData({ phrase: 'Hi' }).hintsOn).toBe(true)
    expect(readSayData({ phrase: 'Hi', hintsOn: true }).hintsOn).toBe(true)
    expect(readSayData({ phrase: 'Hi', hintsOn: false }).hintsOn).toBe(false)
    expect(buildHint(data(), { errorCode: 'audio-capture' })).toBe(null)
    expect(buildHint(null, { errorCode: 'no-speech' })).toBe(null)
  })

  it('шаблон «почти», у которого после подстановки ничего не осталось, заменяется стандартным', () => {
    const d = data({ hintPartial: 'Верно: {ok}' })
    expect(buildHint(d, { verdict: { passed: false, ratio: 0.5, matched: [], missed: ['a'] } }).text).toBe('Почти! Не хватило: a.')
  })
})

describe('тайминг и аналитика', () => {
  it('пузырь приходит ПОСЛЕ окна тишины звуков приложения (message-in не подавляется)', () => {
    expect(QUIET_TAIL_MS).toBe(600)
    expect(HINT_DELAY_MS).toBeGreaterThan(QUIET_TAIL_MS)
  })

  it('событие результата получает hint_kind (только когда подсказка ушла в чат)', () => {
    expect(sayEventProps({ passed: false, reason: 'partial', hintKind: 'partial' }).hint_kind).toBe('partial')
    expect(sayEventProps({ passed: false, reason: 'partial' })).not.toHaveProperty('hint_kind')
  })
})

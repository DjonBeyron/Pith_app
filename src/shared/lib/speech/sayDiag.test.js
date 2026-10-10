import { describe, it, expect } from 'vitest'
import { pickEngine, PICK_REASON } from './sayEnginePick.js'
import { explainPick, explainBackground, explainMemory, explainGate, clock, sec, MARK } from './sayDiagExplain.js'
import { buildDiagRows, diagReport, GROUP_TITLE } from './sayDiagRows.js'
import { browserName, platformName, readDiagEnv } from './sayDiagEnv.js'
import { INITIAL_STATUS } from '../vosk/voskBgStatus.js'

// Объяснения диагностики: каждая ветка pickEngine имеет понятный человеческий текст и подсказку
const NOW = new Date(2026, 9, 10, 14, 0, 0).getTime()
const READY = { cached: true, loaded: true, loading: false, libReady: true, broken: false, brokenUntil: 0, brokenWhy: '' }
const INFO = { users: 1, warmAt: NOW - 3000, loadedAt: NOW - 20000, freeAt: 0, lastError: '', lastLoad: { libMs: 700, modelMs: 1200 }, now: NOW }
const ctx = (over = {}) => ({ mode: 'auto', phrase: 'I have two cats', snap: READY, info: INFO, bg: INITIAL_STATUS, inCache: false, bgStopped: false, ...over })
const pick = (c) => pickEngine({ mode: c.mode, phrase: c.phrase, ...c.snap, now: NOW })
const explain = over => { const c = ctx(over); return explainPick(pick(c), c) }

describe('explainPick: все ветки pickEngine', () => {
  it('ready → ✅ Vosk', () => {
    expect(explain()).toMatchObject({ level: 'ok' }); expect(explain().text).toMatch(/^Vosk/)
  })
  it('mode-system → ⚠️ с подсказкой, где сменить', () => {
    const r = explain({ mode: 'system' })
    expect(r.level).toBe('warn'); expect(r.text).toContain('«Только системное»'); expect(r.hint).toContain('Админ → Голос')
  })
  it('phrase → ⚠️ с причиной: сложное число / не латиница / пустая', () => {
    expect(explain({ phrase: 'Call 555-1234' }).text).toContain('число, которого Vosk не умеет')
    expect(explain({ phrase: 'Привет' }).text).toContain('не только латинские буквы')
    expect(explain({ phrase: '' }).text).toContain('пустая')
  })
  it('broken → ❌ время «до …» и причина сбоя', () => {
    const until = new Date(2026, 9, 10, 14, 32).getTime()
    const r = explain({ snap: { ...READY, broken: true, brokenUntil: until, brokenWhy: 'vosk-error: нет чанка' } })
    expect(r.level).toBe('bad'); expect(r.text).toContain('до 14:32'); expect(r.text).toContain('нет чанка')
  })
  it('no-model → ❌ и состояние фоновой загрузки (качается / ждёт / ошибка / остановлена / не запускалась)', () => {
    const snap = { ...READY, cached: false, loaded: false, libReady: false }
    const bgs = [
      [{ ...INITIAL_STATUS, state: 'downloading', pct: 42 }, 'скачивается — качается 42%'],
      [{ ...INITIAL_STATUS, state: 'waiting', reason: 'feed' }, 'ждёт — ждёт (причина: лента)'],
      [{ ...INITIAL_STATUS, state: 'error', error: 'HTTP 404', attempt: 2 }, 'сломалась — ошибка: HTTP 404'],
      [{ ...INITIAL_STATUS, state: 'off' }, 'остановлена админом'],
      [INITIAL_STATUS, 'ещё не запускалась'],
    ]
    for (const [bg, part] of bgs) {
      const r = explain({ snap, bg })
      expect(r.level).toBe('bad'); expect(r.text).toContain('модели Vosk ещё нет в кэше'); expect(r.text, part).toContain(part)
    }
    expect(explain({ snap, bg: INITIAL_STATUS, bgStopped: true }).text).toContain('остановлена админом')
  })
  it('loading → ⚠️ сколько секунд идёт загрузка в память; «Только Vosk» предупреждает про тап', () => {
    const snap = { ...READY, loaded: false, libReady: false, loading: true }
    expect(explain({ snap }).text).toContain('идёт 3 с')
    expect(explain({ snap, mode: 'vosk' }).text).toContain('Только Vosk')
  })
  it('not-loaded → ⚠️: кэш не проверен / в кэше, но прогрев не идёт / панель закрыта / есть ошибка → ❌', () => {
    const snap = { ...READY, loaded: false, libReady: false }
    expect(explain({ snap: { ...snap, cached: null } }).text).toContain('ещё не проверен')
    expect(explain({ snap }).text).toContain('прогрев не запустился')
    expect(explain({ snap, info: { ...INFO, users: 0 } }).text).toContain('панель не держит прогрев')
    const err = explain({ snap, info: { ...INFO, lastError: 'нет чанка' } })
    expect(err.level).toBe('bad'); expect(err.text).toContain('нет чанка')
  })
  it('no-lib → ❌ библиотека не загрузилась', () => {
    expect(explainPick({ engine: 'system', reason: 'no-lib' }, ctx()).text).toContain('библиотека Vosk')
  })
  it('у КАЖДОЙ причины pickEngine есть объяснение (не «причина не определена») и подсказка у не-ready', () => {
    for (const reason of Object.keys(PICK_REASON)) {
      if (reason === 'ready') continue
      const r = explainPick({ engine: 'system', reason }, ctx({ snap: { ...READY, cached: false, broken: true, brokenUntil: NOW + 1000 } }))
      expect(r.text, reason).not.toContain('причина не определена'); expect(r.hint, reason).toBeTruthy()
    }
    expect(explainPick({ engine: 'system', reason: 'неизвестная' }, ctx()).text).toContain('причина не определена')
  })
})

describe('остальные объяснения', () => {
  it('фоновая загрузка: в кэше важнее всего', () => {
    expect(explainBackground({ ...INITIAL_STATUS, state: 'waiting', reason: 'video' }, true)).toMatchObject({ level: 'ok' })
    expect(explainBackground({ ...INITIAL_STATUS, state: 'other' }).level).toBe('info')
    expect(explainBackground({ ...INITIAL_STATUS, state: 'check' }).text).toContain('проверяет')
  })
  it('модель в памяти: загружена N с назад + выгрузится через N с / держится; грузится; нет', () => {
    expect(explainMemory({ snap: READY, info: INFO }).text).toBe('да — загружена 20 с назад; держится, пока открыта панель')
    expect(explainMemory({ snap: READY, info: { ...INFO, users: 0, freeAt: NOW + 12000 } }).text).toContain('выгрузится через 12 с')
    expect(explainMemory({ snap: { ...READY, loaded: false, loading: true }, info: INFO }).level).toBe('warn')
    expect(explainMemory({ snap: { ...READY, loaded: false }, info: { ...INFO, users: 0 } }).text).toContain('панель закрыта')
    expect(explainMemory({ snap: { ...READY, cached: false, loaded: false }, info: INFO }).level).toBe('info')
  })
  it('панель: запасной режим (unsupported / cant_speak / denied) ❌, пояснение ℹ️, иначе ✅', () => {
    expect(explainGate({ action: 'fallback', reason: 'unsupported' })).toMatchObject({ level: 'bad' })
    expect(explainGate({ action: 'fallback', reason: 'unsupported' }).text).toContain('Vosk при этом не греется')
    expect(explainGate({ action: 'fallback', reason: 'cant_speak' }).text).toContain('Я не могу говорить')
    expect(explainGate({ action: 'fallback', reason: 'browser' }).text).toContain('Firefox')
    expect(explainGate({ action: 'explain', kind: 'full' }).level).toBe('info')
    expect(explainGate({ action: 'listen' }).level).toBe('ok')
  })
  it('форматы: время «14:32», секунды «1,2 с»', () => {
    expect(clock(new Date(2026, 9, 10, 9, 5).getTime())).toBe('09:05'); expect(sec(1234)).toBe('1,2 с'); expect(sec(-5)).toBe('0,0 с')
  })
})

describe('среда телефона', () => {
  it('браузер по User-Agent: Safari / Chrome / Firefox / другой (на iPhone CriOS и FxiOS)', () => {
    const ua = {
      safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
      chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15',
      firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      edge: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 EdgA/120.0',
    }
    expect(browserName(ua.safari)).toBe('Safari'); expect(browserName(ua.chromeIos)).toBe('Chrome'); expect(browserName(ua.chromeAndroid)).toBe('Chrome')
    expect(browserName(ua.firefoxIos)).toBe('Firefox'); expect(browserName(ua.firefox)).toBe('Firefox'); expect(browserName(ua.edge)).toBe('другой'); expect(browserName('')).toBe('другой')
    expect(platformName(ua.safari)).toBe('iOS 17.2'); expect(platformName(ua.chromeAndroid)).toBe('Android 14'); expect(platformName(ua.firefox)).toBe('компьютер'); expect(platformName('')).toBe('неизвестно')
  })
  it('readDiagEnv безопасен без окна и браузерных API', () => {
    const e = readDiagEnv({ navigator: { onLine: false, userAgent: 'x', connection: { saveData: true, effectiveType: '3g' } } })
    expect(e).toMatchObject({ online: false, saveData: true, netType: '3g', secure: false, cacheApi: false })
    expect(() => readDiagEnv({})).not.toThrow()
  })
})

describe('строки окна и отчёт', () => {
  const env = { recognition: true, audioSession: true, sessionType: 'play-and-record', sessionApi: true, online: true, saveData: false, netType: '4g', browser: 'Safari', platform: 'iOS 17.2', pwa: true, secure: true, cacheApi: true, ua: 'UA-TEST' }
  const base = () => {
    const c = ctx()
    return { ...c, now: NOW, version: '3.2.1914', pick: pick(c), cache: { size: 41943040, savedAt: NOW - 60000 }, cacheApi: true, urlSource: 'env', urlHost: 'models.example.com',
      attempt: null, gate: { action: 'listen' }, env, perm: 'granted' }
  }
  it('все группы и метки на месте; строки «статус — пояснение»', () => {
    const rows = buildDiagRows(base())
    expect(new Set(rows.map(r => r.group))).toEqual(new Set(Object.keys(GROUP_TITLE)))
    expect(rows.find(r => r.id === 'next').level).toBe('ok')
    expect(rows.find(r => r.id === 'cache').text).toContain('40,0 МБ')
    expect(rows.find(r => r.id === 'url').text).toContain('VITE_VOSK_MODEL_URL')
    expect(rows.find(r => r.id === 'mic')).toMatchObject({ level: 'ok', text: 'разрешён' })
    expect(rows.find(r => r.id === 'browser').text).toBe('Safari, iOS 17.2, режим PWA (с экрана «Домой»)')
    expect(rows.find(r => r.id === 'version').text).toBe('3.2.1914')
    expect(rows.every(r => MARK[r.level] && r.label && r.text)).toBe(true)
  })
  it('плохая среда: офлайн, нет Cache Storage, отказ микрофона, нет распознавания, пауза после сбоя', () => {
    const c = { ...base(), cache: null, cacheApi: false, perm: 'denied', env: { ...env, online: false, recognition: false, audioSession: false },
      snap: { ...READY, cached: false, loaded: false, libReady: false, broken: true, brokenUntil: NOW + 60000, brokenWhy: 'x' } }
    c.pick = pick(c)
    const rows = Object.fromEntries(buildDiagRows(c).map(r => [r.id, r]))
    expect(rows.cache.level).toBe('bad'); expect(rows.cache.text).toContain('Cache Storage')
    expect(rows.mic.level).toBe('bad'); expect(rows.net.level).toBe('bad'); expect(rows.sys.level).toBe('bad'); expect(rows.session.level).toBe('warn')
    expect(rows.broken.level).toBe('bad'); expect(rows.next.level).toBe('bad')
  })
  it('последняя попытка: нет / идёт / успех Vosk / тишина / сбой', () => {
    const at = (a) => buildDiagRows({ ...base(), attempt: a }).find(r => r.id === 'last')
    expect(at(null).text).toContain('ещё не было попыток')
    const a = { n: 2, engine: 'vosk', startedAt: NOW, status: 'done', heard: 'i have two cats', micMs: 300, firstWordMs: 1200, resultMs: 2800, stop: 'auto', error: null }
    expect(at({ ...a, status: 'run', stop: null }).text).toContain('идёт')
    expect(at(a)).toMatchObject({ level: 'ok' })
    expect(at(a).text).toContain('«i have two cats»'); expect(at(a).text).toContain('первые слова через 1,2 с'); expect(at(a).text).toContain('итог через 2,8 с'); expect(at(a).text).toContain('остановилась сама')
    expect(at({ ...a, engine: 'system' }).level).toBe('warn')
    expect(at({ ...a, status: 'failed', stop: 'silence', heard: '' }).level).toBe('warn')
    expect(at({ ...a, status: 'failed', stop: 'error', error: 'vosk-error' })).toMatchObject({ level: 'bad' })
  })
  it('отчёт: заголовки групп, метки, подсказки, UA', () => {
    const rep = diagReport(buildDiagRows({ ...base(), pick: { engine: 'system', reason: 'mode-system' }, mode: 'system' }), { now: NOW, ua: 'UA-TEST' })
    expect(rep.split('\n')[0]).toBe('Диагностика «Сказать фразу», 14:00')
    for (const t of Object.values(GROUP_TITLE)) expect(rep).toContain(`${t}:`)
    expect(rep).toContain('⚠️ Следующая попытка — Системное'); expect(rep).toContain('Сменить: Админ → Голос'); expect(rep).toContain('✅ Модель в кэше'); expect(rep).toContain('UA: UA-TEST')
  })
})

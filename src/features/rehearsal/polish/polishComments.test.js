import { describe, it, expect } from 'vitest'
import { listComments, addComment, clearComments, countComments, makeComment, summaryText, buildExport, commentsFile, commentsFileName, COMMENTS_KEY, MAX_COMMENTS, EXPORT_VERSION } from './rehearsalComments.js'
import { snapshotScreen, stageOf, pillsOf, screenLine } from './commentSnapshot.js'
import { snapshotSettings, settingsLine } from './commentSettings.js'
import { logLine, lastLogLines, LOG_LINES, LOG_LINE_MAX } from './commentLog.js'

// Комментарии владельца к этапам репетиции: хранение (по этапу, не больше 50), снимок экрана и настроек, строки журнала, экспорт с краткой сводкой
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const broken = { getItem() { throw new Error('p') }, setItem() { throw new Error('p') }, removeItem() { throw new Error('p') } }

const SCREEN = {
  version: '3.3.71', phrase: "I'm | trying | to learn",
  stage: { act: 'build', actTitle: 'Сборка с конца', name: 'run', sid: 'build-1', type: 'student', idx: 9, phase: 'student' },
  step: { id: 'build-1', text: 'trying to learn', parts: [1, 2], reps: 1 },
  pills: [{ lane: 1, text: 'trying', fill: 0.45, state: 'наливается' }, { lane: 2, text: 'to learn', fill: 0, state: 'летит' }],
  lanes: [{ lane: 1, text: 'trying', on: true }], cat: 'Давай ещё раз', plate: '', tag: '', mic: 'listening', listener: { seq: 1, misses: 0, heard: 'Услышал: «trying»' },
}
const SETTINGS = { version: '3.3.71', audioSession: 'play-and-record', audioSessionMode: 'auto', micHold: 'none', micProcessing: false, rewardSound: 'meow', rewardVolume: 0.5, pillSafe: false, tapMode: true, voiceRate: 1, lite: false, mic: 'live', vosk: 'готов (модель в памяти)' }
const mk = (text, o = {}) => makeComment({ text, snap: SCREEN, settings: SETTINGS, t: 12345.6, dump: null, now: new Date('2026-10-30T10:00:00Z'), ...o })

describe('хранение комментариев по этапам', () => {
  it('ключ — pithy_rh_comments_v1:<этап>; у каждого этапа свой список; старые первыми', () => {
    const s = memStore()
    addComment('build', mk('раз'), s); addComment('build', mk('два'), s); addComment('read', mk('читка'), s)
    expect(Object.keys(s.m).sort()).toEqual([`${COMMENTS_KEY}:build`, `${COMMENTS_KEY}:read`])
    expect(listComments('build', s).map(c => c.text)).toEqual(['раз', 'два'])
    expect(countComments('read', s)).toBe(1); expect(countComments('blind', s)).toBe(0)
  })
  it('не больше 50 на этап: 51-й вытесняет самый старый, остальные этапы не трогаются', () => {
    const s = memStore()
    addComment('read', mk('чужой'), s)
    let last
    for (let i = 1; i <= MAX_COMMENTS + 2; i++) last = addComment('build', mk(`к${i}`), s)
    const list = listComments('build', s)
    expect(list).toHaveLength(MAX_COMMENTS)
    expect(list[0].text).toBe('к3'); expect(list.at(-1).text).toBe(`к${MAX_COMMENTS + 2}`)
    expect(last).toEqual({ ok: true, count: MAX_COMMENTS, dropped: 1 })
    expect(countComments('read', s)).toBe(1)
  })
  it('очистка стирает только свой этап', () => {
    const s = memStore()
    addComment('build', mk('а'), s); addComment('read', mk('б'), s)
    clearComments('build', s)
    expect(countComments('build', s)).toBe(0); expect(countComments('read', s)).toBe(1)
  })
  it('нет хранилища / мусор / приватный режим: пусто, запись возвращает ok: false, очистка не падает', () => {
    expect(listComments('build', broken)).toEqual([]); expect(listComments('build', null)).toEqual([])
    expect(listComments('build', memStore({ [`${COMMENTS_KEY}:build`]: '{не json' }))).toEqual([])
    expect(listComments('build', memStore({ [`${COMMENTS_KEY}:build`]: '{"a":1}' }))).toEqual([])
    expect(addComment('build', mk('x'), broken)).toEqual({ ok: false, count: 0, dropped: 0 })
    expect(() => clearComments('build', broken)).not.toThrow()
  })
})

describe('запись комментария', () => {
  it('поля: at (ISO), t (мс от старта до тапа, целое), stage, text (без пробелов по краям), screen, settings, changes, log', () => {
    const c = mk('  хрипит  ', { changes: [{ t: 900, key: 'session', label: 'аудиосессия', from: 'auto', to: 'phases' }] })
    expect(c).toMatchObject({ at: '2026-10-30T10:00:00.000Z', t: 12346, text: 'хрипит', stage: SCREEN.stage, screen: SCREEN, settings: SETTINGS, log: [] })
    expect(c.changes).toHaveLength(1)
    expect(mk('x', { t: -5 }).t).toBe(0)
  })
  it('в log попадают последние 40 строк журнала без уровня голоса', () => {
    const events = []
    for (let i = 0; i < 100; i++) events.push(i % 2 ? { t: i * 10, type: 'level', v: 0.1 } : { t: i * 10, type: 'pill', kind: 'snap', pill: i })
    const c = mk('x', { dump: { events } })
    expect(c.log).toHaveLength(LOG_LINES)
    expect(c.log.every(l => !l.includes(' level'))).toBe(true)
    expect(c.log.at(-1)).toBe('0.98 с pill snap {"pill":98}')
  })
})

describe('строки журнала', () => {
  it('«секунды тип вид {данные}»; длинная строка режется с многоточием; нет журнала — пусто', () => {
    expect(logLine({ t: 1234, type: 'event', kind: 'pause', why: 'comment' })).toBe('1.23 с event pause {"why":"comment"}')
    expect(logLine({ t: 5, type: 'note', kind: 'dictor' })).toBe('0.01 с note dictor')
    const long = logLine({ t: 1, type: 'final', text: 'x'.repeat(500) })
    expect(long).toHaveLength(LOG_LINE_MAX); expect(long.endsWith('…')).toBe(true)
    expect(lastLogLines(null)).toEqual([]); expect(lastLogLines({ events: 'нет' })).toEqual([])
  })
})

describe('снимок экрана', () => {
  const el = (attrs, fill) => ({ getAttribute: k => (k in attrs ? attrs[k] : null), querySelector: () => ({ style: { getPropertyValue: () => fill } }) })
  const root = { querySelectorAll: sel => (sel === '[data-pill][data-held]' ? [el({ 'data-lane': '2', 'data-lock': '1' }, '1.000'), el({ 'data-lane': '1', 'data-live': '1' }, '0.454'), el({ 'data-lane': '0', 'data-fail': '1' }, ''), el({ 'data-lane': '1' }, '0')] : []) }
  const f = {
    stage: 'run', idx: 9, phase: 'student', mic: 'listening', seq: [0], misses: 2, note: 'Услышал: «tree»', catLine: 'Давай', plate: 'Теперь твоя очередь', rh: { tag: 'Обычно' },
    labels: [{ text: '', on: false }, { text: 'trying', on: true }, { text: 'to learn', on: false }],
    stageObj: { type: 'student', act: 'build', sid: 'build-1', step: { id: 'build-1', text: 'trying to learn', parts: [1, 2], reps: [{}] } },
  }
  it('пилюли: дорожка, текст куска, заполнение, состояние (не успел / принята / наливается / летит), слева направо', () => {
    expect(pillsOf(root, ['I\'m', 'trying', 'to learn'])).toEqual([
      { lane: 0, text: "I'm", fill: 0, state: 'не успел' },
      { lane: 1, text: 'trying', fill: 0.45, state: 'наливается' },
      { lane: 1, text: 'trying', fill: 0, state: 'летит' },
      { lane: 2, text: 'to learn', fill: 1, state: 'принята' },
    ])
    expect(pillsOf(null)).toEqual([]); expect(pillsOf({})).toEqual([])
  })
  it('стадия ступени ученика сборки: этап «Сборка с конца», ключ журнала, ступень, подписи, кот, плашка, ярлык, микрофон и слушатель', () => {
    const s = snapshotScreen({ f, root, chunks: ["I'm", 'trying', 'to learn'], phrase: "I'm | trying | to learn", version: '3.3.71' })
    expect(s.stage).toEqual({ act: 'build', actTitle: 'Сборка с конца', name: 'run', sid: 'build-1', type: 'student', idx: 9, phase: 'student' })
    expect(s.step).toEqual({ id: 'build-1', text: 'trying to learn', parts: [1, 2], reps: 1 })
    expect(s.pills).toHaveLength(4)
    expect(s.lanes).toEqual([{ lane: 1, text: 'trying', on: true }, { lane: 2, text: 'to learn', on: false }])
    expect(s).toMatchObject({ cat: 'Давай', plate: 'Теперь твоя очередь', tag: 'Обычно', mic: 'listening', version: '3.3.71', listener: { seq: 1, misses: 2, heard: 'Услышал: «tree»' } })
  })
  it('слово разминки: текст пилюли берётся с дорожки слова (step.chunks), в шапке есть слово', () => {
    const w = { ...f, stageObj: { type: 'warmup', act: 'warmup', sid: 'warmup-0', word: { text: 'trying', lane: 1 }, step: { id: 'warmup-0', text: 'trying', parts: [1], chunks: ['', 'trying', ''], reps: [{}] } } }
    const s = snapshotScreen({ f: w, root: { querySelectorAll: () => [el({ 'data-lane': '1' }, '0.2')] }, chunks: ["I'm", 'trying', 'to learn'] })
    expect(s.stage).toMatchObject({ act: 'warmup', actTitle: 'Разминка', sid: 'warmup-0', type: 'warmup' })
    expect(s.pills[0].text).toBe('trying'); expect(s.step.word).toBe('trying')
  })
  it('вступление (drop / lanes) — этап «Заставка»; финал — этап по умолчанию; без плана и без данных — не падает', () => {
    expect(stageOf({ stage: 'drop', phase: 'drop', idx: 0 })).toMatchObject({ act: 'intro', actTitle: 'Заставка', name: 'drop', sid: '' })
    expect(stageOf({ stage: 'lanes', idx: 0 }).act).toBe('intro')
    expect(stageOf({ stage: 'reveal', idx: 7 }, 'take').act).toBe('take')
    const s = snapshotScreen({ f: { stage: 'drop' } })
    expect(s).toMatchObject({ step: null, pills: [], lanes: [], cat: '', plate: '', tag: '', mic: '', listener: { seq: 0, misses: 0, heard: '' } })
  })
  it('screenLine: одной строкой — стадия, ступень, пилюли, подписи, кот, плашка, микрофон и слушатель', () => {
    const line = screenLine(SCREEN)
    expect(line).toContain('стадия run/student (build-1)'); expect(line).toContain('ступень «trying to learn» ×1')
    expect(line).toContain('2:«trying» наливается 45%'); expect(line).toContain('подписи «trying»*'); expect(line).toContain('кот: «Давай ещё раз»')
    expect(line).toContain('микрофон listening, принято 1, промахов 0, Услышал: «trying»')
    expect(screenLine({ pills: [], listener: {} })).toContain('пилюль нет')
  })
})

describe('снимок настроек', () => {
  const readers = { hud: () => ({ audioSession: 'play-and-record', mic: 'live', vosk: 'готов', version: '9.9.9' }), sessionMode: () => 'auto', micHold: () => 'close', micProcessing: () => true, rewardSound: () => 'meow', rewardVolume: () => 0.35, pillSafe: () => true, tapMode: () => false, voiceRate: () => 0.9, lite: () => false }
  it('всё, от чего зависит «хрип»: тип сессии и режим, дорожка на речь Пита, обработка микрофона, награда, слои, тап, голос, lite, дорожка и Vosk', () => {
    expect(snapshotSettings(readers)).toEqual({ version: '9.9.9', audioSession: 'play-and-record', audioSessionMode: 'auto', micHold: 'close', micProcessing: true, rewardSound: 'meow', rewardVolume: 0.35, pillSafe: true, tapMode: false, voiceRate: 0.9, lite: false, mic: 'live', vosk: 'готов' })
  })
  it('сбой одного читателя не ломает снимок', () => {
    const s = snapshotSettings({ ...readers, micHold: () => { throw new Error('x') }, hud: () => { throw new Error('y') } })
    expect(s.micHold).toBeNull(); expect(s.audioSession).toBe('—'); expect(s.audioSessionMode).toBe('auto')
  })
  it('settingsLine читается одной строкой', () => {
    const line = settingsLine(SETTINGS)
    expect(line).toContain('аудиосессия play-and-record (режим «auto»)'); expect(line).toContain('дорожка на речь Пита «none»'); expect(line).toContain('обработка микрофона выкл'); expect(line).toContain('награда «meow» 50%'); expect(line).toContain('тап вместо речи вкл')
  })
})

describe('экспорт', () => {
  const comments = [mk('первый'), mk('второй хрипит', { changes: [{ t: 800, key: 'proc', label: 'обработка микрофона', from: 'вкл', to: 'выкл' }] })]
  it('формат: version, act, actTitle, appVersion, exportedAt, summary (текстом), comments', () => {
    const e = buildExport('build', comments, { version: '3.3.71', now: new Date('2026-10-30T12:00:00Z') })
    expect(Object.keys(e)).toEqual(['version', 'act', 'actTitle', 'appVersion', 'exportedAt', 'summary', 'comments'])
    expect(e).toMatchObject({ version: EXPORT_VERSION, act: 'build', actTitle: 'Сборка с конца', appVersion: '3.3.71', exportedAt: '2026-10-30T12:00:00.000Z' })
    expect(e.comments).toBe(comments)
  })
  it('сводка читается без разбора JSON: этап, число, по комментарию — время, этап/ключ, текст, экран, настройки, что менял', () => {
    const t = summaryText('build', comments, { version: '3.3.71', exportedAt: '2026-10-30T12:00:00.000Z' })
    const lines = t.split('\n')
    expect(lines[0]).toBe('# Комментарии к этапу «Сборка с конца», v3.3.71: 2 шт., экспорт 2026-10-30T12:00:00.000Z')
    expect(t).toContain('1. [12.3 с · Сборка с конца / build-1] первый')
    expect(t).toContain('2. [12.3 с · Сборка с конца / build-1] второй хрипит')
    expect(t).toContain('   Экран: стадия run/student (build-1)'); expect(t).toContain('   Настройки: аудиосессия play-and-record')
    expect(t).toContain('   Менял в комментарии: обработка микрофона → выкл')
    expect(summaryText('read', [mk('')])).toContain('(без текста)')
  })
  it('файл: rehearsal-<этап>-comments.json, JSON разбирается обратно, формат как у buildDebugFile (name, json, blob, size)', async () => {
    const file = commentsFile('build', comments, { version: '3.3.71', now: new Date('2026-10-30T12:00:00Z') })
    expect(file.name).toBe('rehearsal-build-comments.json'); expect(commentsFileName('take')).toBe('rehearsal-take-comments.json')
    const back = JSON.parse(file.json)
    expect(back.comments).toHaveLength(2); expect(back.summary).toContain('# Комментарии'); expect(back.comments[1].changes[0].to).toBe('выкл')
    expect(file.size).toBe(file.json.length)
    expect(file.blob.type).toBe('application/json'); expect(await file.blob.text()).toBe(file.json)
  })
})

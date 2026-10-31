import { describe, it, expect } from 'vitest'
import { diagnoseFirstLine, silentDiagLines, gameBase, CAUSE_TITLE, WINDOW_MS } from './wordLaneSilentDiag.js'
import { OWNER_WARMUP_LOG, parseGameLog } from './wordLaneOwnerLog.fixture.js'
import { buildDebugFile } from './wordLaneDebugExport.js'
import { createWordLaneDebug } from './wordLaneDebug.js'
import { buildGameLogSection } from '../../gameLogSection.js'

// «Почему первая реплика тихая»: по одной проверке на каждую причину, шкала первых 15 с, попадание в файл отладки и в текстовый журнал
const mk = (t, kind, d = {}) => ({ t, type: 'probe', kind, ...d })
const startMarks = ({ activation = true, tapWait = false, wakeT = 1200 } = {}) => [
  mk(-2000, 'start-mark', { name: 'tap', sinceTap: 0 }),
  mk(-1700, 'start-mark', { name: 'mic', sinceTap: 300, mic: 'granted' }),
  mk(-1000, 'start-mark', { name: 'settle', sinceTap: 1000, waitedMs: 700, interrupts: 1, ctx: 'running', activation }),
  mk(-2000 + wakeT, 'start-mark', { name: 'wake', sinceTap: wakeT, ok: true }),
  ...(tapWait ? [mk(-2000 + wakeT + 5, 'start-mark', { name: 'tap-wait', why: 'жест истёк до прогрева' })] : []),
  mk(-2000 + 3500, 'start-mark', { name: 'ready', sinceTap: 3500, words: 'ready' }),
]
const line = (t, over = {}) => ({ t, type: 'event', kind: 'cat-voice', id: 'rh_start', source: 'slot', slot: { rs: 4, prepared: true, interrupted: false }, play: 'ok', activation: 'alive', ...over })

describe('diagnoseFirstLine: причины', () => {
  it('play() ok и playing было — «звук шёл, но тихо (ducking)»: причина не в коде', () => {
    const d = diagnoseFirstLine([...startMarks(), line(1800)])
    expect(d.cause).toBe('ducking')
    expect(d.title).toBe(CAUSE_TITLE.ducking)
    expect(d.text).toContain('вне кода')
    expect(d.firstLine).toMatchObject({ id: 'rh_start', ms: 3800, play: 'ok' })
  })

  it('жест истёк до прогрева (settle activation=false, ждали касания), прогрева в жесте до реплики не было, play() отклонён — «жест истёк до прогрева»; вторичные признаки сохранены', () => {
    const ev = [...startMarks({ activation: false, tapWait: true }), line(1800, { play: 'rejected', error: 'NotAllowedError', activation: 'expired', slot: { rs: 0, prepared: false, interrupted: false, wokeErr: 'NotAllowedError' } })]
    const d = diagnoseFirstLine(ev)
    expect(d.cause).toBe('gesture-expired')
    expect(d.causes).toEqual(['gesture-expired', 'slot-not-ready', 'play-rejected'])
    expect(d.timeline.some(t => t.what.includes('жест истёк — ждём касания'))).toBe(true)
  })

  it('жест истёк, но до реплики был повторный прогрев в живом жесте — это уже не «жест истёк»', () => {
    const ev = [...startMarks({ activation: false, tapWait: true }), mk(900, 'audio-warm', { step: 'rewarm', why: 'касание', activation: true }), line(1800, { play: 'no-playing' })]
    expect(diagnoseFirstLine(ev).cause).toBe('play-not-started')
  })

  it('слот не готов к реплике: ждали слот до 1,5 с и говорил голос системы / слот не подготовлен — «слот не готов к реплике»', () => {
    const synth = diagnoseFirstLine([...startMarks(), line(1800, { source: 'synth', waitedMs: 1500, why: 'слот не успел за 1500 мс', slot: { rs: 0, prepared: false }, play: 'ok' })])
    expect(synth.cause).toBe('ducking') // голос системы заговорил (start пришёл) — код отработал
    const notReady = diagnoseFirstLine([...startMarks(), line(1800, { slot: { rs: 0, prepared: false, interrupted: null }, play: 'no-playing' })])
    expect(notReady.cause).toBe('slot-not-ready')
    expect(notReady.causes).toEqual(['slot-not-ready', 'play-not-started'])
    const synthSilent = diagnoseFirstLine([...startMarks(), line(1800, { source: 'synth', waitedMs: 1500, slot: { prepared: false }, play: 'no-playing' })])
    expect(synthSilent.cause).toBe('slot-not-ready')
  })

  it('прерывание аудиосессии после прогрева (слот разбужен, потом iOS прервал; повторного прогрева не было) — «прерывание после прогрева»', () => {
    const ev = [...startMarks(), mk(-500, 'audio-interrupt', { n: 2, ctx: 'interrupted', activation: false }), line(1800, { play: 'no-playing', slot: { rs: 4, prepared: true, interrupted: true } })]
    const d = diagnoseFirstLine(ev)
    expect(d.cause).toBe('interrupted-after-warm')
    expect(d.timeline.some(t => t.what.includes('прерывание аудиосессии №2'))).toBe(true)
    const healed = diagnoseFirstLine([...startMarks(), mk(-500, 'audio-interrupt', { n: 2 }), mk(300, 'audio-warm', { step: 'rewarm', why: 'прерывание', activation: true }), line(1800, { play: 'no-playing' })])
    expect(healed.causes).not.toContain('interrupted-after-warm')
  })

  it('play() отклонён без других признаков — «play() отклонён» с именем ошибки в первой реплике', () => {
    const d = diagnoseFirstLine([...startMarks(), line(1800, { play: 'rejected', error: 'NotAllowedError' })])
    expect(d.cause).toBe('play-rejected')
    expect(d.firstLine.error).toBe('NotAllowedError')
    expect(silentDiagLines(d).join('\n')).toContain('NotAllowedError')
  })

  it('play() принят, а playing не пришло — «play() принят, но звук не заиграл»', () => {
    expect(diagnoseFirstLine([...startMarks(), line(1800, { play: 'no-playing' })]).cause).toBe('play-not-started')
    expect(diagnoseFirstLine([...startMarks(), line(1800, { play: 'pending' })]).cause).toBe('play-not-started')
  })

  it('у реплики нет озвучки; реплик не было вовсе; странные признаки — unknown', () => {
    expect(diagnoseFirstLine([...startMarks(), line(1800, { source: 'none', slot: null, play: 'n/a', why: 'у реплики нет озвучки (url)' })]).cause).toBe('no-voice')
    expect(diagnoseFirstLine(startMarks()).cause).toBe('no-lines')
    expect(diagnoseFirstLine([]).cause).toBe('no-lines')
    expect(diagnoseFirstLine([...startMarks(), line(1800, { play: 'weird' })]).cause).toBe('unknown')
  })

  it('«первая» — по времени; реплики позже 15 с от тапа в разбор не входят', () => {
    const d = diagnoseFirstLine([...startMarks(), line(1800, { id: 'a' }), line(1800 + 4000, { id: 'b', play: 'rejected' }), line(-2000 + WINDOW_MS + 500, { id: 'late' })])
    expect(d.lines.map(l => l.id)).toEqual(['a', 'b'])
    expect(d.firstLine.id).toBe('a')
  })
})

describe('временная шкала и вывод в файл / журнал', () => {
  const events = [...startMarks({ activation: false, tapWait: true }), mk(100, 'plate-sound', { play: 'ok' }), line(1800, { play: 'rejected', error: 'NotAllowedError' })]

  it('шкала: тап 0, микрофон, settle, прогрев, ожидание касания, готово, реплика с итогом — по порядку, в мс от тапа', () => {
    const tl = diagnoseFirstLine(events).timeline
    expect(tl[0]).toEqual({ ms: 0, what: 'тап «Начать»' })
    const texts = tl.map(t => t.what)
    expect(texts).toEqual(expect.arrayContaining(['микрофон: granted', expect.stringContaining('settle: ждали 700 мс, прерываний 1, контекст running, жест истёк'), 'прогрев звука запущен (wakeGameAudio)', expect.stringContaining('ждём касания'), 'прогрев закончен, озвучка слов: ready', 'реплика rh_start: слот библиотеки, play() → rejected (NotAllowedError)', 'плашка: play() → ok']))
    expect(tl.map(t => t.ms)).toEqual([...tl.map(t => t.ms)].sort((a, b) => a - b))
    expect(tl.find(t => t.what.startsWith('реплика')).ms).toBe(3800)
  })

  it('«Скачать отладку»: файл содержит раздел silentFirstLine с выводом, шкалой и готовым текстом', () => {
    const log = createWordLaneDebug({ enabled: true, now: () => 5000 })
    events.forEach(e => { const { t, type, kind, ...d } = e; log.ext(5000 + t, type, kind, d) })
    const file = buildDebugFile({ log })
    const body = JSON.parse(file.json)
    expect(body.silentFirstLine.cause).toBe('gesture-expired')
    expect(body.silentFirstLine.timeline.length).toBeGreaterThan(5)
    expect(body.silentFirstLine.textLines[0]).toBe('--- Почему первая реплика тихая ---')
    expect(body.silentFirstLine.textLines[1]).toContain('ЖЕСТ ИСТЁК ДО ПРОГРЕВА')
  })

  it('текстовый журнал плеера (раздел игры): вывод и шкала идут после шапки, до хронологии', () => {
    const out = buildGameLogSection({ startedAt: 'x', phrase: 'p', events, device: {} })
    const i = out.indexOf('--- Почему первая реплика тихая ---')
    expect(i).toBeGreaterThan(0)
    expect(out[i + 1]).toContain('ЖЕСТ ИСТЁК ДО ПРОГРЕВА')
    expect(out.some(l => l.includes('probe:start-mark'))).toBe(true) // шаги старта попадают и в хронологию
    expect(out.some(l => l.includes('probe:audio-interrupt') || l.includes('probe:plate-sound'))).toBe(true)
    expect(out.some(l => l.includes('event:cat-voice'))).toBe(true)
  })
})

describe('журнал владельца (iPhone, 3.3.75, «Разминка», режим A): синтез заглушил микрофон', () => {
  const events = parseGameLog(OWNER_WARMUP_LOG)

  it('фикстура разобрана: реплики, дорожка, отметки тапов прошлых игр', () => {
    expect(events.filter(e => e.kind === 'cat-voice').map(e => e.id)).toEqual(['rh_warmup', 'rh_warmup_miss'])
    expect(events.find(e => e.kind === 'cat-voice').slot).toMatchObject({ wokeErr: 'AbortError', hasUrl: true })
    expect(events.filter(e => e.kind === 'start-mark' && e.name === 'tap').map(e => e.t)).toEqual([-292508, -139313])
  })

  it('нулевая точка — тап ЭТОЙ игры (t реплики − sinceTap), а не первая отметка tap журнала: реплики находятся, шкала от того же тапа', () => {
    expect(gameBase(events)).toBe(11966 - 14198)
    const d = diagnoseFirstLine(events)
    expect(d.cause).not.toBe('no-lines')
    expect(d.lines.map(l => l.id)).toEqual(['rh_warmup', 'rh_warmup_miss'])
    expect(d.firstLine.ms).toBe(4012 - (11966 - 14198)) // 6244 мс от тапа (sinceTap в самой реплике — 6250)
    expect(Math.abs(d.firstLine.ms - 6250)).toBeLessThan(10)
    expect(d.timeline.every(t => t.ms >= -50 && t.ms <= WINDOW_MS)).toBe(true)
    expect(d.timeline.some(t => t.what.startsWith('реплика rh_warmup:'))).toBe(true)
    expect(d.timeline.some(t => t.what.includes('дорожка микрофона ЗАГЛУШЕНА'))).toBe(true)
  })

  it('причина synth-muted-mic: реплика голосом системы и в течение 3 с дорожка микрофона заглушена; цепочка с AbortError и длиной заглушения (unmute)', () => {
    const d = diagnoseFirstLine(events)
    expect(d.cause).toBe('synth-muted-mic')
    expect(d.title).toBe(CAUSE_TITLE['synth-muted-mic'])
    expect(d.causes).toContain('slot-not-ready')
    expect(d.causes).not.toContain('ducking') // play=ok у синтеза — не «тихо из-за ducking»: микрофон глох
    expect(d.detail).toContain('слот не готов к реплике')
    expect(d.detail).toContain('пробуждение слота прервано (AbortError)')
    expect(d.detail).toContain('ушли в синтез')
    expect(d.detail).toContain('заглушил микрофон на 11.8 с')
    const text = silentDiagLines(d).join('\n')
    expect(text).toContain('Цепочка: слот не готов к реплике')
    expect(text).not.toContain('РЕПЛИК КОТА В ПЕРВЫЕ 15 С НЕ БЫЛО')
  })

  it('озвучка не скачалась за 2,5 с — отметка ready words=timeout ЭТОЙ игры попадает в цепочку; без отметки — причина слота из самой реплики', () => {
    const ready = { t: 4012 - 6250 + 4172, type: 'probe', kind: 'start-mark', name: 'ready', words: 'timeout' }
    expect(diagnoseFirstLine([...events, ready]).detail).toContain('слот не готов к реплике (озвучка не скачалась за 2,5 с)')
    expect(diagnoseFirstLine(events).detail).toContain('слот не успел за 1500 мс')
  })

  it('синтез без заглушения дорожки (mute позже 3 с или нет вовсе) — не synth-muted-mic; mute до реплики не считается', () => {
    const noMute = events.filter(e => e.kind !== 'track')
    expect(diagnoseFirstLine(noMute).cause).toBe('ducking')
    const late = [...noMute, { t: 4012 + 3500, type: 'probe', kind: 'track', event: 'mute' }]
    expect(diagnoseFirstLine(late).cause).toBe('ducking')
  })

  it('дорожка не вернулась до конца журнала — так и пишется', () => {
    const d = diagnoseFirstLine(events.filter(e => !(e.kind === 'track' && e.event === 'unmute')))
    expect(d.detail).toContain('и она не вернулась до конца журнала')
  })

  it('версия без синтеза: реплика осталась подписью (noSynth) — слот не готов, а не «нет озвучки»; строка шкалы и вывод говорят «синтез запрещён»', () => {
    const marks = [mk(-2000, 'start-mark', { name: 'tap', sinceTap: 0 })]
    const d = diagnoseFirstLine([...marks, line(1800, { source: 'none', noSynth: true, play: 'n/a', waitedMs: 3000, why: 'слот не успел за 3000 мс: слот не разбужен', sinceTap: 3800, slot: { rs: 0, prepared: false, wokeNote: 'aborted' } })])
    expect(d.cause).toBe('slot-not-ready')
    expect(d.causes).not.toContain('no-voice')
    expect(d.timeline.some(t => t.what.includes('синтез запрещён'))).toBe(true)
    expect(silentDiagLines(d).join('\n')).toContain('нет (синтез запрещён)')
  })
})

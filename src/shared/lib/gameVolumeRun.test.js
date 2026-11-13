import { describe, it, expect, vi } from 'vitest'
import { RUN_CONFIGS, QUESTIONS, buildPlan, runIteration, snapAudio, snapText, answerLine, summaryText, saveSettings, restoreSettings, noiseMedia } from './gameVolumeRun.js'

// конфигурации заданы здесь: список RUN_CONFIGS меняется от круга к кругу, логика итерации — нет
const K = { id: 'K', title: 'закрывать микрофон + запись/воспр.', hold: 'close', sess: 'play-and-record' }, N = { id: 'N', title: 'эталон: микрофон не открывался', mic: false }
const D = { id: 'D', title: 'выключать дорожку + запись/воспр.', hold: 'enabled-false', sess: 'play-and-record' }, KM = { ...K, id: 'KM', media: true }, KP = { id: 'KP', title: 'закрывать микрофон + по фазам', hold: 'close', sess: 'phases' }
const mkDeps = (over = {}) => {
  const calls = []
  const c = n => (...a) => { calls.push(n); return over[n]?.(...a) }
  const deps = {
    unlock: c('unlock'), openMic: async () => { calls.push('openMic'); return over.mic ?? 'granted' }, closeMic: c('closeMic'), shutMic: c('shutMic'),
    ses: { begin: c('ses.begin'), end: c('ses.end') }, hold: { parkNow: c('parkNow'), holdFor: ms => { calls.push(`holdFor:${ms}`); return () => calls.push('closeWin') }, reset: c('reset') },
    play: b => { calls.push('play'); return !!b }, ctx: () => ({}), sleep: async () => {}, snap: l => ({ label: l, sess: 'auto', ctx: 'running', mic: 'нет потока', tracks: '—' }),
    log: vi.fn(), buffer: { duration: 3.4 }, writeHold: vi.fn(), writeSess: vi.fn(), writeNudge: vi.fn(), ...(over.deps ?? {}),
  }
  return { deps, calls }
}

describe('план прогона', () => {
  it('10 заходов (5 конфигураций × 2): круг 1 «слушаю» по списку, круг 2 «иконка» в обратном порядке; номера сквозные', () => {
    const p = buildPlan()
    expect(RUN_CONFIGS.map(c => c.id)).toEqual(['N', 'D', 'KP', 'DP', 'NP'])
    expect(p).toHaveLength(10)
    expect(p.slice(0, 5).map(x => x.cfg.id)).toEqual(RUN_CONFIGS.map(c => c.id))
    expect(p.slice(5).map(x => x.cfg.id)).toEqual(RUN_CONFIGS.map(c => c.id).reverse())
    expect(p.slice(0, 5).every(x => x.mode === 'listen') && p.slice(5).every(x => x.mode === 'icon')).toBe(true)
    expect(p.map(x => x.n)).toEqual([...Array(10).keys()].map(i => i + 1))
    expect(p.every(x => x.of === 10)).toBe(true)
    expect(RUN_CONFIGS.find(c => c.id === 'NP')).toMatchObject({ hold: 'none', sess: 'phases' })
  })
})

describe('одна итерация', () => {
  it("режим 'close': тип сессии → микрофон → parkNow → повторный begin → окно речи → звук → закрытие окна → завершение как у паузы игры; настройки и автовстряска выставлены", async () => {
    const { deps, calls } = mkDeps()
    const r = await runIteration({ cfg: K, mode: 'listen', n: 1, of: 14 }, deps)
    expect(calls).toEqual(['unlock', 'ses.begin', 'openMic', 'parkNow', 'ses.begin', 'holdFor:3500', 'play', 'closeWin', 'reset', 'ses.end', 'closeMic'])
    expect(deps.writeHold).toHaveBeenCalledWith('close'); expect(deps.writeSess).toHaveBeenCalledWith('play-and-record'); expect(deps.writeNudge).toHaveBeenCalledWith('off')
    expect(r.ok).toBe(true)
    expect(r.snaps.map(s => s.label)).toEqual(['до', 'в речи', 'после речи'])
    expect(deps.log.mock.calls.every(c => c[0].startsWith('[прогон] #1/14 (K, слушаю)'))).toBe(true)
  })
  it("'enabled-false' не вызывает parkNow; 'icon' зовёт onPrompt в середине речи", async () => {
    const onPrompt = vi.fn()
    const { deps, calls } = mkDeps({ deps: { onPrompt } })
    await runIteration({ cfg: D, mode: 'icon', n: 7, of: 12 }, deps)
    expect(calls).not.toContain('parkNow')
    expect(onPrompt).toHaveBeenCalledTimes(1)
    expect(deps.writeHold).toHaveBeenCalledWith('enabled-false')
  })
  it('эталон: микрофон не открывается, поток останавливается, звук играет; режимы не пишутся', async () => {
    const { deps, calls } = mkDeps()
    const r = await runIteration({ cfg: N, mode: 'listen', n: 1, of: 12 }, deps)
    expect(calls).toEqual(['unlock', 'shutMic', 'play', 'reset', 'ses.end', 'closeMic'])
    expect(deps.writeHold).not.toHaveBeenCalled(); expect(r.ok).toBe(true)
  })
  it('«+ медиа»: настоящий шум стартует в нажатии ДО открытия микрофона (без await перед getUserMedia) и останавливается при уборке; «по фазам» — режим сессии phases', async () => {
    const media = { start: vi.fn(() => Promise.resolve(true)), stop: vi.fn() }
    const order = []
    const { deps } = mkDeps({ deps: { media, openMic: async () => { order.push(`openMic after start:${media.start.mock.calls.length}`); return 'granted' } } })
    const r = await runIteration({ cfg: KM, mode: 'listen', n: 6, of: 14 }, deps)
    expect(order).toEqual(['openMic after start:1']); expect(media.stop).toHaveBeenCalledTimes(1)
    expect(r.steps.join('|')).toContain('медиа-звук (<audio> с шумом −50 дБ): играет')
    const { deps: d2 } = mkDeps(); await runIteration({ cfg: KP, mode: 'listen', n: 7, of: 14 }, d2)
    expect(d2.writeSess).toHaveBeenCalledWith('phases'); expect(d2.writeHold).toHaveBeenCalledWith('close')
  })
  it('noiseMedia: элемент с зацикленным шумом (не тишина); не вышло — false, stop не падает', async () => {
    const el = { play: vi.fn(() => Promise.resolve()), pause: vi.fn(), setAttribute: vi.fn() }
    const m = noiseMedia({ make: url => { el.url = url; return el } })
    expect(await m.start()).toBe(true); expect(el.loop).toBe(true); expect(el.url).toMatch(/^data:audio\/wav;base64,/)
    m.stop(); expect(el.pause).toHaveBeenCalled()
    expect(await noiseMedia({ make: () => { throw new Error('x') } }).start()).toBe(false)
    expect(await noiseMedia({ make: () => ({ play: () => Promise.reject(new Error('NotAllowed')), setAttribute() {} }) }).start()).toBe(false)
    expect(() => noiseMedia().stop()).not.toThrow()
  })
  it('микрофон не открылся — ошибка в шагах, не бросает, всё прибрано; нет озвучки — играет тон', async () => {
    const { deps, calls } = mkDeps({ mic: 'denied' })
    const r = await runIteration({ cfg: K, mode: 'listen', n: 2, of: 12 }, deps)
    expect(r.ok).toBe(false); expect(r.steps.join('|')).toContain('микрофон не открылся (denied)')
    expect(calls.slice(-3)).toEqual(['reset', 'ses.end', 'closeMic'])
  })
})

describe('вспомогательное', () => {
  it('снимок: тип сессии, контекст, поток (закрыт нами / открыт / нет), дорожки', () => {
    const s = snapAudio('x', { mic: () => ({ open: true, parked: false, tracks: [{ readyState: 'live', enabled: false, muted: false }] }), ctx: () => ({ state: 'running' }), type: () => 'play-and-record' })
    expect(snapText(s)).toBe('«x»: сессия=play-and-record ctx=running микрофон=открыт дорожки=live/выкл')
    expect(snapAudio('y', { mic: () => ({ parked: true }), ctx: () => null, type: () => 'auto' })).toMatchObject({ mic: 'закрыт нами', ctx: '—' })
  })
  it('ответы и итог: строка журнала, таблица, ключ конфигураций, журнал', () => {
    const item = { cfg: K, mode: 'icon', n: 7, of: 12 }
    expect(answerLine(item, { icon: 'динамик', jump: 'нет' })).toBe('[прогон] #7/12 (K, иконка) ответ: Иконка в полоске громкости=динамик; После нажатия стало громче?=нет')
    const t = summaryText({ results: [{ item, answers: { icon: 'трубка', jump: 'да' }, ok: true }, { item: { ...item, n: 8 }, answers: {}, ok: false }], header: ['h'], journal: ['строка'] })
    expect(t).toContain('#7 K  иконка | Иконка в полоске громкости: трубка | После нажатия стало громче?: да')
    expect(t).toContain('ЗВУК НЕ ИГРАЛ'); expect(t).toContain('KP = закрывать микрофон'); expect(t.endsWith('строка')).toBe(true)
    expect(Object.keys(QUESTIONS)).toEqual(['listen', 'icon'])
    expect(QUESTIONS.listen.map(q => q[0])).toEqual(['loud', 'crack', 'tg'])
  })
  it('комментарий: уходит в строку журнала и в таблицу итога; пустой/пробельный — молчит', () => {
    const item = { cfg: K, mode: 'listen', n: 2, of: 12 }
    expect(answerLine(item, { loud: 'тихо', crack: 'нет', tg: 'тише', note: '  после  Telegram громче ' })).toBe('[прогон] #2/12 (K, слушаю) ответ: Громкость Пита=тихо; Хруст в голосе=нет; Сравнение с Telegram (то же начало Пита)=тише; комментарий: после Telegram громче')
    expect(answerLine(item, { loud: 'тихо', note: '   ' })).not.toContain('комментарий')
    expect(summaryText({ results: [{ item, answers: { loud: 'норм', note: 'свернул' }, ok: true }] })).toContain('КОММЕНТАРИЙ: свернул')
  })
  it('настройки владельца запоминаются и возвращаются', () => {
    const w = { writeHold: vi.fn(), writeSess: vi.fn(), writeNudge: vi.fn() }
    restoreSettings({ hold: 'none', sess: 'auto', nudge: 'playback' }, w)
    expect(w.writeHold).toHaveBeenCalledWith('none'); expect(w.writeSess).toHaveBeenCalledWith('auto'); expect(w.writeNudge).toHaveBeenCalledWith('playback')
    expect(Object.keys(saveSettings())).toEqual(['hold', 'sess', 'nudge'])
  })
})

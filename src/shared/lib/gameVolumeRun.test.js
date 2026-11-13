import { describe, it, expect, vi } from 'vitest'
import { RUN_CONFIGS, QUESTIONS, buildPlan, runIteration, snapAudio, snapText, answerLine, summaryText, saveSettings, restoreSettings } from './gameVolumeRun.js'

const K = RUN_CONFIGS.find(c => c.id === 'K'), N = RUN_CONFIGS.find(c => c.id === 'N')
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
  it('12 заходов: круг 1 «слушаю» по списку, круг 2 «иконка» в обратном порядке; номера сквозные', () => {
    const p = buildPlan()
    expect(p).toHaveLength(12)
    expect(p.slice(0, 6).map(x => x.cfg.id)).toEqual(RUN_CONFIGS.map(c => c.id))
    expect(p.slice(6).map(x => x.cfg.id)).toEqual(RUN_CONFIGS.map(c => c.id).reverse())
    expect(p.slice(0, 6).every(x => x.mode === 'listen') && p.slice(6).every(x => x.mode === 'icon')).toBe(true)
    expect(p.map(x => x.n)).toEqual([...Array(12).keys()].map(i => i + 1))
    expect(p.every(x => x.of === 12)).toBe(true)
  })
})

describe('одна итерация', () => {
  it("режим 'close': тип сессии → микрофон → parkNow → повторный begin → окно речи → звук → закрытие окна → завершение как у паузы игры; настройки и автовстряска выставлены", async () => {
    const { deps, calls } = mkDeps()
    const r = await runIteration({ cfg: K, mode: 'listen', n: 1, of: 12 }, deps)
    expect(calls).toEqual(['unlock', 'ses.begin', 'openMic', 'parkNow', 'ses.begin', 'holdFor:3500', 'play', 'closeWin', 'reset', 'ses.end', 'closeMic'])
    expect(deps.writeHold).toHaveBeenCalledWith('close'); expect(deps.writeSess).toHaveBeenCalledWith('play-and-record'); expect(deps.writeNudge).toHaveBeenCalledWith('off')
    expect(r.ok).toBe(true)
    expect(r.snaps.map(s => s.label)).toEqual(['до', 'в речи', 'после речи'])
    expect(deps.log.mock.calls.every(c => c[0].startsWith('[прогон] #1/12 (K, слушаю)'))).toBe(true)
  })
  it("'enabled-false' не вызывает parkNow; 'icon' зовёт onPrompt в середине речи", async () => {
    const onPrompt = vi.fn()
    const { deps, calls } = mkDeps({ deps: { onPrompt } })
    await runIteration({ cfg: RUN_CONFIGS.find(c => c.id === 'D'), mode: 'icon', n: 7, of: 12 }, deps)
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
    expect(t).toContain('ЗВУК НЕ ИГРАЛ'); expect(t).toContain('K  = закрывать микрофон'); expect(t.endsWith('строка')).toBe(true)
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

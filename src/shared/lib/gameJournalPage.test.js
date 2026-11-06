import { describe, it, expect, afterEach } from 'vitest'
import { installPageJournal, pageSnapshot } from './gameJournalPage.js'
import { createGameJournal } from './gameJournal.js'

// События страницы в журнал игры: свернули / вернули (visibilitychange), pagehide / pageshow, freeze / resume, blur / focus окна, audioSession, дорожка микрофона — с паспортом звука в каждой строке.
const target = () => { const t = new EventTarget(); return t }
let off = null
afterEach(() => { off?.(); off = null })

function setup() {
  const win = target(), doc = target(), session = target()
  doc.visibilityState = 'visible'
  let lost = null
  const journal = createGameJournal({ now: () => 0, clock: () => new Date(2026, 0, 1) })
  off = installPageJournal({ win, doc, nav: { audioSession: session }, journal, micLost: cb => { lost = cb; return () => { lost = null } }, snap: () => 'ctx=running' })
  return { win, doc, session, journal, fire: (k, t) => lost?.(k, t), texts: () => journal.lines().map(l => l.slice(23)) }
}

describe('журнал страницы', () => {
  it('свернули и вернули: строки с состоянием вкладки и снимком звука; ставится один раз', () => {
    const s = setup()
    expect(installPageJournal({})).toBe(off) // повторная установка — та же подписка
    s.doc.visibilityState = 'hidden'; s.doc.dispatchEvent(new Event('visibilitychange'))
    s.doc.visibilityState = 'visible'; s.doc.dispatchEvent(new Event('visibilitychange'))
    const t = s.texts()
    expect(t[0]).toBe('[page] журнал страницы включён, visibilityState=visible; ctx=running')
    expect(t[1]).toBe('[page] вкладка СКРЫТА (свернули / заблокировали) (visibilityState=hidden); ctx=running')
    expect(t[2]).toContain('вкладка снова видна')
  })
  it('pagehide / pageshow (persisted), freeze / resume, blur / focus только у окна, audioSession, дорожка микрофона', () => {
    const s = setup()
    s.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }))
    s.win.dispatchEvent(new Event('pageshow'))
    s.doc.dispatchEvent(new Event('freeze')); s.doc.dispatchEvent(new Event('resume'))
    s.win.dispatchEvent(new Event('blur')); s.win.dispatchEvent(new Event('focus'))
    const btn = target(); btn.addEventListener('blur', () => {}); s.session.dispatchEvent(new Event('statechange'))
    s.fire('ended', { readyState: 'ended' }); s.fire('mute', { readyState: 'live' })
    const t = s.texts().slice(1).join('\n')
    expect(t).toMatch(/pagehide \(persisted/); expect(t).toMatch(/pageshow; ctx/); expect(t).toMatch(/freeze: страница заморожена/); expect(t).toMatch(/resume: страница разморожена/)
    expect(t).toMatch(/blur: окно потеряло фокус/); expect(t).toMatch(/focus: окно снова в фокусе/); expect(t).toMatch(/audioSession: смена состояния/)
    expect(t).toMatch(/дорожка микрофона: ОБОРВАНА \(ended\), readyState=ended/); expect(t).toMatch(/заглушена системой \(mute\)/)
  })
  it('после отписки события не пишутся', () => {
    const s = setup()
    off(); off = null
    s.doc.dispatchEvent(new Event('visibilitychange'))
    expect(s.journal.size()).toBe(1)
  })
  it('снимок: контекст, тип/состояние аудиосессии, дорожки; нет API — так и пишем', () => {
    expect(pageSnapshot({ nav: { audioSession: { type: 'play-and-record', state: 'active' } }, ctx: () => 'interrupted', mic: () => 'live/muted' })).toBe('ctx=interrupted, audioSession=play-and-record/active, микрофон=live/muted')
    expect(pageSnapshot({ nav: {}, ctx: () => null, mic: () => 'нет потока' })).toBe('ctx=нет, audioSession=нет API, микрофон=нет потока')
  })
})

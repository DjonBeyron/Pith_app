import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import RemindAskSheet from './RemindAskSheet.jsx'
import RemindDone from './RemindDone.jsx'

vi.mock('../../shared/api/remindApi.js', () => ({ setRemindTime: vi.fn(), getRemindTime: vi.fn() }))
vi.mock('../../shared/lib/push.js', () => ({ getPushState: vi.fn(), subscribePush: vi.fn() }))
vi.mock('../../shared/lib/pwaInstall.js', () => ({ isIOS: () => false, isStandalone: () => false }))
vi.mock('../../shared/lib/analytics/track.js', () => ({ track: vi.fn() }))
vi.mock('../../shared/ui/InstallSlides.jsx', () => ({ default: () => null }))

// Нет jsdom — смотрим разметку (renderToStaticMarkup) и связку по исходнику
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const html = el => renderToStaticMarkup(el)
const done = (push, sel = { hh: 20, mm: 0, enabled: true }, extra = {}) =>
  html(<RemindDone res={{ sel, push, needsTz: false, guest: false, ...extra }} onClose={() => {}} />)

describe('RemindAskSheet — разметка', () => {
  it('заголовок, подпись, три пресета, «Своё время», «Не нужно»', () => {
    const out = html(<RemindAskSheet onClose={() => {}} />)
    expect(out).toContain('Когда тебе удобно учиться?')
    expect(out).toContain('Я напомню, когда пора повторить забытое')
    for (const t of ['9:00', '14:00', '20:00']) expect(out).toContain(`>${t}<`)
    expect(out).toContain('Своё время')
    expect(out).toContain('Не нужно, загляну сам')
    expect(out).not.toContain('type="time"') // «своё время» свёрнуто, пока не раскрыли
    expect(out).not.toContain('минут в день')
  })

  it('прежнее своё время раскрыто: поле времени и «по твоим часам сейчас»', () => {
    const out = html(<RemindAskSheet current={{ hh: 7, mm: 40, enabled: true }} onClose={() => {}} />)
    expect(out).toContain('type="time"')
    expect(out).toContain('value="07:40"')
    expect(out).toMatch(/по твоим часам сейчас \d\d:\d\d/)
  })

  it('прежний пресет подсвечен, поле свёрнуто', () => {
    const out = html(<RemindAskSheet current={{ hh: 14, mm: 0, enabled: true }} onClose={() => {}} />)
    expect(out).toMatch(/raOpt raOptOn[^>]*>14:00</)
    expect(out).not.toContain('type="time"')
  })
})

describe('RemindDone — подтверждение и ветка уведомлений', () => {
  it('ask: «Включить уведомления» и «Не сейчас»', () => {
    const out = done('ask')
    expect(out).toContain('Готово.')
    expect(out).toContain('придёт одно уведомление про слово')
    expect(out).toContain('Включить уведомления')
    expect(out).toContain('Не сейчас')
  })
  it('add_home: честный текст про iPhone, «Как добавить», «Не сейчас»', () => {
    const out = done('add_home')
    expect(out).toContain('На iPhone уведомления приходят только приложению на экране «Домой»')
    expect(out).toContain('Как добавить')
    expect(out).toContain('Не сейчас')
    expect(out).not.toContain('Включить уведомления')
  })
  it('granted / denied: только «Готово»', () => {
    for (const p of ['granted', 'denied']) {
      const out = done(p)
      expect(out).toContain('>Готово<')
      expect(out).not.toContain('Не сейчас')
      expect(out).not.toContain('Включить уведомления')
    }
  })
  it('«Не нужно»: подтверждение без ветки уведомлений', () => {
    const out = done('ask', { enabled: false })
    expect(out).toContain('Не буду писать')
    expect(out).not.toContain('Включить уведомления')
  })
  it('needs_tz: без обещания точного дня', () => {
    const out = done('ask', undefined, { needsTz: true })
    expect(out).toContain('Я напомню в 20:00 по твоему времени')
    expect(out).not.toContain('Завтра')
  })
})

describe('RemindAskSheet — связка', () => {
  it('сохраняет через setRemindTime и пишет remind_time_set', () => {
    const code = read('./RemindAskSheet.jsx')
    expect(code).toContain('setRemindTime(')
    expect(code).toContain('track(REMIND_TIME_SET, { preset: presetOf(sel, isCustom), push })')
    expect(read('../../shared/lib/analytics/eventNames.js')).toContain("REMIND_TIME_SET = 'remind_time_set'")
    expect(read('../../../supabase/migrations/20261027150000_remind_event.sql')).toContain("'remind_time_set'")
  })
  it('LearnTab открывает шторку после рассказа, вопрос про минуты из онбординга убран', () => {
    expect(read('./LearnTab.jsx')).toContain('onDone={() => askRemindOnce(() => setAskRemind(true))}')
    expect(read('../../app/ShellV2.jsx')).not.toContain('MinutesAsk')
  })
})

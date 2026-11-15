import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import SendLogButton from './SendLogButton.jsx'
import { isSent, runSend, SHOW_OK_MS, SHOW_FAIL_MS } from '../lib/sendLogFlow.js'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('кнопка «Отправить в GitHub» с откликом на самой кнопке', () => {
  it('исходное состояние: подпись места, data-state idle, свои атрибуты и класс места проходят на кнопку', () => {
    const h = renderToStaticMarkup(createElement(SendLogButton, { send: async () => '', className: 'wlHudAct', label: 'В GitHub', 'data-testid': 'x', 'data-no-unlock': '' }))
    expect(h).toContain('data-state="idle"'); expect(h).toContain('>В GitHub<'); expect(h).toContain('class="sendLogBtn wlHudAct"'); expect(h).toContain('data-testid="x"'); expect(h).toContain('data-no-unlock=""')
  })
  it('успех — по строке «Отправлено…» из logUpload; всё остальное — неудача', () => {
    expect(isSent('Отправлено в GitHub (2 ф.) — напиши мне «читай»')).toBe(true); expect(isSent('Не отправилось: GitHub: запись 403')).toBe(false); expect(isSent('')).toBe(false); expect(isSent(undefined)).toBe(false)
    expect(SHOW_OK_MS).toBe(5000); expect(SHOW_FAIL_MS).toBe(6000)
  })
  it('runSend: ok / не ok / исключение превращается в сообщение (кнопка не залипает в «Отправляю…»)', async () => {
    expect(await runSend(async () => 'Отправлено в GitHub (2 ф.)')).toEqual({ msg: 'Отправлено в GitHub (2 ф.)', ok: true })
    expect(await runSend(async () => 'Не отправилось: нет сети')).toMatchObject({ ok: false })
    expect(await runSend(async () => { throw new Error('boom') })).toEqual({ msg: 'Не отправилось: boom', ok: false })
  })
  it('состояния кнопки: подписи «Отправляю…» / «✓ Отправлено» / «✗ Не отправилось», стили по data-state', () => {
    const src = read('./SendLogButton.jsx'), css = read('../../styles/send-log-button.css')
    expect(src).toContain("'Отправляю…'"); expect(src).toContain("'✓ Отправлено'"); expect(src).toContain("'✗ Не отправилось'")
    for (const st of ['busy', 'ok', 'fail']) expect(css).toContain(`.sendLogBtn[data-state='${st}']`)
  })
  it('везде, где отправляются логи в GitHub, стоит эта кнопка: шестерёнка игры, итог «Встряхни память», админка', () => {
    expect(read('../../features/player/modules/rotate-phone/WordLaneHud.jsx')).toContain('<SendLogButton className="wlHudAct" send={sendJournalNow} onResult={setStatus}')
    expect(read('../../features/pitrace/RaceJournalLinks.jsx')).toContain('<SendLogButton className="raceJournalLink" label="В GitHub" stop send={sendJournalNow}')
    expect(read('../../features/admin/AdminTab.jsx')).toContain('<SendLogButton label="📤 Отправить логи в GitHub" send={(comment, opts) => sendLogs({ comment, ...opts })} onResult={setSyncMsg} />')
  })
})

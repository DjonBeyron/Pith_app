import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../../shared/api/analyticsApi.js', () => ({ fetchPromptGroups: vi.fn() }))

const { AnalyticsGroupsView, MIN_GROUP } = await import('./AnalyticsGroups.jsx')

const group = (name, extra = {}) => ({
  group: name, devices: 100, d2_base: 100, ret_d2: 25, d7_base: 80, ret_d7: 8, prompt_shown: 40, prompt_dismiss: 10, ...extra,
})
const html = groups => renderToStaticMarkup(<AnalyticsGroupsView groups={groups} />)
const LOW = 'Мало данных — выводов нет'

describe('AnalyticsGroupsView', () => {
  it('порог из плана — 1250 человек в группе', () => {
    expect(MIN_GROUP).toBe(1250)
  })
  it('при малых числах пометка «Мало данных» есть и стоит ПОСЛЕ таблицы', () => {
    const h = html([group('control'), group('prompts')])
    expect(h).toContain(LOW)
    expect(h).toContain('~1250 человек в каждой группе')
    expect(h.indexOf('</table>')).toBeLessThan(h.indexOf(LOW))
  })
  it('пометки нет, когда в обеих группах не меньше 1250', () => {
    const h = html([group('control', { devices: 1250 }), group('prompts', { devices: 4000 })])
    expect(h).not.toContain(LOW)
  })
  it('пометка есть, если мала хотя бы одна группа или групп нет', () => {
    expect(html([group('control', { devices: 1249 }), group('prompts', { devices: 4000 })])).toContain(LOW)
    expect(html([])).toContain(LOW)
    expect(html(undefined)).toContain(LOW)
  })
  it('проценты считаются: возврат от базы, закрытия от показов', () => {
    const h = html([group('control', { devices: 2000, d2_base: 1600, ret_d2: 400, d7_base: 1000, ret_d7: 150, prompt_shown: 8, prompt_dismiss: 2 })])
    expect(h).toContain('<td>25%</td>')   // D2: 400 / 1600
    expect(h).toContain('<td>15%</td>')   // D7: 150 / 1000
    expect(h).toContain('<td>8</td>')     // показов
    expect(h).toContain('<td>25%</td>')   // закрытий: 2 / 8
    expect(h).toContain('Без вопросов')
  })
  it('нет показов — прочерк вместо деления на ноль; нет базы — от всех устройств', () => {
    const h = html([{ group: 'prompts', devices: 50, ret_d2: 10, ret_d7: 5, prompt_shown: 0, prompt_dismiss: 0 }])
    expect(h).toContain('<td>—</td>')
    expect(h).toContain('<td>20%</td>')   // D2: 10 / 50 без d2_base
    expect(h).toContain('<td>10%</td>')   // D7: 5 / 50
  })
})

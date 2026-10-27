import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import VoskReadyNotice from './VoskReadyNotice.jsx'

const html = state => renderToStaticMarkup(<VoskReadyNotice vosk={{ download() {}, retry() {}, ...state }} />)

describe('VoskReadyNotice — общее уведомление «нужно скачать»', () => {
  it('нужно скачать: заголовок с размером и кнопка «Скачать»', () => {
    const out = html({ status: 'need' })
    expect(out).toContain('Нужно скачать распознавание речи (≈39 МБ)')
    expect(out).toContain('data-testid="vosk-download"')
    expect(out).toContain('>Скачать<')
  })
  it('качается: полоса с процентами и объёмом, кнопки нет', () => {
    const out = html({ status: 'downloading', pct: 42, detail: '16.0 МБ из 39.0 МБ' })
    expect(out).toContain('aria-valuenow="42"')
    expect(out).toContain('width:42%')
    expect(out).toContain('42% · 16.0 МБ из 39.0 МБ')
    expect(out).not.toContain('<button')
  })
  it('качается без процентов — узкая полоска, не пустая', () => {
    expect(html({ status: 'downloading', pct: null, detail: '' })).toContain('width:4%')
  })
  it('ошибка загрузки и «не включилось» — с кнопкой «Ещё раз»', () => {
    expect(html({ status: 'error', text: 'нет сети' })).toContain('Не получилось скачать')
    const failed = html({ status: 'failed', text: 'таймаут' })
    expect(failed).toContain('Распознавание речи не включилось')
    expect(failed).toContain('Ещё раз')
  })
  it('ждём сеть; готовлю; готово — ничего', () => {
    expect(html({ status: 'waiting', text: 'Нет сети — докачаем, как только она появится' })).toContain('Нет сети')
    expect(html({ status: 'preparing' })).toContain('Готовлю распознавание речи')
    expect(html({ status: 'ready' })).toBe('')
  })
})

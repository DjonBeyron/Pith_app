import { describe, it, expect } from 'vitest'
import { readyView, NEED_TITLE } from './voskReadyView.js'
import { INITIAL_STATUS } from './voskBgStatus.js'

const bg = patch => ({ ...INITIAL_STATUS, ...patch })
const noModel = { ok: false, reason: 'no-model', text: 'модели Vosk нет в кэше телефона' }

describe('readyView: что показать, когда нужен Vosk', () => {
  it('прогрев идёт — «готовлю»; готово — ready', () => {
    expect(readyView({ result: null, bg: bg({}) }).status).toBe('preparing')
    expect(readyView({ result: { ok: true }, bg: bg({ state: 'cached' }) }).status).toBe('ready')
  })

  it('модели нет, ничего не качается — «нужно скачать» (≈39 МБ), системное не предлагается', () => {
    expect(readyView({ result: noModel, bg: bg({ state: 'idle' }) }).status).toBe('need')
    expect(readyView({ result: noModel, bg: bg({ state: 'waiting', reason: 'feed' }) }).status).toBe('need') // тихая загрузка ждёт тишины — человек может нажать «Скачать»
    expect(NEED_TITLE).toBe('Нужно скачать распознавание речи (≈39 МБ)')
  })

  it('фоновая загрузка уже идёт — показываем её прогресс без кнопки', () => {
    const v = readyView({ result: noModel, bg: bg({ state: 'downloading', pct: 41, loaded: 16 * 1048576, total: 39 * 1048576 }) })
    expect(v).toMatchObject({ status: 'downloading', pct: 41 })
    expect(v.detail).toBe('16.0 МБ из 39.0 МБ')
  })

  it('нажали «Скачать»: пока первый кусок не пришёл — «качается» без процентов; нет сети — ждём', () => {
    expect(readyView({ result: noModel, bg: bg({ state: 'check' }), asked: true })).toMatchObject({ status: 'downloading', pct: null })
    expect(readyView({ result: noModel, bg: bg({ state: 'waiting', reason: 'offline' }), asked: true }).status).toBe('waiting')
    expect(readyView({ result: noModel, bg: bg({ state: 'other' }), asked: true }).status).toBe('waiting')
  })

  it('ошибка загрузки — «Ещё раз»; докачалась — снова «готовлю» (прогрев пойдёт сам)', () => {
    expect(readyView({ result: noModel, bg: bg({ state: 'error', error: 'нет сети' }), asked: true })).toMatchObject({ status: 'error', text: 'нет сети' })
    expect(readyView({ result: noModel, bg: bg({ state: 'cached' }), asked: true }).status).toBe('preparing')
  })

  it('модель в кэше, но не включилась (сбой, таймаут) — failed с причиной, не «нужно скачать»', () => {
    const v = readyView({ result: { ok: false, reason: 'failed', text: 'ошибка загрузки модели: таймаут' }, bg: bg({ state: 'cached' }) })
    expect(v).toMatchObject({ status: 'failed', text: 'ошибка загрузки модели: таймаут' })
    expect(readyView({ result: { ok: false, reason: 'timeout', text: 'не успел' }, bg: bg({ state: 'cached' }) }).status).toBe('failed')
  })
})

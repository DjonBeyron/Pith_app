import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WordLaneHud from './WordLaneHud.jsx'
import {
  PILL_SAFE_KEY, WEAK_KEY, readPillSafe, writePillSafe, applyPillSafe, readWeakStored, writeWeakStored, applyAudioSessionMode, micLine, voskLine, describeHud,
} from './wordLaneHudSettings.js'
import { AUDIO_SESSION_KEY } from '../../../../shared/lib/gameAudioSettings.js'
import { APP_VERSION } from '../../../../shared/lib/version.js'

// Мини-HUD настроек в игре «Повтори за диктором»: чистые настройки (pithy_wl_pill_safe_v1, pithy_weak_device_v6, тип аудиосессии на лету), строки «что сейчас», панель и подключение к игре.
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const broken = { getItem() { throw new Error('private') }, setItem() { throw new Error('private') }, removeItem() { throw new Error('private') } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

afterEach(() => vi.unstubAllGlobals())

describe('безопасные слои пилюль iOS (pithy_wl_pill_safe_v1)', () => {
  it('пишется «1», выключение снимает ключ; битое хранилище не роняет', () => {
    const s = memStore()
    expect(readPillSafe(s)).toBe(false)
    writePillSafe(true, s)
    expect(s.m).toEqual({ [PILL_SAFE_KEY]: '1' })
    expect(readPillSafe(s)).toBe(true)
    writePillSafe(false, s)
    expect(s.m).toEqual({})
    expect(readPillSafe(broken)).toBe(false)
    expect(() => writePillSafe(true, broken)).not.toThrow()
  })
  it('класс wl--safe ставится и снимается на корне игры (classList), без корня — тихо', () => {
    const set = new Set()
    const root = { classList: { toggle: (c, on) => { if (on) set.add(c); else set.delete(c) } } }
    applyPillSafe(root, true)
    expect([...set]).toEqual(['wl--safe'])
    applyPillSafe(root, false)
    expect(set.size).toBe(0)
    expect(() => applyPillSafe(null, true)).not.toThrow()
  })
})

describe('lite-режим (pithy_weak_device_v6) и тип аудиосессии на лету', () => {
  it('lite: 1 / 0 / не записано', () => {
    const s = memStore()
    expect(readWeakStored(s)).toBeNull()
    writeWeakStored(true, s); expect(s.m[WEAK_KEY]).toBe('1'); expect(readWeakStored(s)).toBe(true)
    writeWeakStored(false, s); expect(s.m[WEAK_KEY]).toBe('0'); expect(readWeakStored(s)).toBe(false)
    expect(readWeakStored(broken)).toBeNull()
  })
  it('смена типа аудиосессии: настройка записана и идущая игра переприменяет её (end → begin); без игры — только запись', () => {
    const s = memStore()
    const calls = []
    const session = { active: true, end: () => calls.push('end'), begin: () => calls.push('begin') }
    applyAudioSessionMode('auto', session, s)
    expect(s.m[AUDIO_SESSION_KEY]).toBe('auto')
    expect(calls).toEqual(['end', 'begin'])
    const idle = { active: false, end: () => calls.push('end2'), begin: () => calls.push('begin2') }
    applyAudioSessionMode('phases', idle, s)
    expect(s.m[AUDIO_SESSION_KEY]).toBe('phases')
    expect(calls).toEqual(['end', 'begin'])
  })
})

describe('строки «что сейчас»', () => {
  it('дорожка микрофона', () => {
    expect(micLine(null)).toBe('не открыт')
    expect(micLine({ open: false, tracks: null })).toBe('не открыт')
    expect(micLine({ open: true, tracks: [{ readyState: 'live', muted: false, enabled: true }] })).toBe('live')
    expect(micLine({ open: true, tracks: [{ readyState: 'live', muted: true, enabled: false }] })).toBe('live, muted, выключена')
  })
  it('Vosk', () => {
    expect(voskLine(null)).toBe('—')
    expect(voskLine({ loaded: true })).toContain('готов')
    expect(voskLine({ loaded: false, broken: true, brokenWhy: 'таймаут' })).toBe('сбой: таймаут')
    expect(voskLine({ loaded: false, loading: true, stage: 'loading-model' })).toContain('грузится')
    expect(voskLine({ loaded: false, cached: false })).toBe('модели нет в кэше')
    expect(voskLine({ loaded: false, cached: true, stage: 'idle' })).toContain('не в памяти')
  })
  it('describeHud: тип аудиосессии, дорожка, Vosk, lite, версия; падающий источник — прочерк, а не ошибка', () => {
    const d = describeHud({
      session: () => ({ supported: true, type: 'play-and-record' }), mic: () => ({ open: true, tracks: [{ readyState: 'live', muted: false, enabled: true }] }),
      vosk: () => ({ loaded: true }), weak: () => true, version: '9.9.9',
    })
    expect(d).toEqual({ audioSession: 'play-and-record', mic: 'live', vosk: 'готов (модель в памяти)', lite: 'да', version: '9.9.9' })
    expect(describeHud({ session: () => ({ supported: false }) }).audioSession).toBe('нет API')
    const bad = describeHud({ session: () => { throw new Error('x') }, mic: () => { throw new Error('x') }, vosk: () => { throw new Error('x') } })
    expect(bad).toMatchObject({ audioSession: '—', mic: 'не открыт', vosk: '—' })
  })
})

describe('панель WordLaneHud', () => {
  const html = props => renderToStaticMarkup(createElement(WordLaneHud, { dbg: {}, rootRef: { current: null }, onRestartStage() {}, onRestartGame() {}, onExit() {}, ...props }))
  it('закрыта: одна маленькая кнопка ⚙, панели нет', () => {
    const out = html()
    expect(out).toContain('data-testid="wl-hud-open"')
    expect(out).not.toContain('data-testid="wl-hud"')
  })
  it('открыта: версия, текущие значения и все пункты из задания, каждый с пометкой «когда применится»', () => {
    const out = html({ defaultOpen: true })
    expect(out).toContain(`v${APP_VERSION}`)
    for (const id of ['info', 'proc', 'session', 'hold', 'reward', 'volume', 'safe', 'rate', 'lite']) expect(out).toContain(`data-testid="wl-hud-${id}`)
    for (const id of ['download', 'stage', 'game', 'exit']) expect(out).toContain(`data-testid="wl-hud-${id}"`)
    expect(out).toContain('audioSession.type')
    expect(out).toContain('Дорожка микрофона')
    expect(out).toContain('Vosk:')
    // применение: сразу — слои, звук награды, громкость, аудиосессия, глушение; после «Игра заново» — обработка микрофона и скорость; после перезагрузки — lite
    expect(out).toMatch(/Обработка микрофона[^<]*<em class="wlHudWhen wlHudWhen--restart">после «Игра заново»/)
    expect(out).toMatch(/Скорость голоса<em class="wlHudWhen wlHudWhen--restart">/)
    expect(out).toMatch(/Lite-режим[^<]*<em class="wlHudWhen wlHudWhen--reload">после перезагрузки/)
    expect(out).toMatch(/Безопасные слои пилюль \(iOS\)<em class="wlHudWhen wlHudWhen--now">сразу/)
    expect(out).toMatch(/Звук награды<em class="wlHudWhen wlHudWhen--now">сразу/)
    expect(out).toMatch(/Аудиосессия iOS<em class="wlHudWhen wlHudWhen--now">сразу/)
  })
  it('«Игра заново» есть, только если игра умеет перезапуск (onRestartGame)', () => {
    expect(html({ defaultOpen: true, onRestartGame: null })).not.toContain('wl-hud-game')
  })
})

describe('HUD в игре', () => {
  const game = read('./WordLaneGame.jsx')
  it('виден только при отладочном интерфейсе (dbg.enabled), живёт в memo и не принимает состояние из useWordLaneFlow', () => {
    expect(game).toContain('const Hud = memo(WordLaneHud)')
    expect(game).toContain('f.dbg.enabled && <Hud dbg={f.dbg} rootRef={rootRef} onRestartStage={f.restartStage} onRestartGame={onRestart} onExit={f.finish} setTapMode={setTapMode} />')
    expect(read('./WordLaneHud.jsx')).not.toMatch(/import .*useWordLaneFlow/)
  })
  it('класс wl--safe: на старте из pithy_wl_pill_safe_v1, дальше его меняет HUD через classList (className не меняется)', () => {
    expect(game).toContain("className={safe0 ? 'wl wl--safe' : 'wl'}")
    expect(game).toContain('ref={rootRef}')
    expect(read('./WordLaneHud.jsx')).toContain('applyPillSafe(rootRef?.current, !safe)')
  })
  it('«Скачать отладку» — тот же экспорт, что в финале: buildDebugFile + saveDebugFile, запись берётся без остановки рекордера', () => {
    const hud = read('./WordLaneHud.jsx')
    expect(hud).toContain('prepareAudio(dbg.recorder)')
    expect(hud).toContain('buildDebugFile({ log: dbg, audio })')
    expect(hud).toContain('saveDebugFile(')
  })
  it('стили HUD подключены, файлы короткие', () => {
    expect(read('../../../../index.css')).toContain("@import './styles/player/modules/word-lane-hud.css'")
    for (const f of ['./WordLaneHud.jsx', './wordLaneHudSettings.js']) expect(read(f).split('\n').length).toBeLessThan(250)
  })
})

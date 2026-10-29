import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RotatePhoneModule from './RotatePhoneModule.jsx'
import WordLaneMic from './WordLaneMic.jsx'

// useSyncExternalStore фоновой загрузки Vosk не рендерится на сервере (нет getServerSnapshot) — готовность Vosk подставляем
const vosk = vi.hoisted(() => ({ state: { status: 'preparing', download() {}, retry() {} } }))
vi.mock('../../../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => vosk.state }))

// Игра «Повтори за диктором» слушает только Vosk: ручного режима («тап = сказал», «Пропустить») нет; модель не готова — уведомление вместо запуска; микрофон не дали — честное сообщение.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const node = (td = { phrase: "I'm | trying | to learn" }, extra = {}) => ({ id: 'n1', type: 'rotate_phone', typeData: { rotate_phone: td }, ...extra })

describe('ручного режима нет', () => {
  it('useWordLaneFlow: ни tapMic, ни skip, ни режима manual; отказ слушателя = mic failed + «Ещё раз» (retryMic)', () => {
    const flow = read('./useWordLaneFlow.js')
    expect(flow).not.toMatch(/tapMic|\bskip\b|'manual'/)
    expect(flow).toContain("status === 'unavailable' || status === 'error' ? 'failed'")
    expect(flow).toContain('retryMic')
    expect(flow).toContain('restartStage')
  })
  it('WordLaneGame: нет кнопки «Пропустить» и тапа по микрофону; есть честное сообщение с «Ещё раз» и «Выйти»', () => {
    const game = read('./WordLaneGame.jsx')
    expect(game).not.toMatch(/wl-skip|Пропустить|tapMic|onTap/)
    expect(game).toContain("f.mic === 'failed'")
    expect(game).toContain('data-testid="wl-fail-retry"')
    expect(game).toContain('data-testid="wl-fail-exit"')
  })
  it('WordLaneMic: микрофон — индикатор (не кнопка), подписи starting / listening / done', () => {
    const out = renderToStaticMarkup(createElement(WordLaneMic, { mode: 'listening', visible: true }))
    expect(out).toContain('Слушаю…')
    expect(out).not.toContain('<button')
    expect(renderToStaticMarkup(createElement(WordLaneMic, { mode: 'starting', visible: true }))).toContain('Включаю микрофон…')
    expect(read('../../../../styles/player/modules/word-lane-mic.css')).not.toMatch(/wlSkip|wlMic--manual/)
  })
})

describe('карточка ноды', () => {
  it('Vosk ещё не готов: вместо запуска уведомление, кнопка «Начать» не нажимается', () => {
    vosk.state = { status: 'preparing', download() {}, retry() {} }
    const out = renderToStaticMarkup(createElement(RotatePhoneModule, { node: node() }))
    expect(out).toContain('data-testid="vosk-notice"')
    expect(out).toContain('Готовлю распознавание речи')
    expect(out).toMatch(/<button[^>]*class="playerRotateStart"[^>]*disabled=""|<button[^>]*disabled=""[^>]*class="playerRotateStart"/)
  })
  it('история («Продолжить урок»): карточка «закончена», Vosk не греем, кнопки и уведомления нет', () => {
    const out = renderToStaticMarkup(createElement(RotatePhoneModule, { node: node(undefined, { isHistory: true }) }))
    expect(out).toContain('Голосовая тренировка закончена')
    expect(out).not.toContain('vosk-notice')
    expect(out).not.toContain('rotate-start')
  })
  it('Vosk готов: уведомления нет, «Начать» доступна', () => {
    vosk.state = { status: 'ready', download() {}, retry() {} }
    const out = renderToStaticMarkup(createElement(RotatePhoneModule, { node: node() }))
    expect(out).not.toContain('vosk-notice')
    expect(out).toContain('data-testid="rotate-start"')
    expect(out).not.toMatch(/class="playerRotateStart"[^>]*disabled/)
  })
  it('Vosk надо скачать: уведомление с кнопкой «Скачать», игра не запускается', () => {
    vosk.state = { status: 'need', download() {}, retry() {} }
    const out = renderToStaticMarkup(createElement(RotatePhoneModule, { node: node() }))
    expect(out).toContain('Нужно скачать распознавание речи')
    expect(out).toContain('data-testid="vosk-download"')
  })
  it('bare (тест из админки): без карточки и без кнопки «Начать», только уведомление', () => {
    vosk.state = { status: 'preparing', download() {}, retry() {} }
    const out = renderToStaticMarkup(createElement(RotatePhoneModule, { node: node(), bare: true }))
    expect(out).toContain('data-testid="vosk-notice"')
    expect(out).not.toContain('rotate-start')
    expect(out).not.toContain('playerRotateCard')
  })
  it('запуск идёт через готовность Vosk, микрофон без доступа не пускает в игру и отпускает всё поднятое в жесте', () => {
    const mod = read('./RotatePhoneModule.jsx')
    expect(mod).toContain("useVoskReady({ why: 'lesson' })")
    expect(mod).toContain('<VoskReadyNotice vosk={vosk} />')
    expect(mod).toContain("if (busy || phase !== 'wait' || !ready) return")
    const body = mod.slice(mod.indexOf('const start = useCallback'))
    expect(body.indexOf("if (mic !== 'granted')")).toBeGreaterThan(-1)
    expect(body.indexOf("if (mic !== 'granted')")).toBeLessThan(body.indexOf("setPhase('game')"))
    expect(body).toContain('abortGame()')
    expect(mod).toContain('Нет доступа к микрофону')
  })
  it('«Игра заново» из HUD: синхронный перемонтаж (flushSync) и подъём звука и микрофона в том же тапе', () => {
    const mod = read('./RotatePhoneModule.jsx')
    expect(mod).toMatch(/flushSync\(\(\) => setGameKey\(k => k \+ 1\)\)\s+armGame\(\)\s+openGameMic\(\)/)
    expect(mod).toContain('key={gameKey}')
    expect(mod).toContain('onRestart={restart}')
  })
  it('тест-запуск из админки: старт из чужого тапа (startRef), игра возвращается в ожидание, forceDebug доходит до журнала', () => {
    const mod = read('./RotatePhoneModule.jsx')
    expect(mod).toContain('startRef.current = start')
    expect(mod).toContain("if (bare) { setPhase('wait'); onDone?.('shown') }")
    expect(mod).toContain('forceDebug={forceDebug}')
    expect(read('./WordLaneGame.jsx')).toContain('forceDebug, onFinished })')
    expect(read('./useWordLaneFlow.js')).toContain('force: forceDebug')
    expect(read('./useWordLaneDebug.js')).toContain('toggle: force || getPlayerDebugUiValue()')
  })
})

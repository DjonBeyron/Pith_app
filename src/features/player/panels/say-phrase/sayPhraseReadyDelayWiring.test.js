import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Проводка отложенного показа «доступ выдан» (locked → ready): чистая логика — sayReadyDelay.test.js; здесь — что хук и панель собраны так, как описано:
// задержка только в картинке (решения идут по настоящему состоянию), таймер и слушатели чистятся, iPhone ждёт возврата в приложение.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const hook = read('./useDelayedMicState.js')
const panel = read('./SayPhrasePanel.jsx')
const stage = read('./SayStage.jsx')

describe('say_phrase — отложенный ready', () => {
  it('хук: удержание только при holdsReady, показанное синхронно догоняет настоящее во всех остальных случаях (сброс при рендере), setState в таймере', () => {
    expect(hook).toContain("import { holdKind, startsAsk, startsAfterPopup, readyDelayLeft, activationLeft } from '../../../../shared/lib/speech/sayReadyDelay.js'")
    expect(hook).toContain('const kind = holdKind({ shown, target, settled: settled && wasSettled, asked: askedNow, afterPopup: popupNow })')
    expect(hook).toContain('if (!kind && shown !== target) setShown(target)')
    expect(hook).toContain("if (left !== null) timer = setTimeout(() => setShown(kind === 'ready' ? 'ready' : 'active'), left)")
    expect(hook).toContain("return kind ? 'locked' : target")
    // первый запрос: нажатие запоминается в рендере, где цель стала active; отсчёт active стартует только когда микрофон открылся (opened)
    expect(hook).toContain('const askedNow = target !== prev ? startsAsk({ shown, target, noAccess }) : asked')
    expect(hook).toContain("const armed = kind === 'ready' || (kind === 'active' && (opened || !askedNow))")
    // кнопка попапа: нажатие запоминается в рендере, где цель стала active (в прошлом рендере панель была в фазе попапа); активация без диалога — через POPUP_DELAY_MS от нажатия (activationLeft)
    expect(hook).toContain('const popupNow = target !== prev ? startsAfterPopup({ shown, target, wasPopup }) : afterPopup')
    expect(hook).toContain('activationLeft({ asked: askedNow, afterPopup: popupNow, ios, tapAt: tapAt.current, readyAt, backAt, now, visible: isVisible() })')
    expect(hook).toContain('if (!kind || !armed) return undefined')
  })

  it('таймер и слушатели чистятся при размонтировании и смене цели; iPhone: возврат (focus / visibilitychange → visible) пересчитывает отсчёт, скрытие снимает таймер', () => {
    expect(hook).toContain("window.addEventListener('focus', onChange)")
    expect(hook).toContain("document.addEventListener('visibilitychange', onChange)")
    expect(hook).toMatch(/return \(\) => \{ clearTimeout\(timer\); window\.removeEventListener\('focus', onChange\); document\.removeEventListener\('visibilitychange', onChange\) \}/)
    expect(hook).toContain('backAt = nowMs(); schedule()')
    expect(hook).toContain('else if (ios) clearTimeout(timer)')
    expect(hook).toContain('isIos()')
  })

  it('панель: решения (автопопап) читают настоящее micTarget, картинка и подпись — показанное micState; логика доступа и движков не тронута', () => {
    expect(panel).toContain('const micTarget = micVisualState({ ...sp.access, phase })')
    expect(panel).toContain("const micState = useDelayedMicState(micTarget, { settled: sp.perm.isChecked(), noAccess: !hasMicAccess(sp.access), opened: sp.view?.status === 'listening', popup: phase === 'explain' })")
    // пока круг ещё locked, а запись идёт, подпись и волны тоже «как в locked»: картинка берёт фазу idle; запись и решения — по настоящим phase / micTarget
    expect(panel).toContain("const visualPhase = micState === 'locked' && micTarget === 'active' ? 'idle' : phase")
    expect(panel).toContain('const mic = micLabel({ phase: visualPhase,')
    expect(panel).toContain('onTap={tapMic}')
    expect(panel).toContain('sp.tapMic()')
    expect(panel).toContain('micState: micTarget, decision: sp.perm.decide()')
    expect(panel).toContain("locked: micState === 'locked'")
    expect(panel).toContain('state={micState}')
    expect(stage).toContain('data-state={state}')
  })
})

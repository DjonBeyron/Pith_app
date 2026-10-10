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
    expect(hook).toContain("import { holdsReady, readyDelayLeft } from '../../../../shared/lib/speech/sayReadyDelay.js'")
    expect(hook).toContain('const hold = holdsReady({ shown, target, settled: settled && wasSettled })')
    expect(hook).toContain('if (!hold && shown !== target) setShown(target)')
    expect(hook).toContain("timer = setTimeout(() => setShown('ready'), left)")
    expect(hook).toContain('return hold ? \'locked\' : target')
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
    expect(panel).toContain('const micState = useDelayedMicState(micTarget, { settled: sp.perm.isChecked() })')
    expect(panel).toContain('micState: micTarget, decision: sp.perm.decide()')
    expect(panel).toContain("locked: micState === 'locked'")
    expect(panel).toContain('state={micState}')
    expect(stage).toContain('data-state={state}')
  })
})

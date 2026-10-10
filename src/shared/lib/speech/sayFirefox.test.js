import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decideMic, createSayPermission, micGate } from './sayPermission.js'
import { initialSayState, planTap } from './sayFlow.js'
import { micLabel } from './sayMic.js'
import { BROWSER_NOTE, MIC_UNAVAILABLE, CANT_SPEAK_LINK } from './sayTexts.js'
import { sayOutcome } from './sayResult.js'
import { emptyView } from './speechController.js'

// Firefox: вместо работы модуля — пояснение «откройте в Safari или Chrome»; дальше путь «проверка голоса недоступна»: «Я не могу говорить» (ветка «верный», сообщение-успех пропускается)
const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const base = { supported: true, cantSpeak: false, denied: false, perm: 'granted', explained: true, micOk: true }
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('Firefox в решении о микрофоне', () => {
  it('Firefox → запасной режим «browser» раньше всех остальных причин (даже если распознавание «есть», разрешение выдано или микрофон уже работал)', () => {
    expect(decideMic({ ...base, browserBlocked: true })).toEqual({ action: 'fallback', reason: 'browser' })
    expect(decideMic({ ...base, browserBlocked: true, supported: false, denied: true, cantSpeak: true })).toEqual({ action: 'fallback', reason: 'browser' })
    expect(micGate(decideMic({ ...base, browserBlocked: true }))).toBe('blocked')
  })

  it('другие браузеры — прежнее поведение: без распознавания → unsupported, остальное как раньше', () => {
    expect(decideMic({ ...base, browserBlocked: false })).toEqual({ action: 'listen' })
    expect(decideMic({ ...base, supported: false })).toEqual({ action: 'fallback', reason: 'unsupported' })
    expect(decideMic({ ...base, denied: true })).toEqual({ action: 'fallback', reason: 'denied' })
  })

  it('createSayPermission: isBlockedBrowser решает; по умолчанию — настоящий navigator (в тестах не Firefox)', () => {
    const mk = isBlockedBrowser => createSayPermission({ local: store(), session: store(), queryPerm: async () => 'granted', isSupported: () => true, isBlockedBrowser })
    expect(mk(() => true).decide()).toEqual({ action: 'fallback', reason: 'browser' })
    expect(mk(() => false).decide().action).not.toBe('fallback')
    expect(createSayPermission({ local: store(), session: store(), isSupported: () => true }).decide().reason).not.toBe('browser')
  })
})

describe('Firefox в панели', () => {
  it('панель сразу в запасном режиме «browser»: тап по кругу не начинает запись; надпись — пояснение; режим off', () => {
    const decision = { action: 'fallback', reason: 'browser' }
    const s = initialSayState(decision)
    expect(s).toMatchObject({ phase: 'fallback', fallbackReason: 'browser' })
    expect(planTap({ view: emptyView, decision })).toEqual({ act: 'fallback', reason: 'browser' })
    expect(micLabel({ phase: s.phase, fallbackReason: s.fallbackReason })).toEqual({ label: BROWSER_NOTE, mode: 'off' })
  })

  it('текст пояснения — как просил владелец; «unsupported» остаётся прежним текстом «Проверка голоса недоступна»', () => {
    expect(BROWSER_NOTE).toBe('Для распознавания голоса нужен другой браузер — откройте приложение в Safari или Chrome.')
    expect(micLabel({ phase: 'fallback', fallbackReason: 'unsupported' })).toEqual({ label: MIC_UNAVAILABLE, mode: 'off' })
  })

  it('выход есть: «Я не могу говорить» → итог say_cant (ветка «верный» без сообщения-успеха), как в «проверка голоса недоступна»', () => {
    expect(sayOutcome({ kind: 'skip' }).trigger).toBe('say_cant')
    const panel = read('../../../features/player/panels/say-phrase/SayPhrasePanel.jsx')
    expect(panel).toContain("const noMic = phase === 'fallback' && sp.fallbackReason === 'browser'")
    expect(panel).toContain('{noMic ? <SayBrowserNote /> : (')
    expect(panel).toContain('onSkip={() => finish(\'skip\')}')   // ссылка внизу панели работает в этом состоянии
    expect(panel).toContain('hideSkip={hideSkip}')               // и не гаснет: режим off не «живой» и не «ok»
    expect(CANT_SPEAK_LINK).toBe('Я не могу говорить')
  })

  it('пояснение — отдельный компонент в стиле приложения; Vosk в Firefox не прогревается (решение «fallback» до ctrl.warm)', () => {
    const note = read('../../../features/player/panels/say-phrase/SayBrowserNote.jsx')
    expect(note).toContain('BROWSER_NOTE')
    expect(note).toContain('role="status"')
    expect(read('../../../styles/player/panels/say-phrase.css')).toMatch(/\.sayBrowserNote \{[^}]*text-align: center/)
    const hook = read('../../../features/player/panels/say-phrase/useSayPhrase.js')
    expect(hook).toContain("onFallback: d => dispatch({ type: 'fallback', reason: d.reason, onlyIdle: true })")
    expect(hook).toContain('startPanelWarm({ perm, warm: why => ctrl.warm(why)')
    expect(read('../../../shared/lib/speech/sayPanelWarm.js')).toContain("if (perm.decide().action !== 'fallback') release = warm('panel')")
    expect(hook).toMatch(/useReducer\(sayReducer, perm, p => initialSayState\(p\.decide\(\)\)\)/)
  })
})

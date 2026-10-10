import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// useTabSilence на подставных окружениях (без DOM): эффект хука выполняется сразу, IntersectionObserver/MutationObserver — свои.
// Регрессия «звуки интерфейса пропали в чатах»: админка смонтирована под скрытыми вкладками оболочки (visibility:hidden), IntersectionObserver
// про это не знает и говорил «видно» — тишина приложения держалась вечно, в том числе в уроках.
let cleanup = null
vi.mock('react', () => ({ useEffect: fn => { cleanup = fn() } }))
vi.mock('../../../shared/lib/debug.js', () => ({ pLog: () => {} }))

const { useTabSilence } = await import('./useTabSilence.js')
const { isSilenced, silenceReasons, _resetSoundQuiet } = await import('../../../shared/lib/soundQuiet.js')
const { lessonOpened, _resetLessonOpen } = await import('../../../shared/lib/lessonOpen.js')

let ios, mos
class FakeIO { constructor(cb) { this.cb = cb; ios.push(this) } observe() {} disconnect() { this.dead = true } fire(v) { if (!this.dead) this.cb([{ isIntersecting: v }]) } }
class FakeMO { constructor(cb) { this.cb = cb; mos.push(this) } observe() {} disconnect() { this.dead = true } fire() { if (!this.dead) this.cb([]) } }

// Корень вкладки внутри .shellV2Tab; hidden — класс .shellV2TabHidden на родителе
function makeEl(hidden) {
  const tab = { hidden }
  const el = { closest: sel => (sel === '.shellV2TabHidden' ? (tab.hidden ? tab : null) : sel === '.shellV2Tab' ? tab : null) }
  return { el, tab }
}

beforeEach(() => {
  ios = []; mos = []; cleanup = null
  _resetSoundQuiet(); _resetLessonOpen()
  globalThis.IntersectionObserver = FakeIO
  globalThis.MutationObserver = FakeMO
})
afterEach(() => { cleanup?.(); delete globalThis.IntersectionObserver; delete globalThis.MutationObserver })

describe('useTabSilence: тишина только пока вкладка «Голос» реально на экране', () => {
  it('вкладка скрыта (visibility:hidden), а IntersectionObserver говорит «видно» → тишины НЕТ (раньше держалась вечно)', () => {
    const { el } = makeEl(true)
    useTabSilence({ current: el })
    ios[0].fire(true)
    expect(isSilenced()).toBe(false)
  })

  it('вкладка открыта → тишина; ушли на другую вкладку (класс скрытия) → тишина снята; вернулись → снова', () => {
    const { el, tab } = makeEl(false)
    useTabSilence({ current: el })
    ios[0].fire(true)
    expect(silenceReasons()).toEqual(['admin-voice'])
    tab.hidden = true; mos[0].fire()
    expect(isSilenced()).toBe(false)
    tab.hidden = false; mos[0].fire()
    expect(isSilenced()).toBe(true)
  })

  it('открыт плеер урока поверх вкладки → тишина снята (звуки урока играют)', () => {
    const { el } = makeEl(false)
    useTabSilence({ current: el })
    ios[0].fire(true)
    expect(isSilenced()).toBe(true)
    lessonOpened()
    expect(isSilenced()).toBe(false)
  })

  it('геометрия: вне экрана (IntersectionObserver false) → тишины нет; размонтирование всегда снимает тишину', () => {
    const { el } = makeEl(false)
    useTabSilence({ current: el })
    ios[0].fire(false)
    expect(isSilenced()).toBe(false)
    ios[0].fire(true)
    expect(isSilenced()).toBe(true)
    cleanup(); cleanup = null
    expect(isSilenced()).toBe(false)
  })

  it('без IntersectionObserver: тишина, пока вкладка не скрыта классом', () => {
    delete globalThis.IntersectionObserver
    const { el, tab } = makeEl(false)
    useTabSilence({ current: el })
    expect(isSilenced()).toBe(true)
    tab.hidden = true; mos[0].fire()
    expect(isSilenced()).toBe(false)
  })
})

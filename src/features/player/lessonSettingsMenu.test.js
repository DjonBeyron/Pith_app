import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const menu     = read('./LessonSettingsMenu.jsx')
const bar      = read('./PlayerTopBar.jsx')
const player   = read('./LessonPlayer.jsx')
const gate     = read('./AudioGlowGate.jsx')
const overlays = read('./PlayerOverlays.jsx')
const sounds   = read('../../shared/lib/sounds.js')
const prefs    = read('./lessonPrefs.js')
const css      = read('../../styles/player/settings-menu.css')

// Шестерёнка в шапке урока: что подключено и где стоят условия. Поведение
// самих настроек — lessonPrefs.test.js; здесь — проводка
describe('шестерёнка в шапке: подключение', () => {
  it('меню стоит в шапке рядом с кнопками звука и получает обработчики лога', () => {
    expect(bar).toContain("import LessonSettingsMenu from './LessonSettingsMenu.jsx'")
    expect(bar).toContain('<LessonSettingsMenu onDownloadLog={onDownloadLog} onCopyLog={onCopyLog} />')
    expect(bar.indexOf('<LessonVolumeButtons />')).toBeLessThan(bar.indexOf('<LessonSettingsMenu'))
  })

  it('стили подключены в index.css, поповер не шире экрана и лежит выше всех слоёв плеера', () => {
    expect(read('../../index.css')).toContain("@import './styles/player/settings-menu.css'")
    expect(css).toMatch(/\.smMenu \{[^}]*max-width: calc\(100% - 16px\)/)
    expect(css).toMatch(/\.smMenu \{[^}]*position: absolute/)
    // .smWrap без position: relative — иначе поповер привязался бы к кнопке и мог выехать за край
    expect(css).not.toMatch(/\.smWrap \{[^}]*position/)
  })

  it('поповер — портал в .lessonPlayer (не в шапке z-index 5): тап по нему не считается «вне»', () => {
    expect(menu).toContain('createPortal(')
    expect(menu).toContain('usePlayerPopover(wrapRef')
    expect(menu).toContain('!menuRef.current?.contains(e.target)')
    expect(read('./usePlayerPopover.js')).toContain("el.closest('.lessonPlayer')")
    expect(read('./LessonVolumeButtons.jsx')).toContain('createPortal(')
  })

  it('три переключателя для всех — role=switch с aria-checked, подписи по ТЗ', () => {
    expect(menu).toContain('role="switch"')
    expect(menu).toContain('aria-checked={on}')
    expect(menu).toContain('label="Звук печатанья" pref="typing"')
    expect(menu).toContain('label="Звук получения XP" pref="xp"')
    expect(menu).toContain('label="Эквалайзер" pref="equalizer"')
  })

  it('закрытие: тап вне, Esc с возвратом фокуса на кнопку; aria у кнопки и диалога', () => {
    expect(menu).toContain("document.addEventListener('pointerdown', onDown, true)")
    expect(menu).toContain("e.key !== 'Escape'")
    expect(menu).toContain('btnRef.current?.focus()')
    expect(menu).toContain('aria-expanded={open}')
    expect(menu).toContain('role="dialog" aria-label="Настройки"')
  })
})

describe('раздел «Админ»', () => {
  it('рисуется только при isAdmin (эффективном, из контекста) и идёт ПЕРЕД пользовательскими пунктами', () => {
    expect(menu).toContain('const { isAdmin } = useAdmin()')
    expect(menu).toContain('{isAdmin && (')
    expect(menu).toContain('<div className="smTitle">Админ</div>')
    expect(menu.indexOf('{isAdmin && (')).toBeLessThan(menu.indexOf('label="Звук печатанья"'))
    // и всё админское — внутри этого блока: и лог, и hud, и ползунки
    const adminBlock = menu.slice(menu.indexOf('{isAdmin && ('), menu.indexOf('aria-label="Звук и свечение"'))
    for (const part of ['onDownloadLog', 'handleCopy', 'pref="hud"', '<AdminAudioSliders />']) {
      expect(adminBlock).toContain(part)
    }
  })

  it('лог переехал из шапки: у админа кнопок «⬇ лог»/«⧉» в шапке нет, у ученика остались как были', () => {
    expect(bar).toContain('const showLogBtns = showDebugUi && !isAdmin')
    expect(bar).not.toMatch(/\{showDebugUi && \(\s*<button\s+className="playerTopBarDebugBtn"/)
    // copyState/handleCopy — один хук на меню и шапку, без копипасты
    expect(bar).toContain('useCopyLog(onCopyLog)')
    expect(menu).toContain('useCopyLog(onCopyLog)')
  })

  it('«Показывать FPS и версию» прячет штамп и fps только у админа, датчик при этом не выключается', () => {
    expect(overlays).toContain('const showHud = showDebugUi && hudVisible(isAdmin, hud)')
    expect(overlays).toContain('usePerfProbe(showDebugUi)')
    expect(overlays).toContain('{showHud && perfSummary &&')
    expect(prefs).toContain("hud:       'pithy_lesson_hud'")
  })
})

describe('что именно гасят настройки', () => {
  it('эквалайзер: AudioGlow монтируется только через gate, выключено — не монтируется вовсе', () => {
    expect(player).toContain("import AudioGlowGate from './AudioGlowGate.jsx'")
    expect(player).toContain('<AudioGlowGate />')
    expect(player).not.toMatch(/<AudioGlow \/>/)
    expect(gate).toContain('return useEqualizerEnabled() ? <AudioGlow /> : null')
  })

  it('звуки: playSound спрашивает фильтр, а lessonPrefs его регистрирует (shared не импортирует features)', () => {
    expect(sounds).toContain('export function setSoundFilter(fn)')
    expect(sounds).toContain('soundFilter && !soundFilter(name)')
    expect(prefs).toContain('setSoundFilter(isSoundEnabledByUser)')
    expect(sounds).not.toMatch(/from '\.\.\/\.\.\/features/)
    // модуль подключён при старте приложения — фильтр работает и вне урока (шарики XP в итогах)
    expect(read('../../app/App.jsx')).toContain("import '../features/player/lessonPrefs.js'")
  })

  it('анимации не завязаны на настройки: XpTransfer/XpFloat/WaitingDots lessonPrefs не знают', () => {
    for (const f of ['../../shared/ui/XpTransfer.jsx', './XpFloat.jsx', './waiting/WaitingDots.jsx']) {
      expect(read(f)).not.toContain('lessonPrefs')
    }
  })
})

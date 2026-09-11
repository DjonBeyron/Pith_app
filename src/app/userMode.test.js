import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Тесты гоняются в node без DOM — подменяем хранилище до импорта модуля,
// он читает `localStorage` по голому имени (значит, из globalThis)
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { getUserMode, setUserMode, subscribeUserMode } = await import('../shared/lib/userMode.js')

describe('хранилище режима пользователя', () => {
  beforeEach(() => { setUserMode(false) })

  it('переживает перезагрузку — флаг в localStorage', () => {
    setUserMode(true)
    expect(localStorage.getItem('pithy_user_mode_v1')).toBe('1')
    expect(getUserMode()).toBe(true)
    setUserMode(false)
    // Не 'false', а удаление ключа: иначе старый ключ остался бы мусором
    expect(localStorage.getItem('pithy_user_mode_v1')).toBe(null)
    expect(getUserMode()).toBe(false)
  })

  it('будит подписчиков (на них держится useSyncExternalStore)', () => {
    let hits = 0
    const off = subscribeUserMode(() => { hits++ })
    setUserMode(true)
    setUserMode(false)
    expect(hits).toBe(2)
    off()
    setUserMode(true)
    expect(hits).toBe(2)
  })
})

describe('что режим гасит, а что оставляет', () => {
  const ctx   = read('./AdminContext.jsx')
  const shell = read('./ShellV2.jsx')

  it('isAdmin становится ложным, настоящий статус остаётся отдельно', () => {
    // Все 14 потребителей useAdmin() читают isAdmin — гасим в одном месте,
    // вместо правки каждого файла
    expect(ctx).toContain('isAdmin: base.isAdmin && !userMode')
    expect(ctx).toContain('isRealAdmin: base.isAdmin')
    // Не-админу чужой флаг в localStorage ничего не даёт
    expect(ctx).toContain('userMode: base.isAdmin && userMode')
  })

  it('дверь назад не запирается: вкладка «Админ» на настоящем статусе', () => {
    const nav   = shell.slice(shell.indexOf('<nav className="shellV2Nav">'))
    const panel = shell.slice(shell.indexOf('<div className="shellV2Content">'), shell.indexOf('<nav className="shellV2Nav">'))
    expect(nav).toContain('{isRealAdmin && (')
    expect(panel).toContain('{isRealAdmin && (')
  })

  it('всплывашка «продолжить редактирование» гаснет вместе с остальным', () => {
    expect(shell).toContain('{isAdmin && !resumeClosed')
  })

  it('вкладка «Файлы» внутри админки работает по настоящему статусу', () => {
    // Иначе админка показывала бы сама себе «нет прав администратора»
    expect(read('../features/admin/AdminTab.jsx')).toContain('isRealAdmin: isAdmin')
  })

  it('дебаг-панель предзагрузки идёт через контекст, а не мимо него', () => {
    const card = read('../features/lessons/LessonLaunchCard.jsx')
    expect(card).not.toContain('} from \'../../shared/lib/useIsAdmin.js\'')
    expect(card).toContain("import { useAdmin } from '../../app/AdminContext.jsx'")
  })

  it('переключатель стоит над субвкладками админки', () => {
    const av = read('../features/admin/AdminV2.jsx')
    expect(av.indexOf('<AdminUserModeToggle />')).toBeLessThan(av.indexOf('className="avTabs"'))
  })
})

// Кнопка «⬇ лог» и версия в шапке урока — один диагностический набор.
// Админ видит его всегда, остальные — только если админ включил (общая
// настройка в базе, а не в localStorage: она про чужие устройства)
describe('лог и версия в шапке урока', () => {
  const bar = read('../features/player/PlayerTopBar.jsx')

  it('набор закрыт общим условием, а не висит всегда', () => {
    expect(bar).toContain('const showDebugUi   = isAdmin || debugUiForAll')
    expect(bar).toContain('{showDebugUi && <span className="playerTopBarVersion">v{APP_VERSION}</span>}')
    // Кнопка раньше рисовалась вообще без проверки — из-за этого она
    // оставалась на экране и в «режиме пользователя»
    expect(bar).toContain('{showDebugUi && (')
    const btn = bar.slice(bar.indexOf('className="playerTopBarDebugBtn"'))
    expect(btn.slice(0, btn.indexOf('>⬇ лог<'))).toContain('onClick={onDownloadLog}')
  })

  it('в «режиме пользователя» гаснет вместе с остальным админским', () => {
    // Эффективный isAdmin из контекста, а не useIsAdmin напрямую
    expect(bar).toContain("import { useAdmin } from '../../app/AdminContext.jsx'")
    expect(bar).toContain('const { isAdmin } = useAdmin()')
  })

  it('настройка общая — лежит в базе, пишет только админ', () => {
    const api = read('../shared/api/appSettingsApi.js')
    expect(api).toContain("const PLAYER_DEBUG_UI_KEY = 'player_debug_ui'")
    // .select() обязателен: без него UPDATE, отсечённый RLS, выглядел бы удачей
    const save = api.slice(api.indexOf('export async function savePlayerDebugUi'))
    expect(save).toContain(".select('key')")
    expect(save).toContain('if (!data?.length)')
  })

  it('значение прогревается на старте — шапка не моргает кнопкой', () => {
    // Зеркало в localStorage даёт верный первый кадр, ответ сервера уточняет
    const lib = read('../shared/lib/usePlayerDebugUi.js')
    expect(lib).toContain("const LS = 'pithy_player_debug_ui_v1'")
    expect(lib).toContain('if (on !== null) apply(on)')
    expect(read('./ShellV2.jsx')).toContain('prefetchPlayerDebugUi()')
  })

  it('тумблер заперт, пока сервер не подтвердил запись', () => {
    const t = read('../features/admin/AdminDebugUiToggle.jsx')
    expect(t).toContain('disabled={saving}')
    expect(t).toContain('await setPlayerDebugUi(next)')
  })
})

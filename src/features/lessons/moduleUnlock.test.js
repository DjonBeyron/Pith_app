import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
}

const { isModuleUnlocked, unlockModule, relockModule } =
  await import('../../shared/lib/moduleUnlock.js')

describe('решение «открыть уроки без диагностики»', () => {
  beforeEach(() => store.clear())

  it('запоминается по модулю, а не на всё приложение', () => {
    unlockModule('m1')
    expect(isModuleUnlocked('m1')).toBe(true)
    // У каждого модуля своя диагностика — отказ в одном не решает за соседний
    expect(isModuleUnlocked('m2')).toBe(false)
  })

  it('переживает перезагрузку и снимается сбросом модуля', () => {
    unlockModule('m1')
    expect(store.get('pithy_module_unlocked_v1')).toBe('["m1"]')
    relockModule('m1')
    expect(isModuleUnlocked('m1')).toBe(false)
  })

  it('не падает без id модуля', () => {
    expect(isModuleUnlocked(null)).toBe(false)
    expect(() => unlockModule(null)).not.toThrow()
    expect(() => relockModule(undefined)).not.toThrow()
  })
})

// Главная дыра, ради которой всё затевалось: XP Старта входит в порог финала,
// и без диагностики финал был бы недостижим навсегда
describe('финал открывается и без диагностики', () => {
  const graph = read('./ModuleGraph.jsx')
  const view  = read('./CurriculumView.jsx')

  it('доля Старта засчитывается в порог, пока он не пройден', () => {
    expect(graph).toContain(
      'const startSkipXp = unlocked && !completedIds.has(start.id) ? (start.lessonXp ?? 0) : 0')
    expect(graph).toContain(', 0) + startSkipXp')
  })

  it('пройдёт Старт позже — итог не меняется', () => {
    // Слагаемое исчезает (completedIds.has(start.id)), а earnedXp вырастает
    // ровно на ту же величину: двойного счёта нет, бар не прыгает
    const line = graph.slice(graph.indexOf('const startSkipXp'))
    expect(line.slice(0, line.indexOf('\n'))).toContain('!completedIds.has(start.id)')
  })

  it('модуль без XP: порогом служит «все пройдены» — там тот же зачёт', () => {
    expect(graph).toContain(
      'const allDone    = nonFinal.every(l => completedIds.has(l.id) || (unlocked && l.id === start.id))')
  })

  it('Старт остаётся непройденным — ни XP в профиль, ни зелёной галочки', () => {
    // Разблокировка НЕ помечает Старт пройденным: иначе он позеленел бы и
    // соврал, а ещё запустился бы полёт XP из него
    expect(graph).not.toContain('markLessonCompleted')
    expect(view).not.toContain('simulateLessonsDone([lessons[0].id])')
  })

  it('полёт XP привязан к реальному прохождению, разблокировка его не трогает', () => {
    expect(graph).toContain('if (!justCompleted || flight || !arcs.length || animHold) return')
  })
})

describe('замок и его снятие', () => {
  const graph = read('./ModuleGraph.jsx')
  const hint  = read('./LessonLockedHint.jsx')
  const view  = read('./CurriculumView.jsx')

  it('замок снимается со всех уроков модуля разом', () => {
    expect(graph).toContain('const locked = !startDoneShown && !unlocked')
    expect(graph).toContain(
      'if (!isAdmin && id !== start.id && !startDoneShown && !unlocked) { setLockedHint(true); return }')
  })

  it('предупреждение говорит, что откроются все уроки и чем это хуже', () => {
    expect(hint).toContain('все уроки модуля')
    expect(hint).toContain('слабые места')
    // И что решение не тупиковое — диагностику можно пройти позже
    expect(hint).toContain('Диагностику можно пройти и позже')
  })

  it('предупреждение — отдельный шаг, а не мелкий текст под кнопкой', () => {
    expect(hint).toContain('const [warning, setWarning] = useState(false)')
    expect(hint).toContain('onClick={() => setWarning(true)}')
    expect(hint).toContain('onClick={onUnlock}')
  })

  it('сброс модуля возвращает замки', () => {
    // Иначе «как новый пользователь» врал бы: прогресс ноль, а уроки открыты
    const reset = view.slice(view.indexOf('async function handleResetProgress'))
    expect(reset.slice(0, reset.indexOf('\n  }'))).toContain('relockModule(curriculumId)')
  })

  it('карточки переходят в «открыто» волной, без рывка', () => {
    expect(graph).toContain("style={unlockAnim ? { '--unlock-i': i } : undefined}")
    const css = read('../../styles/lesson-locked-hint.css')
    expect(css).toContain('animation-delay: calc(var(--unlock-i, 0) * 90ms)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('карточка запуска урока', () => {
  const card = read('./LessonLaunchCard.jsx')

  it('окно сразу нужного размера — каркас вместо одной строчки', () => {
    expect(card).toContain('<LaunchSkeleton title={lessonTitle} info={info} />')
    expect(card).not.toContain('Загрузка урока...</p>')
  })

  it('заголовок и энергия не ждут сценария — рисуются в первый кадр', () => {
    // Сценарий едет по сети ~0.7 с; название уже знает схема модуля, энергия —
    // кэш профиля. Раньше оба блока дорисовывались только вместе со сценарием
    expect(read('./CurriculumView.jsx')).toContain("lessonTitle={lessons.find(l => l.id === launchId)?.title ?? ''}")
    expect(read('./LaunchSkeleton.jsx')).toContain('<LaunchEnergyRow info={info} />')
    // Расчёт энергии поднят из предзагрузчика в саму карточку
    expect(card).toContain('const info = launchEnergyInfo({ retake, energyFree, openedAt })')
    expect(card).not.toContain('const payingCase = !!profile')
  })

  it('каркас не показывает ложный прогресс', () => {
    // Бегущая полоса внутри жёлоба в первом кадре стояла на месте и читалась
    // как «загружено 35%», а потом обнулялась до настоящего прогресса
    const skel = read('./LaunchSkeleton.jsx')
    expect(skel).not.toContain('launchSkelBar')
    expect(skel).toContain('className="launchSkelTrack"')
    expect(read('../../styles/lessons.css')).not.toContain('launchSkelSlide')
  })

  it('подпись под баром не меняет слово на полпути', () => {
    // Было «Загрузка урока…» → «Подготовка: 42%»: читалось как смена этапа,
    // хотя это одна и та же загрузка
    expect(card).toContain('`Загрузка урока: ${pct}%`')
    expect(card).not.toContain('Подготовка:')
    // Включая проценты: без них «0%» появлялось отдельным элементом позже
    expect(read('./LaunchSkeleton.jsx')).toContain('Загрузка урока: 0%')
  })

  it('заголовок не подменяется на полпути', () => {
    // lessonData.title — это надпись для шапки чата, она может отличаться от
    // названия урока: возьми её здесь — и заголовок сменился бы при доезде
    expect(card).toContain('title: chatTitle, teacherName')
  })

  it('кнопка «Начать урок» брендового цвета', () => {
    expect(card).not.toContain('#4caf50')
    expect(card).toContain("background: canStart ? '#b6fe3b' : '#333'")
    expect(card).toContain("color: canStart ? '#0d1500' : '#666'")
  })
})

// Оба попапа всплывают поверх схемы — на плоском фоне они читались вставкой
// из другого приложения
describe('узор схемы в попапах', () => {
  it('карточка запуска и попап замка берут текстуру стартового нода', () => {
    expect(read('../../styles/lessons.css')).toContain('var(--mg-tex-start) center / 180px 180px no-repeat')
    expect(read('../../styles/lesson-locked-hint.css')).toContain('var(--mg-tex-start) center / 180px 180px no-repeat')
    // Фон карточки запуска переехал из inline-стиля в класс — иначе текстуру
    // было бы некуда положить
    expect(read('./LessonLaunchCard.jsx')).toContain('className="launchCard"')
    expect(read('./LessonLaunchCard.jsx')).not.toContain("background: '#1a1a1a'")
  })
})

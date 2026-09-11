import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Снял админ публикацию — сервер урок больше не отдаёт (RLS, миграция
// security-review 2026-07-29). Но у ученика с уже открытым приложением список
// на экране остаётся старым, он жмёт «Начать» — и должен понять, что случилось,
// а не получить «не удалось загрузить» под видом сбоя сети.
describe('закрытый урок не отдаётся ученику', () => {
  const api = read('../../shared/lib/lessonsApi.js')
  const card = read('./LessonLaunchCard.jsx')

  it('защита стоит на сервере, а не в интерфейсе', () => {
    // Клиентскую проверку обойти можно, политику RLS — нет. Здесь сторож на
    // случай, если политику когда-нибудь упростят: published обязателен, и
    // вместе с ним — проверка доступа к платному модулю
    const mig = read('../../../supabase/migrations/20260729120000_fix_content_paywall_and_race_time.sql')
    const rule = mig.slice(mig.indexOf('CREATE POLICY "lessons_select_all"'))
    const body = rule.slice(0, rule.indexOf(');'))
    expect(body).toContain('"published" = true')
    expect(body).toContain('"public"."has_pro_access"()')
    expect(body).toContain('"public"."is_admin"()')
  })

  it('загрузка сценария различает «нет доступа» и сбой сети', () => {
    // maybeSingle вместо single: отсутствие строки — это не ошибка, а ответ
    expect(api).toContain('.maybeSingle()')
    expect(api).toContain('if (!data) { dbg(')
    expect(api).toContain('return null')
  })

  it('карточка запуска говорит, что урок закрыт', () => {
    // Случай уже открытого приложения: список на экране старый, но запуск
    // не проходит — и молчать об этом нельзя
    expect(card).toContain("if (!raw) { setError('Этот урок сейчас закрыт'); return }")
    // Сбой сети остаётся отдельным сообщением
    expect(card).toContain("setError('Не удалось загрузить урок')")
  })
})

describe('окно запуска урока', () => {
  const overlay = read('../../app/LessonNavOverlay.jsx')
  const css     = read('../../styles/lesson-nav-overlay.css')

  it('карточка всплывает над экраном, с которого урок открыли', () => {
    // Слой был сплошным (#0b0d10) — вместо «Моих уроков» под карточкой был
    // чёрный прямоугольник
    expect(overlay).toContain("overlay.kind === 'lesson' && !started ? ' lessonNavOverlay--launch' : ''")
    expect(css).toContain('.lessonNavOverlay--launch')
    expect(css.slice(css.indexOf('.lessonNavOverlay--launch'))).toContain('background: transparent')
  })

  it('как только урок пошёл, слой снова непрозрачный', () => {
    // Под плеером просвечивать ничего не должно
    expect(overlay).toContain('onStarted={() => setStarted(true)}')
    expect(read('./StandaloneLessonRunner.jsx')).toContain('onStarted?.()')
  })

  it('заголовок виден сразу и при запуске вне схемы модуля', () => {
    // Название урока-закладки знает сам список — доносим его до карточки
    expect(read('../feed/MyLessons.jsx')).toContain('onOpenLesson(l.id, l.title)')
    expect(read('../feed/FeedTab.jsx')).toContain('targetTitle: title')
    expect(read('../../app/LessonNavContext.jsx')).toContain("lessonTitle: target.targetTitle ?? ''")
    // А если название так и не передали — берём настоящее из самого урока
    expect(read('./LessonLaunchCard.jsx')).toContain('{title || name}')
  })

  it('у попапов схемы один фон', () => {
    // Окно запуска было светлее (#1a1a1a) и рядом с «Урок пока закрыт»
    // смотрелось из другого набора
    expect(read('../../styles/lessons.css')).toContain('--lesson-popup-bg: #14171e')
    expect(read('../../styles/lessons.css')).toContain('var(--lesson-popup-bg)')
    expect(read('../../styles/lesson-locked-hint.css')).toContain('var(--lesson-popup-bg)')
  })
})

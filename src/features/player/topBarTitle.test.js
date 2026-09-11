import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const bar      = read('./PlayerTopBar.jsx')
const css      = read('../../styles/player/topbar.css')
const settings = read('../canvas/LessonSettingsTab.jsx')
const hook     = read('../canvas/useTeacherSettings.js')
const launch   = read('../lessons/LessonLaunchCard.jsx')
const page     = read('../canvas/CanvasPage.jsx')

// Вместо «онлайн» в шапке — что сейчас проходят. Замер на 375px: шапка
// 375x52 при любой длине названия, строка обрезается (180px из 180px текста),
// горизонтального скролла нет.
describe('надпись в шапке чата', () => {
  it('показывает, что изучают, вместо «онлайн»', () => {
    expect(bar).toContain("{title ? `изучаем ${title}` : 'онлайн'}")
  })

  it('длинное название сокращается, а не растягивает шапку', () => {
    const rule = css.slice(css.indexOf('.playerTopBarStatus {'))
    const body = rule.slice(0, rule.indexOf('}'))
    expect(body).toContain('text-overflow: ellipsis')
    expect(body).toContain('white-space: nowrap')
    expect(body).toContain('overflow: hidden')
    // Без min-width: 0 у родителя флекс не даёт себя сжать меньше содержимого,
    // и вместо многоточия шапка поехала бы вширь
    const info = css.slice(css.indexOf('.playerTopBarInfo {'))
    expect(info.slice(0, info.indexOf('}'))).toContain('min-width: 0')
  })

  it('старого отдельного поля с названием больше нет', () => {
    // Оно жалось к 140px и на узком экране пряталось совсем
    expect(bar).not.toContain('playerTopBarLesson')
    expect(css).not.toContain('playerTopBarLesson')
  })
})

// Своя надпись живёт в script урока (jsonb) — миграция не нужна
describe('своя надпись вместо названия урока', () => {
  it('поле есть в настройках урока и вне веток выбора учителя', () => {
    expect(settings).toContain('onChatTitleChange(e.target.value)')
    // Стоит ДО выбора режима учителя: это свойство урока, а не учителя
    expect(settings.indexOf('onChatTitleChange')).toBeLessThan(settings.indexOf('lessonSettingsModes'))
    // Пустое поле подсказывает, что возьмётся название урока
    expect(settings).toContain("placeholder={lessonTitle || 'название урока'}")
  })

  it('сохраняется в черновик и в скрипт урока', () => {
    expect(hook).toContain("const [chatTitle,       setChatTitle]       = useState('')")
    expect(hook).toContain("setChatTitle(saved.chatTitle ?? '')")
    expect(hook).toContain("const serverChatTitle = script?.chatTitle ?? ''")
    expect(hook).toContain('chatTitle:       chatTitle.trim() || undefined,')
  })

  it('пустая надпись — берётся название урока', () => {
    // Одно место на все три запуска: модуль, отдельный урок и гонка берут
    // playerData отсюда
    expect(launch).toContain("(raw?.script?.chatTitle || '').trim() || raw?.title || ''")
    // И то же самое в превью из канваса
    expect(page).toContain('lessonTitle={chatTitle.trim() || title}')
  })
})

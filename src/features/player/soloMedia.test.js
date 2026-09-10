import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { shouldYieldTo, shouldBlock, SOLO_LOCK } from './useSoloMedia.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Голос и видео звучат по одному: запустили новое — предыдущее на паузу.
const voice = (over = {}) => ({ name: 'voice', muted: false, paused: false, ...over })
const loop  = (over = {}) => ({ name: 'loop',  muted: true,  paused: false, ...over })

describe('в переписке звучит что-то одно', () => {
  it('новый звук глушит тот, что уже играл', () => {
    const started = voice({ name: 'new' })
    expect(shouldYieldTo(started, voice({ name: 'old' }))).toBe(true)
  })

  it('сам себя не глушит', () => {
    const a = voice()
    expect(shouldYieldTo(a, a)).toBe(false)
  })

  it('уже стоящее на паузе не трогаем', () => {
    expect(shouldYieldTo(voice(), voice({ paused: true }))).toBe(false)
  })

  it('немой запуск никого не перебивает — это петля кружка или стикера', () => {
    // Иначе каждый виток muted-петли глушил бы голосовое, которое слушают
    expect(shouldYieldTo(loop(), voice())).toBe(false)
  })

  it('немую петлю не останавливаем — иначе кружок станет стоп-кадром', () => {
    expect(shouldYieldTo(voice(), loop())).toBe(false)
  })

  it('видео со звуком и голосовое глушат друг друга одинаково', () => {
    const video = voice({ name: 'video' })
    const audio = voice({ name: 'audio' })
    expect(shouldYieldTo(video, audio)).toBe(true)
    expect(shouldYieldTo(audio, video)).toBe(true)
  })

  it('пустые аргументы ничего не ломают', () => {
    expect(shouldYieldTo(null, voice())).toBe(false)
    expect(shouldYieldTo(voice(), null)).toBe(false)
  })
})

// Разбор авто-таблицы идёт по таймлайну: по нему подсвечиваются ячейки,
// собирается фраза и запускается проверка. Пауза посреди разбора роняет весь
// прогон, поэтому пока её аудио звучит, чужое просто не пускаем.
describe('во время авто-таблицы чужой звук не пускаем', () => {
  const lead   = (over = {}) => ({ name: 'таблица', paused: false, hasAttribute: () => true, ...over })
  const guest  = (over = {}) => ({ name: 'гость', paused: true, hasAttribute: () => false, ...over })

  it('запуск сообщения отклоняется, пока идёт разбор', () => {
    expect(shouldBlock(guest(), lead())).toBe(true)
  })

  it('доигравшая таблица никого не держит', () => {
    expect(shouldBlock(guest(), lead({ paused: true }))).toBe(false)
  })

  it('таблицы нет — обычные правила', () => {
    expect(shouldBlock(guest(), null)).toBe(false)
  })

  it('сама таблица себя не блокирует', () => {
    const l = lead()
    expect(shouldBlock(l, l)).toBe(false)
    expect(shouldBlock(lead({ name: 'вторая' }), lead())).toBe(false)
  })

  it('метка ведущего стоит на аудио авто-таблицы', () => {
    expect(SOLO_LOCK).toBe('data-solo-lock')
    expect(read('./panels/table-dictator/TableDictatorView.jsx')).toContain('data-solo-lock=""')
  })
})

describe('проводка запрета параллельного звука', () => {
  const hook   = read('./useSoloMedia.js')
  const player = read('./LessonPlayer.jsx')

  it('перехват один на весь плеер и ловит элементы, добавленные позже', () => {
    // 'play' не всплывает — только capture-фаза видит его на контейнере
    expect(hook).toContain("el.addEventListener('play', onPlay, true)")
    expect(hook).toContain("el.removeEventListener('play', onPlay, true)")
    expect(hook).toContain("querySelectorAll('audio, video')")
  })

  it('это ПАУЗА, а не стоп: позиция сохраняется', () => {
    expect(hook).toContain('m.pause()')
    expect(hook).not.toContain('currentTime = 0')
  })

  it('плеер подключает перехват', () => {
    expect(player).toContain("import { useSoloMedia } from './useSoloMedia.js'")
    expect(player).toContain('useSoloMedia(playerRef)')
  })
})

describe('у ответа ученика нет растушёвки низа', () => {
  const css = read('../../styles/player/modules/text.css')

  it('реакция на ответе больше не растворяет его нижний край', () => {
    // Пузырь с ответом выглядел недорисованным, особенно когда ехал вниз
    // вместе с закрывающейся панелью таблицы или сборки фразы
    expect(css).not.toMatch(/\.playerMsgBubble--response\.playerMsgBubbleReacted\s*\{/)
  })

  it('якорь для эмодзи при этом остался', () => {
    const reaction = read('../../styles/player/modules/reaction.css')
    expect(reaction).toContain('.playerMsgBubbleReacted {')
    expect(read('./modules/reaction/ReactionModule.jsx'))
      .toContain("target.classList.add('playerMsgBubbleReacted')")
  })
})

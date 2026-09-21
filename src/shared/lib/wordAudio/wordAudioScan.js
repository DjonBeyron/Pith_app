import { supabase } from '../../api/supabase.js'
import { dbg } from '../debug.js'
import { collectLessonWords } from './collectLessonWords.js'

// Слова ВСЕХ уроков для бейджа «не озвучено» в канвасе (решение: бейдж по
// всем урокам, не только по открытому). Скрипты уроков скачиваются один раз
// на сессию (админ, десятки уроков — секунды), дальше кэш; открытый урок
// подменяется живыми нодами холста (setLessonWords) — так бейдж учитывает и
// несохранённые правки, и сохранение (lessonSavedBus).
//
// byLesson: Map lessonId → { title, words: Map key→text }

let byLesson = null   // null — ещё не сканировали
let pending = null
// Открытые холсты: их слова считаются из нод на экране, а не из базы
const live = new Map()
const listeners = new Set()

function notify() { listeners.forEach(fn => fn()) }

export function subscribeWordScan(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function wordScanReady() {
  return byLesson !== null
}

export async function scanAllLessons(force = false) {
  if (byLesson && !force) return byLesson
  if (pending) return pending
  pending = supabase.from('lessons').select('id, title, script')
    .then(({ data, error }) => {
      pending = null
      if (error) { dbg('[DB ERROR] word scan lessons', error.message); return byLesson ?? new Map() }
      const next = new Map()
      for (const l of data ?? []) {
        next.set(l.id, { title: l.title ?? '', words: collectLessonWords(l.script?.nodes ?? []) })
      }
      // Живые слова открытого урока (если холст уже подменил их) — не затираем
      // серверным снимком, он старее
      for (const [id, v] of live) next.set(id, v)
      byLesson = next
      dbg('[word scan]', next.size, 'уроков')
      notify()
      return byLesson
    })
  return pending
}

export function setLessonWords(lessonId, title, nodes) {
  const entry = { title, words: collectLessonWords(nodes) }
  live.set(lessonId, entry)
  if (byLesson) { byLesson = new Map(byLesson); byLesson.set(lessonId, entry) }
  notify()
}

export function clearLiveLesson(lessonId) {
  live.delete(lessonId)
}

// Слова конкретного урока (Map key→text) — из живого холста или снимка
export function lessonWords(lessonId) {
  return live.get(lessonId)?.words ?? byLesson?.get(lessonId)?.words ?? new Map()
}

// Все слова всех уроков: Map key → { text, lessons: [title, …] }
export function allLessonWords() {
  const out = new Map()
  for (const { title, words } of (byLesson ?? live).values()) {
    for (const [key, text] of words) {
      const e = out.get(key) ?? { text, lessons: [] }
      if (!e.lessons.includes(title)) e.lessons.push(title)
      out.set(key, e)
    }
  }
  return out
}

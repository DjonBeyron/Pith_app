import { supabase } from '../../../shared/api/supabase.js'
import { loadCurricula } from '../../../shared/lib/curriculaApi.js'
import { listLessonCards } from '../../../shared/lib/lessonsApi.js'
import { listWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { listTemplates } from '../../../shared/api/pushTemplatesApi.js'

// Загрузка входа для buildLaunchStats через существующие API приложения. Каждый источник читается отдельно:
// сбой одного (нет прав на push_templates, таблицы нет, сеть) не валит остальные — часть уходит в null,
// а причина — в reasons (строка «нет данных» в отчёте).
// Админ видит и черновики (RLS), поэтому «фразы вне ленты» здесь считаются полностью.

async function scenesList() {
  const { data, error } = await supabase.from('scenes').select('id, status')
  if (error) throw new Error(error.message)
  return data ?? []
}

// listWordAudio сам глотает ошибку и отдаёт пустую карту: пустую считаем «нет данных», а не «ни у одного слова нет озвучки»
async function wordAudioMap() {
  const map = await listWordAudio(true)
  if (!(map instanceof Map) || map.size === 0) throw new Error('озвучка слов не прочиталась или пуста')
  return map
}

const SOURCES = {
  curricula: loadCurricula,
  lessonCards: listLessonCards,
  wordAudio: wordAudioMap,
  pushTemplates: listTemplates,
  scenes: scenesList,
}

// → { curricula, lessonCards, wordAudio, pushTemplates, scenes, reasons: { источник: текст ошибки } }
export async function loadLaunchData() {
  const names = Object.keys(SOURCES)
  const results = await Promise.allSettled(names.map(n => SOURCES[n]()))
  const out = { reasons: {} }
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out[names[i]] = r.value
    else {
      out[names[i]] = null
      out.reasons[names[i]] = r.reason?.message || String(r.reason)
    }
  })
  return out
}

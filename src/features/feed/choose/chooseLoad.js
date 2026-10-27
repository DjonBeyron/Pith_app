import { loadCurricula } from '../../../shared/lib/curriculaApi.js'
import { listLessonCards } from '../../../shared/lib/lessonsApi.js'
import { getDefaultTeacher } from '../../../shared/api/appSettingsApi.js'
import { buildDecks } from '../../review/reviewDecks.js'

// Загрузка колод для игры ленты (те же запросы, что у экрана повторения: модули + карточки уроков). Тяжёлая, поэтому
// зовётся лениво (chooseGame.js — после первых слайдов) и держится в памяти несколько минут: возврат из экрана
// модуля пересоздаёт игру, но не повторяет запрос. Сбой не кэшируется — следующая попытка пойдёт заново.
// → { decks: Map(слово → колода), teacher: { name, logo, crop } } (общий учитель — для карточек без своего)
const TTL_MS = 5 * 60 * 1000
let cached = null // { at, value }

export async function loadChooseDecks(now = Date.now) {
  if (cached && now() - cached.at < TTL_MS) return cached.value
  const [curricula, lessons, teacher] = await Promise.all([loadCurricula(), listLessonCards(), getDefaultTeacher()])
  const value = { decks: buildDecks(curricula, lessons), teacher }
  cached = { at: now(), value }
  return value
}

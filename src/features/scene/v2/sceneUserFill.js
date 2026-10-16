import { usesVars, fillSceneVars } from './sceneVars.js'
import { buildSceneValues, sceneSeed } from './sceneVarsValues.js'
import { isObj } from './sceneConstants.js'

// Чистые функции подстановки слов пользователя в сцену-шаблон (шаг 5; без сети и React).
// Ключ сцены key — стабильный id для зерна выбора (id сцены библиотеки; у ноды урока без sceneId — id ноды):
// одна сцена в один день получает одни и те же слова (sceneSeed), пока память не изменилась.

export const NO_VALUES = Object.freeze({})

// Какие слова выбраны из памяти: { name: { text, translation? } } (только найденные; нет слова — запасное возьмёт fillSceneVars)
export function pickUserValues(scene, words, key, day) {
  if (!usesVars(scene)) return {}
  return buildSceneValues(scene, words, sceneSeed(key ?? scene.id ?? '', day)).values
}

// Тексты выбранных слов — для прогрева озвучки (word_audio)
export const valueTexts = values => Object.values(isObj(values) ? values : {}).map(v => v?.text).filter(t => typeof t === 'string' && t)

// Сцена со словами: values — результат pickUserValues (пусто/NO_VALUES — все запасные); сцена без vars — та же ссылка
export const fillUserScene = (scene, values) => fillSceneVars(scene, values ?? NO_VALUES)

// Отпечаток правил отбора сцены (имена + pick): правка шаблона в течение сессии не берёт старые слова из кэша
export function varsFingerprint(scene) {
  return usesVars(scene) ? Object.entries(scene.vars).map(([n, v]) => `${n}:${v?.pick}`).join(',') : ''
}

// Ссылки на озвучку слов в уже подставленной сцене (сегменты-слова с audioUrl) — для подкачки перед игрой и прогрева урока
export function sceneWordUrls(scene) {
  const out = new Set()
  for (const l of Array.isArray(scene?.timeline) ? scene.timeline : []) {
    if (!Array.isArray(l?.segments)) continue
    for (const s of l.segments) if (isObj(s) && s.word && typeof s.audioUrl === 'string' && s.audioUrl) out.add(s.audioUrl)
  }
  return [...out]
}

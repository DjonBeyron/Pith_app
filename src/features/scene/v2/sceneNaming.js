// Название и служебный id сцены — чистые функции без React и БД (тест sceneNaming.test.js).
// Модель: «Название сцены» (scene.title = scenes.title) — единственное, что видит и правит админ,
// 1–80 символов, пробелы чистятся. scene.id — служебная метка «откуда взяли» (в ноде урока это
// sceneId-память, на поведение не влияет): автоматический slug от названия, админу не показывается
// (только «Копировать id» в меню «Ещё»). Старые сцены с любым id остаются как есть: id меняется
// вместе с названием только пока он «автоматический» (placeholder или slug прежнего названия).
export const TITLE_MAX = 80
export const ID_MAX = 40
export const NO_TITLE = 'Без названия'
const PLACEHOLDER_IDS = new Set(['', 'scene', 'new-scene'])

// Ввод в поле: переводы строк/табы → пробел, повторные пробелы схлопываются, ведущие убираются;
// хвостовой пробел остаётся (иначе его нельзя набрать), длина ≤ 80
export const typeTitle = raw => String(raw ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').replace(/^ /, '').slice(0, TITLE_MAX)

// Итоговое название (для сохранения/показа): как typeTitle + без пробелов по краям
export const cleanTitle = raw => typeTitle(raw).trim()

// Что показываем админу, когда названия нет
export const titleOrPlaceholder = raw => cleanTitle(raw) || NO_TITLE

const RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }

// Название → slug для scene.id (латиница/цифры/дефис, ≤ 40; валидатор: ^[a-z0-9][a-z0-9-_]*$). Пусто → 'scene'
export function slugify(title) {
  const s = [...String(title ?? '').toLowerCase()].map(c => RU[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, ID_MAX).replace(/-+$/g, '')
  return s || 'scene'
}

// id «автоматический»: служебная заглушка или slug от прежнего названия — тогда он идёт за названием
export const isAutoId = (id, prevTitle) => PLACEHOLDER_IDS.has(String(id ?? '')) || id === slugify(prevTitle)

// Сцена с новым названием (набор в поле); id следует за названием, пока он автоматический
export function retitle(scene, raw) {
  const title = typeTitle(raw)
  return { ...scene, title, id: isAutoId(scene.id, scene.title) ? slugify(title) : scene.id }
}

// «Сохранить как…»: «Название (копия)», повторно — «(копия 2)», «(копия 3)»…, без «-copy-copy» и «(копия) (копия)»
export function copyTitle(raw) {
  const base0 = cleanTitle(raw) || NO_TITLE
  const m = /^(.*?) \(копия(?: (\d+))?\)$/.exec(base0)
  const base = m ? m[1] : base0
  const suffix = m ? ` (копия ${(m[2] ? Number(m[2]) : 1) + 1})` : ' (копия)'
  return `${base.slice(0, TITLE_MAX - suffix.length).trimEnd()}${suffix}`
}

// Копия сцены для «Сохранить как…»: новое название и новый автоматический id
export function asCopy(scene) {
  const title = copyTitle(scene.title)
  return { ...scene, title, id: slugify(title) }
}

// Шаблон при загрузке: осмысленное имя (пустой — «Новая сцена», демо — своё название) и свой id
export function fromTemplate(tpl) {
  const title = tpl.id === 'empty' ? 'Новая сцена' : cleanTitle(tpl.title) || 'Новая сцена'
  return { ...tpl.scene, title, id: slugify(title) }
}

// Текст ошибки линтера для пустого названия (иначе null)
export const titleProblem = raw => (cleanTitle(raw) ? null : 'title — введите название сцены (1–80 символов)')

// Статус в шапке: «Черновик», «Опубликована», «Новая»; + « · не сохранена» при правках
export function sceneStatusLabel({ saved, dirty }) {
  const base = !saved?.id ? 'Новая' : saved.status === 'published' ? 'Опубликована' : 'Черновик'
  return dirty ? `${base} · не сохранена` : base
}

// Названия, которые в списке повторяются (регистр не важен) — у таких строк показываем различитель
export function duplicateTitles(rows) {
  const seen = new Map()
  for (const r of rows ?? []) { const k = cleanTitle(r.title).toLowerCase(); seen.set(k, (seen.get(k) ?? 0) + 1) }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k))
}
export const isDuplicateTitle = (dups, title) => dups.has(cleanTitle(title).toLowerCase())
// Короткий различитель строки библиотеки (последние 4 знака uuid)
export const shortRef = id => String(id ?? '').replace(/-/g, '').slice(-4)

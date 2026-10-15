// Подписи и ключи склейки для шагов истории черновика (draftHistory.js). Подпись — существительное
// действия: «удаление реплики 3», в подсказке получится «Отменить: удаление реплики 3».
// Ключ (key) — «то же поле»: подряд идущие правки с одним ключом (ввод текста, ползунок) сливаются в один шаг.

const n = i => i + 1
const who = k => String(k).toUpperCase()
const AUDIO_KEY = /audio|timing/i
const LIST_ITEM = { accept: 'варианта', answers: 'ответа', keywords: 'ключевого слова' }

// [label, key] для updateLine(i, patch)
export function lineEditLabel(i, p) {
  const ks = Object.keys(p)
  const one = ks.length === 1 ? ks[0] : null
  if (one === 'text') return [`ввод текста реплики ${n(i)}`, `line${i}:text`]
  if (one === 'translation') return [`ввод перевода реплики ${n(i)}`, `line${i}:translation`]
  if (ks.some(k => AUDIO_KEY.test(k))) return [`озвучка реплики ${n(i)}`, null]
  if (one === 'who') return [`смена говорящего в реплике ${n(i)}`, `line${i}:who`]
  if (one === 'emotion') return [`смена эмоции реплики ${n(i)}`, `line${i}:emotion`]
  if (one === 'pose') return [`смена позы реплики ${n(i)}`, `line${i}:pose`]
  return [`правка реплики ${n(i)}`, `line${i}:${ks.join(',')}`]
}

// [label, key] для updateCharacter(k, patch)
export function characterEditLabel(k, p) {
  const ks = Object.keys(p).join(',')
  return [ks === 'name' ? `имя персонажа ${who(k)}` : `правка персонажа ${who(k)}`, `char:${k}:${ks}`]
}

export const taskItemLabel = (verb, field) => `${verb} ${LIST_ITEM[field] ?? 'элемента'} задания`
export const sceneLoadLabel = title => `загрузка сцены «${String(title || 'Без названия').slice(0, 40)}»`

import { sceneVarNames } from './sceneVars.js'
import { plural } from '../../../shared/lib/plural.js'

// Пометка шаблона для списков: «шаблон · 2 слова»; сцена без слов-переменных — пустая строка
export function templateNote(scene) {
  const n = sceneVarNames(scene).length
  return n ? `шаблон · ${n} ${plural(n, 'слово', 'слова', 'слов')}` : ''
}

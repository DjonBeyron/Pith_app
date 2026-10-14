import { HELP_MAIN } from './helpTextsMain.js'
import { HELP_VIEW } from './helpTextsView.js'

// Справочник пояснялок «?» окна «Сигналы ленты»: ключ → { title, body, example? }.
// Тексты лежат в helpTextsMain.js / helpTextsView.js. Компоненты ссылаются на
// ключи через <HelpTip help="ключ" />; сверка «ключ существует, текст не пуст,
// лишних нет» — helpTexts.test.js. Для сигналов отдельных записей нет: берётся
// описание из реестра (signalHelp), чтобы не дублировать.
export const HELP = { ...HELP_MAIN, ...HELP_VIEW }
export const HELP_KEYS = Object.keys(HELP)

export const helpFor = key => HELP[key] ?? null
// Ключи, которые собираются из данных реестра (статус сигнала, группа)
export const statusHelpKey = status => `status_${status}`
export const groupHelpKey = group => `group_${group}`

// Пояснение к самому сигналу — из реестра (meta из signalMeta()), без копий текста
export const signalHelp = meta => ({
  title: meta.title,
  body: meta.description,
})

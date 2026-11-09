// Журнал игры «прямо сейчас» — общий для шестерёнки (WordLaneHud.jsx) и итога «Встряхни память» (pitrace/RaceJournalLinks.jsx): заголовок из живых источников (версия, режим говорю / тапаю,
// русская и английская модели Vosk) + файл (wordLaneJournal.buildJournalFile). Отдаёт файл тем же путём, что и «Скачать отладку» (saveDebugFile: iPhone — «Поделиться», иначе новая вкладка),
// копирует сжатый текст (без [perf] и т. п.) в буфер. Обе функции возвращают строку для человека и не бросают.
import { APP_VERSION } from '../../../../shared/lib/version.js'
import { voskRuntime } from '../../../../shared/lib/vosk/voskRuntime.js'
import { ruReady } from '../../../pitrace/raceRu.js'
import { buildJournalFile, liveHeader, copyText, COPY_HOW, compactText } from './wordLaneJournal.js'
import { saveDebugFile, SAVE_HOW } from './wordLaneDebugExport.js'
import { readTapMode, voskLine } from './wordLaneHudSettings.js'

const enLine = () => { try { return voskLine(voskRuntime.snapshot()) } catch { return '—' } }

/** Файл журнала из живых источников: { name, text, blob } */
export const journalNow = () => buildJournalFile({ header: liveHeader({ version: APP_VERSION, tap: readTapMode(), ru: ruReady(), en: enLine() }) })

/** «Скачать журнал» → что сказать человеку */
export async function saveJournalNow() {
  try { const how = await saveDebugFile(journalNow()); return `${SAVE_HOW[how] ?? SAVE_HOW.failed} (журнал)` } catch { return SAVE_HOW.failed }
}

/** «Скопировать журнал» → что сказать человеку */
export async function copyJournalNow() {
  try { const how = await copyText(compactText(journalNow().text)); return COPY_HOW[how] ?? COPY_HOW.failed } catch { return COPY_HOW.failed }
}

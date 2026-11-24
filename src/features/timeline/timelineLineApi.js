// Боевой api правки реплик для «Таймлайна игры» (useLineEdit.js; подключает TimelineOpenButton): карточка реплики пишет в общие настройки реплик игры (app_settings.rotate_cat_lines) ТЕМИ ЖЕ функциями,
// что таблица «Озвучка Пита» (admin/speech/useRaceVoiceTable.js) — второй логики сохранения нет, правка с таймлайна и правка из таблицы дают один и тот же объект настроек:
//   текст — raceLineText.saveLineText (пометка custom, said хранит, что говорит прежний файл); озвучка — rehearsalVoice.voicePitLines (ElevenLabs → R2 → настройки; у реплик Мии — её голос и аккаунт);
//   статус — voiceAudit.auditVoice; свой файл и «вернуть прежний текст» — raceLineActions.js (тот же путь чтения / записи). Читает настройки с сервера (fresh), а не из кэша сеанса.
import { getCatLines } from '../../shared/api/catLinesApi.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { voicePitLines } from '../rehearsal/rehearsalVoice.js'
import { saveLineText } from '../admin/speech/raceLineText.js'
import { setLineFile, restoreLine } from '../admin/speech/raceLineActions.js'
import { auditVoice } from '../admin/speech/voiceAudit.js'
import { copyText } from '../admin/speech/copyText.js'
import { restoreVoice } from './check/lineRestore.js'

export const LINE_API = {
  load: () => getCatLines({ fresh: true }),
  normalize: normalizeLines,
  audit: raw => auditVoice(raw).byId,
  saveText: (id, text) => saveLineText(id, text),
  voice: id => voicePitLines({ ids: [id] }),
  setFile: (id, file) => setLineFile(id, file),
  restore: (id, prev) => restoreLine(id, prev),
  orphans: raw => auditVoice(raw).orphans, // записи озвучки удалённых реплик — для «Проверки сценария»
  restoreVoice: (id, prev) => restoreVoice(id, prev),
  copy: copyText,
}

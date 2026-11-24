import { useEffect, useState } from 'react'
import { getCatLines } from '../../../shared/api/catLinesApi.js'
import { CAT_LINES } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { auditVoice, raceCatalog } from './voiceAudit.js'
import { needEntries } from '../../timeline/check/scenarioNeed.js'

// «Сколько реплик «Встряхни память» нужно озвучить заново» (v3.3.361, владелец: «система под «Встряхни память» должна детектить, если текст изменён, чтобы я понимал, что нужно переозвучить»).
// Тот же аудит, что в блоке «Озвучка Пита» (voiceAudit.auditVoice: сверка текста КОДА с тем, что сказал сохранённый файл), но считается без открытия вкладки «Голос» — для красного счётчика на самой вкладке админки.
// Перечитывает настройки с сервера при каждой смене admin-вкладки (after — любое значение, меняющее прогон): озвучили и ушли с вкладки — счётчик обновился. Ошибка чтения = «неизвестно» (null), а не «всё хорошо».
// v3.3.363: считаются только реплики, которые ЗВУЧАТ в сегодняшней игре (сценарий из кода — timeline/check/scenarioNeed.needEntries: тот же список и то же число показывает «Проверка сценария» на таймлайне);
// запасные реплики каталога без озвучки (spare) игру не ломают и счётчик не зажигают.
export function voiceNeedOf(raw) {
  const a = auditVoice(raw, raceCatalog(), CAT_LINES), need = needEntries(a.byId), n = st => need.filter(e => st.includes(e.status)).length
  return { total: need.length, stale: n(['stale']), fresh: n(['new']), none: n(['none', 'nodur']), spare: a.missing.length - need.length, text: need.slice(0, 8).map(e => `${e.id}: ${e.reason}`).join('\n') }
}

export default function useVoiceNeed(after, load = () => getCatLines({ fresh: true })) {
  const [need, setNeed] = useState(null)
  useEffect(() => {
    let live = true
    Promise.resolve(load()).then(r => { if (live) setNeed(r === null || r === undefined ? null : voiceNeedOf(r)) }).catch(() => { if (live) setNeed(null) })
    return () => { live = false }
  }, [after]) // eslint-disable-line react-hooks/exhaustive-deps -- load постоянный, перечитываем по смене after
  return need
}

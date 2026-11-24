// «Сколько реплик нужно озвучить или переозвучить» — ОДНО число для проверки сценария на таймлайне и для красного счётчика на вкладке админки «Голос» (admin/speech/useVoiceNeed.js): реплики,
// которые ЗВУЧАТ в сегодняшней игре (сценарий из кода, scenarioBuild.js, все ветки) и у которых по аудиту озвучки (admin/speech/voiceAudit.js) нет звука, звук говорит старый текст или у звука нет длительности.
// Запасные реплики каталога, которые в игре не звучат, в это число не входят. byId — карта аудита { [id]: { id, status, reason } }.
import { AUDIT_MISSING } from '../../admin/speech/voiceAudit.js'
import { scenarioIds } from './scenarioBuild.js'

export const needEntries = (byId, ids = scenarioIds()) => [...ids].map(id => byId?.[id]).filter(e => e && AUDIT_MISSING.includes(e.status))

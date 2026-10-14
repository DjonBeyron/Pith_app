import { lineAudioState } from '../../../scene/v2/sceneVoice.js'

// Статус озвучки реплики для бейджа в сборщике: схемный (none/ready/stale из sceneVoice)
// плюс состояние прогона из useSceneVoice (busy/error). Отдельным файлом, чтобы
// LineVoiceControls.jsx экспортировал только компонент (react-refresh).

export const STATE_LABEL = { none: 'нет файла', ready: 'озвучено', stale: 'устарело', busy: 'озвучиваю…', error: 'ошибка' }

export function lineVoiceStatus(line, character, runtime) {
  if (runtime?.busy) return 'busy'
  if (runtime?.error) return 'error'
  return lineAudioState(line, character)
}

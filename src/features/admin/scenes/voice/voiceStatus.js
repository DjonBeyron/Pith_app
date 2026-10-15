import { lineAudioState } from '../../../scene/v2/sceneVoice.js'
import { setState } from './voicePlan.js'

// Статус озвучки реплики для бейджа в сборщике: схемный (none/ready/stale из sceneVoice)
// плюс состояние прогона из useSceneVoice (busy/error). Для набора 'translation' добавляется
// 'empty' — у реплики нет перевода, озвучивать нечего (блок неактивен). Отдельным файлом,
// чтобы LineVoiceControls.jsx экспортировал только компонент (react-refresh).

export const STATE_LABEL = { none: 'нет файла', ready: 'озвучено', stale: 'устарело', busy: 'озвучиваю…', error: 'ошибка', empty: 'нет перевода' }

export function lineVoiceStatus(line, character, runtime, set = 'original', scene = null) {
  if (runtime?.busy) return 'busy'
  if (runtime?.error) return 'error'
  if (set === 'original') return lineAudioState(line, character)
  const st = setState(set, line, character, scene)
  return st === 'none' && !String(line?.translation ?? '').trim() ? 'empty' : st
}

// Ключи состояния по реплике и «что играет» в useSceneVoice: оригинал — индекс (как раньше),
// перевод — 't<индекс>'
export const lineKey = (i, set = 'original') => (set === 'translation' ? `t${i}` : i)

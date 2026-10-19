import { isObj } from '../../scene/v2/sceneConstants.js'

// Правка реплики сцены в копии урока разбора: меняем text/translation i-й реплики снимка сцены. Озвучка реплики (audioUrl,
// wordTimings, audioMeta; у перевода — translation*) записана под СТАРЫЙ текст — после правки сбрасываем её, иначе голос
// будет читать прежние слова; озвучить заново — кнопкой «Озвучить» в редакторе сцены.
const TEXT_AUDIO = ['audioUrl', 'wordTimings', 'audioMeta', 'segments']
const TR_AUDIO = ['translationAudioUrl', 'translationWordTimings', 'translationAudioMeta']

export function setSceneLine(scene, i, patch) {
  if (!isObj(scene) || !Array.isArray(scene.timeline) || !isObj(scene.timeline[i])) return scene
  const line = { ...scene.timeline[i] }
  if ('text' in patch && patch.text !== line.text) { line.text = patch.text; for (const k of TEXT_AUDIO) delete line[k] }
  if ('translation' in patch && (patch.translation || '') !== (line.translation || '')) {
    if (patch.translation) line.translation = patch.translation; else delete line.translation
    for (const k of TR_AUDIO) delete line[k]
  }
  return { ...scene, timeline: scene.timeline.map((l, k) => (k === i ? line : l)) }
}

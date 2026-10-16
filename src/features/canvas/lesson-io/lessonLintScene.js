import { lintScene } from '../../scene/v2/sceneLint.js'
import { SCENE_MODES, SCENE_MAX_BYTES, SCENE_STARTS, SCENE_START_DELAY_MAX, sceneByteSize } from '../../scene/v2/sceneNode.js'
import { DISPLAY_MODES } from '../../scene/v2/sceneConstants.js'
import { resolveVoiceFlags } from '../../scene/v2/sceneOptions.js'
import { checkSceneCrop } from '../../scene/v2/sceneNodeCrop.js'

// Проверки ноды `scene` для lintLesson (формат обмена: { ref, type, data, triggers }):
//  · [R-scene-missing]  сцены нет — нода покажет только «Дальше» (ошибка);
//  · [R-scene-invalid]  снимок не проходит lintScene (ошибки формата/бюджета) — в уроке
//                       будет фолбэк текстом (ошибка); предупреждения линтера сцены —
//                       предупреждение урока;
//  · [R-scene-size]     снимок больше 64 КБ (как CHECK таблицы scenes) — ошибка;
//  · [R-scene-mode]     mode вне bubble | circle, showBubbles не boolean, display вне none | text | both,
//                       voice не объект из true/false (original/translation) — ошибка;
//  · [R-scene-start]    start вне manual | auto, startDelayMs не целое 0…5000 — ошибка; задержка при
//                       manual — предупреждение (не действует);
//  · [R-scene-crop]     crop не { x, y, scale } или вне диапазона (x, y ±400; scale 0.5…4) — ошибка;
//  · [R-scene-voice]    озвучка перевода включена (сценой или нодой), а файлов перевода нет у части
//                       реплик с translation — предупреждение (там пойдёт синтез устройства или тишина);
//  · [R-scene-played]   выход played никуда не ведёт, а нода не последняя — предупреждение.
// lintLesson отдаёт плоский список строк: уровень — словом в начале сообщения.

const err = (ref, code, text) => `[${code}] ${ref} (scene): ошибка — ${text}`
const warn = (ref, code, text) => `[${code}] ${ref} (scene): предупреждение — ${text}`

export function checkScene(nodes) {
  const out = []
  for (const n of nodes ?? []) {
    if (n.type !== 'scene') continue
    const d = n.data ?? {}
    if (d.mode !== undefined && !SCENE_MODES.includes(d.mode)) out.push(err(n.ref, 'R-scene-mode', `mode «${d.mode}» — допустимо ${SCENE_MODES.join(' | ')}`))
    if (d.showBubbles !== undefined && typeof d.showBubbles !== 'boolean') out.push(err(n.ref, 'R-scene-mode', 'showBubbles — true/false'))
    if (d.display !== undefined && !DISPLAY_MODES.includes(d.display)) out.push(err(n.ref, 'R-scene-mode', `display «${d.display}» — допустимо ${DISPLAY_MODES.join(' | ')}`))
    const badVoice = d.voice !== undefined && (!d.voice || typeof d.voice !== 'object' || Array.isArray(d.voice)
      || Object.entries(d.voice).some(([k, v]) => !['original', 'translation'].includes(k) || typeof v !== 'boolean'))
    if (badVoice) out.push(err(n.ref, 'R-scene-mode', 'voice — объект { original, translation } из true/false'))
    if (d.start !== undefined && !SCENE_STARTS.includes(d.start)) out.push(err(n.ref, 'R-scene-start', `start «${d.start}» — допустимо ${SCENE_STARTS.join(' | ')}`))
    const dl = d.startDelayMs
    if (dl !== undefined && !(Number.isInteger(dl) && dl >= 0 && dl <= SCENE_START_DELAY_MAX)) out.push(err(n.ref, 'R-scene-start', `startDelayMs «${dl}» — целое 0…${SCENE_START_DELAY_MAX} мс`))
    for (const t of checkSceneCrop(d.crop)) out.push(err(n.ref, 'R-scene-crop', t))
    if (d.start === 'manual' && dl !== undefined) out.push(warn(n.ref, 'R-scene-start', 'startDelayMs при start = manual не действует'))

    if (!d.scene || typeof d.scene !== 'object') {
      out.push(err(n.ref, 'R-scene-missing', 'сцена не выбрана — ученик увидит пустой пузырь с кнопкой «Дальше»'))
    } else {
      const bytes = sceneByteSize(d.scene)
      if (bytes > SCENE_MAX_BYTES) out.push(err(n.ref, 'R-scene-size', `снимок сцены ${Math.round(bytes / 1024)} КБ > ${SCENE_MAX_BYTES / 1024} КБ`))
      for (const x of lintScene(d.scene)) {
        if (x.level === 'error') out.push(err(n.ref, 'R-scene-invalid', x.text))
        else out.push(warn(n.ref, 'R-scene-lint', x.text))
      }
      // Сцена сама включила озвучку перевода — об этом скажет lintScene; здесь — переопределение ноды
      const nodeTrOn = !badVoice && d.voice?.translation === true && resolveVoiceFlags(d.scene, d.voice).translation
      const tl = Array.isArray(d.scene.timeline) ? d.scene.timeline : []
      const missing = tl.filter(l => typeof l?.translation === 'string' && l.translation.trim() && !l.translationAudioUrl).length
      if (nodeTrOn && missing) out.push(warn(n.ref, 'R-scene-voice', `нода включает озвучку перевода, но у ${missing} реплик нет файла перевода (translationAudioUrl) — там прозвучит синтез устройства или тишина`))
    }

    const outgoing = (n.triggers ?? []).filter(t => t.then)
    const played = (n.triggers ?? []).find(t => t.if === 'played')
    if (outgoing.length && !played?.then) {
      out.push(warn(n.ref, 'R-scene-played', 'выход played никуда не ведёт — после сцены урок пойдёт только по другому триггеру; обычно дальше ведёт именно played'))
    }
  }
  return out
}

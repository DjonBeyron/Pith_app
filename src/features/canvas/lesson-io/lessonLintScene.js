import { lintScene } from '../../scene/v2/sceneLint.js'
import { SCENE_MODES, SCENE_MAX_BYTES, sceneByteSize } from '../../scene/v2/sceneNode.js'

// Проверки ноды `scene` для lintLesson (формат обмена: { ref, type, data, triggers }):
//  · [R-scene-missing]  сцены нет — нода покажет только «Дальше» (ошибка);
//  · [R-scene-invalid]  снимок не проходит lintScene (ошибки формата/бюджета) — в уроке
//                       будет фолбэк текстом (ошибка); предупреждения линтера сцены —
//                       предупреждение урока;
//  · [R-scene-size]     снимок больше 64 КБ (как CHECK таблицы scenes) — ошибка;
//  · [R-scene-mode]     mode вне bubble | circle, showBubbles не boolean — ошибка;
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

    if (!d.scene || typeof d.scene !== 'object') {
      out.push(err(n.ref, 'R-scene-missing', 'сцена не выбрана — ученик увидит пустой пузырь с кнопкой «Дальше»'))
    } else {
      const bytes = sceneByteSize(d.scene)
      if (bytes > SCENE_MAX_BYTES) out.push(err(n.ref, 'R-scene-size', `снимок сцены ${Math.round(bytes / 1024)} КБ > ${SCENE_MAX_BYTES / 1024} КБ`))
      for (const x of lintScene(d.scene)) {
        if (x.level === 'error') out.push(err(n.ref, 'R-scene-invalid', x.text))
        else out.push(warn(n.ref, 'R-scene-lint', x.text))
      }
    }

    const outgoing = (n.triggers ?? []).filter(t => t.then)
    const played = (n.triggers ?? []).find(t => t.if === 'played')
    if (outgoing.length && !played?.then) {
      out.push(warn(n.ref, 'R-scene-played', 'выход played никуда не ведёт — после сцены урок пойдёт только по другому триггеру; обычно дальше ведёт именно played'))
    }
  }
  return out
}

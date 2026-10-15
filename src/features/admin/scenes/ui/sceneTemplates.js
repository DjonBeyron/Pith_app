import { DEMO_SCENES } from '../../../scene/v2/demoScenes.js'
import { newDraft, clearScene, sameScene } from '../builderModel.js'

// Встроенные шаблоны для группы «Шаблоны» в «Моих сценах» (TemplatesGroup.jsx): демо-сцены
// «Про работу» / «Кофе-брейк» и пустая сцена. Чистые функции, тест — sceneUseOptions.test.jsx.
export function templateList() {
  return [
    ...DEMO_SCENES.map(s => ({ id: s.id, title: s.title, scene: s, note: `${s.timeline.length} реплик · ${s.location === 'cafe' ? 'кафе' : 'офис'}` })),
    { id: 'empty', title: 'Пустая сцена', scene: clearScene(newDraft()), note: 'офис без предметов, две реплики-заготовки' },
  ]
}

// Нужно ли подтверждение замены черновика: правки есть и это не нетронутая стартовая сцена
export const needsTemplateConfirm = draft => draft.dirty && !sameScene(draft.scene, newDraft())

// Копия шаблона для черновика: свой id, чтобы не путать с демо
export const templateScene = t => ({ ...t.scene, id: t.id === 'empty' ? 'new-scene' : `${t.scene.id}-copy`.slice(0, 40) })

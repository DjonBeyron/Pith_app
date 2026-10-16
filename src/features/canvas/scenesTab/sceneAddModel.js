import { templateList, templateScene } from '../../admin/scenes/ui/sceneTemplates.js'
import { isSolo } from '../../scene/v2/scenePit.js'
import { pickRowPatch } from '../scenePickerModel.js'

// Заготовка typeData ноды `scene` для кнопки «Добавить сцену»: шаблон builder'а («Кружок Пита»,
// «Шаблон: закажи еду», диалоги, пустая) или строка библиотеки. Кружок Пита (один кот) — режим circle.
export function templateItems() {
  return templateList().map(t => ({ id: t.id, title: t.title, note: t.note, tpl: t }))
}

export function templateTypeData(tpl) {
  const scene = templateScene(tpl)
  return { scene, sceneId: null, sceneUpdatedAt: null, mode: isSolo(scene) ? 'circle' : 'bubble' }
}

export function libraryTypeData(row) {
  const snap = pickRowPatch(row)
  return snap ? { ...snap, mode: isSolo(snap.scene) ? 'circle' : 'bubble' } : null
}

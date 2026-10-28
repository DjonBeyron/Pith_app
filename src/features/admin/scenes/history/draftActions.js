import * as M from '../builderModel.js'
import * as T from '../timelineOps.js'
import * as TK from '../taskModel.js'
import * as MD from '../modes/sceneModes.js'
import * as V from '../varsOps.js'
import { setFeedFrame } from '../feedFrame/feedFrameModel.js'
import { lineEditLabel, characterEditLabel, taskItemLabel, varEditLabel } from './historyLabels.js'

// Правки сцены-черновика для useBuilderDraft: каждая — вызов edit(подпись, scene => scene, ключ склейки?).
// Подпись попадает в подсказку «Отменить: …», ключ — для склейки ввода в одно поле в один шаг
// (draftHistory.js). Структурные действия (добавить/удалить/переместить реплику, локация, слот,
// «Удалить все», режимы) — без ключа, каждое отдельным шагом. Сама логика правок — builderModel/timelineOps/taskModel.
export function buildDraftActions(edit) {
  const tl = (label, fn, key) => edit(label, s => M.setTimeline(s, fn(s.timeline)), key)
  const n = i => i + 1
  return {
    setTitle: v => edit('название сцены', s => M.setTitle(s, v), 'title'),
    setId: v => edit('id сцены', s => M.setId(s, v), 'id'),
    setLocation: v => edit('смена локации', s => M.setLocation(s, v)),
    setSlot: (slotId, spriteId) => edit(spriteId ? 'выбор предмета' : 'снятие предмета', s => M.setSlot(s, slotId, spriteId)),
    clearSlots: () => edit('очистка предметов', M.clearSlots),
    fillDefaultSlots: () => edit('набор предметов по умолчанию', M.fillDefaultSlots),
    updateCharacter: (k, p) => { const [l, key] = characterEditLabel(k, p); edit(l, s => M.updateCharacter(s, k, p), key) },
    setSkin: (k, skin) => edit(`образ персонажа ${k.toUpperCase()}`, s => M.setSkin(s, k, skin)),
    setPaletteColor: (k, c, v) => edit(`цвет персонажа ${k.toUpperCase()}`, s => M.setPaletteColor(s, k, c, v), `pal:${k}:${c}`),
    applyPreset: (k, id) => edit(`палитра персонажа ${k.toUpperCase()}`, s => M.applyPalettePreset(s, k, id)),
    setVoice: (k, p) => edit(`голос персонажа ${k.toUpperCase()}`, s => M.setVoice(s, k, p), `voice:${k}:${Object.keys(p).join(',')}`),
    setSolo: v => edit(v ? 'один кот (Пит)' : 'два кота', s => M.setSolo(s, v)), // characters без b / с b (scenePit.js)
    setOption: (name, v) => edit(`опция «${name}»`, s => M.setOption(s, name, v)),
    // Режимы показа и озвучки (modes/sceneModes.js): пишутся в options только при вызове
    setDisplay: m => edit('режим показа', s => MD.setDisplay(s, m)),
    setVoiceFlag: (k, v) => edit('флаг озвучки', s => MD.setVoiceFlag(s, k, v)),
    setTranslationVoiceId: id => edit('голос перевода сцены', s => MD.setTranslationVoiceId(s, id)),
    setFeedFrame: f => edit('кадр в ленте', s => setFeedFrame(s, f), 'feedFrame'), // options.feedFrame — кадрирование в ленте
    applyModes: override => edit('режимы по умолчанию', s => MD.applyOverrideToScene(s, override)),
    addLine: after => tl('добавление реплики', t => T.addLine(t, after)),
    removeLine: i => edit(`удаление реплики ${n(i)}`, s => M.removeLine(s, i)), // задание сдвигается вместе с репликами
    clearTimeline: () => edit('удаление всех реплик', M.clearTimeline),
    moveLine: (i, d) => tl(`перемещение реплики ${n(i)}`, t => T.moveLine(t, i, d)),
    updateLine: (i, p) => { const [l, key] = lineEditLabel(i, p); tl(l, t => T.updateLine(t, i, p), key) },
    duplicateLine: i => tl(`дублирование реплики ${n(i)}`, t => T.duplicateLine(t, i)),
    // Задание после сцены «О чём диалог» (taskModel.js)
    setTaskKind: k => edit('тип задания', s => TK.setTaskKind(s, k)),
    updateTask: p => edit('правка задания', s => TK.updateTask(s, p), `task:${Object.keys(p).join(',')}`),
    addAccept: text => edit(taskItemLabel('добавление', 'accept'), s => TK.addAccept(s, text)),
    updateAccept: (i, v) => edit(taskItemLabel('правка', 'accept'), s => TK.updateAccept(s, i, v), `accept:${i}`),
    removeAccept: i => edit(taskItemLabel('удаление', 'accept'), s => TK.removeAccept(s, i)),
    addTaskItem: (f, text) => edit(taskItemLabel('добавление', f), s => TK.addItem(s, f, text)),
    updateTaskItem: (f, i, v) => edit(taskItemLabel('правка', f), s => TK.updateItem(s, f, i, v), `item:${f}:${i}`),
    removeTaskItem: (f, i) => edit(taskItemLabel('удаление', f), s => TK.removeItem(s, f, i)),
    // Слова пользователя в шаблоне (varsOps.js): ввод в одно поле склеивается в один шаг, ключ — по номеру слова
    addVar: () => edit('добавление слова пользователя', V.addVar),
    removeVar: name => edit(`удаление слова ${name}`, s => V.removeVar(s, name)),
    renameVar: (i, v) => edit('ключ слова', s => V.renameVarAt(s, i, v), `varname:${i}`),
    updateVar: (name, p) => { const [l, key] = varEditLabel(name, p); edit(l, s => V.updateVar(s, name, p), key) },
    insertVar: (i, field, name, start, end) => edit(`вставка слова в реплику ${n(i)}`, s => V.insertVarInLine(s, i, field, name, start, end)),
    clearScene: () => edit('очистка сцены', M.clearScene),
  }
}

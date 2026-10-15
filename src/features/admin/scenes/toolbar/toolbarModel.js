import { Mic, ChevronsDownUp, ChevronsUpDown, Sun, Moon, Pin, Volume2, VolumeX } from 'lucide-react'
import { DISPLAY_OPTIONS, VOICE_LABEL } from '../modes/sceneModes.js'

// Раскладка тулбара сборщика сцен — чистая функция без React (тесты: toolbar.test.jsx, toolbarModes.test.jsx).
// ЧТОБЫ ДОБАВИТЬ КНОПКУ в тулбар: добавьте объект в buildToolbarActions в нужную группу — широкое
// окно покажет её в группе, узкое сложит в меню «⋯» автоматически (menuItems); ни разметку, ни меню
// править не нужно.
// Действие: { id, group, kind?, label, shortLabel?, hint?, run, disabled?, primary?, pinned?, Icon?, iconOnly?, overridden? }
//  • kind — button (по умолчанию) | segment ({ options: [{ id, label }], value, pick(id) }) |
//    toggle ({ pressed, run }) | menu ({ items: [{ id, label, hint?, run, disabled? }] } — кнопка с выпадашкой);
//  • group — modes (режимы показа/озвучки предпросмотра) | voice (озвучка) | scene | view; порядок — GROUPS;
//  • primary — главная кнопка (залита акцентом); pinned — остаётся на панели и на узком окне;
//  • iconOnly — только значок (label уходит в aria-label и title); compact — на панели короткая подпись
//    (shortLabel), полная — в title/aria-label; overridden — предпросмотр ≠ сцена.

export const GROUPS = [
  { id: 'modes', label: 'Режимы предпросмотра' },
  { id: 'voice', label: 'Озвучка' },
  { id: 'scene', label: 'Сцена' },
  { id: 'view', label: 'Вид окна' },
]

// modes — { effective: { display, voice }, overridden: { display, original, translation, any }, set(key, value), makeDefault() }
function modesActions(modes, list) {
  if (!modes) return
  const { effective: e, overridden: o } = modes
  list.push({
    id: 'display', group: 'modes', kind: 'segment', label: 'Режим показа', hint: 'Предпросмотр: без текста / текст / текст + перевод (сцену не меняет)',
    options: DISPLAY_OPTIONS.map(x => ({ id: x.id, label: x.short })), value: e.display, pick: id => modes.set('display', id), overridden: o.display,
  })
  for (const k of ['original', 'translation']) {
    const on = e.voice[k]
    list.push({
      id: k === 'original' ? 'voiceOriginal' : 'voiceTranslation', group: 'modes', kind: 'toggle', label: VOICE_LABEL[k], shortLabel: k === 'original' ? 'Оригинал' : 'Перевод', compact: true,
      hint: `${VOICE_LABEL[k]} в предпросмотре: ${on ? 'включена' : 'выключена'} (сцену не меняет)`, pressed: on, run: () => modes.set(k, !on), Icon: on ? Volume2 : VolumeX, overridden: o[k],
    })
  }
  list.push({
    id: 'makeDefault', group: 'modes', label: 'Сделать по умолчанию для сцены', Icon: Pin, iconOnly: true, run: modes.makeDefault, disabled: !o.any,
    hint: o.any ? 'Записать режим предпросмотра в сцену (options.display / options.voice)' : 'Предпросмотр совпадает с тем, что записано в сцене',
  })
}

// voice — { run(sets?), disabled, hint, stats: { ready, total, translation: { ready, withText } } }
function voiceActions(voice, list) {
  if (!voice) return
  const st = voice.stats
  const allDone = st ? st.ready === st.total && st.translation.ready === st.translation.withText : false
  const items = [
    { id: 'voiceAllBoth', label: 'Всё (текст и перевод)', hint: 'Оба набора, по одной реплике', run: () => voice.run(['original', 'translation']), disabled: voice.disabled },
    { id: 'voiceText', label: 'Только текст', hint: st ? `озвучено ${st.ready} из ${st.total}` : '', run: () => voice.run(['original']), disabled: voice.disabled || (st ? st.ready === st.total : false) },
    { id: 'voiceTranslation', label: 'Только перевод', hint: st ? `озвучено ${st.translation.ready} из ${st.translation.withText} с переводом` : '', run: () => voice.run(['translation']), disabled: voice.disabled || (st ? !st.translation.withText || st.translation.ready === st.translation.withText : false) },
  ]
  list.push({ id: 'voiceAll', group: 'voice', kind: 'menu', label: 'Озвучить', hint: voice.hint, run: () => voice.run(), disabled: voice.disabled || allDone, Icon: Mic, items })
}

// Режимы окна: admin — обычная админка, node — сцена для ноды урока, module — для модуля ленты
// (режим определяет sceneUseMode). «Применить» есть только в node/module.
export function buildToolbarActions({ mode, voice = null, modes = null, save, apply = null, onNew, panels = null, theme, onToggleTheme }) {
  const embedded = mode === 'node' || mode === 'module'
  const list = []
  modesActions(modes, list)
  voiceActions(voice, list)
  if (embedded && apply) {
    list.push({ id: 'apply', group: 'scene', label: apply.label, shortLabel: 'Применить', hint: apply.hint, run: apply.run, disabled: apply.disabled, primary: true, pinned: true })
  }
  list.push({
    id: 'save', group: 'scene', label: save.label, shortLabel: 'Сохранить', hint: save.hint, run: save.run, disabled: save.disabled,
    primary: !embedded, pinned: !embedded,
  })
  list.push({ id: 'new', group: 'scene', label: 'Новая', hint: 'Начать новую сцену с чистого листа', run: onNew })
  if (panels?.has) {
    const all = panels.allCollapsed
    list.push({ id: 'collapseAll', group: 'view', label: all ? 'Развернуть все' : 'Свернуть все', hint: `${all ? 'Развернуть' : 'Свернуть'} блоки окна`, run: panels.toggle, Icon: all ? ChevronsUpDown : ChevronsDownUp })
  }
  list.push({ id: 'theme', group: 'view', label: theme === 'dark' ? 'Светлая тема окна' : 'Тёмная тема окна', hint: 'Переключить тему окна', run: onToggleTheme, Icon: theme === 'dark' ? Sun : Moon, iconOnly: true })
  return list
}

// Что показать при ширине окна: широкое — всё на панели, узкое — на панели только pinned,
// остальное — в меню «⋯»
export function splitByWidth(actions, narrow) {
  if (!narrow) return { bar: actions, menu: [] }
  return { bar: actions.filter(a => a.pinned), menu: actions.filter(a => !a.pinned) }
}

// Действия → плоские пункты меню «⋯»: сегмент — пункт на вариант (radio, checked), тумблер —
// checkbox, кнопка с выпадашкой — её пункты, остальное — как есть
export function menuItems(actions) {
  return actions.flatMap(a => {
    if (a.kind === 'segment') return a.options.map(o => ({ id: `${a.id}:${o.id}`, label: `${a.label}: ${o.label}`, role: 'menuitemradio', checked: a.value === o.id, run: () => a.pick(o.id), disabled: a.disabled, hint: a.overridden && a.value === o.id ? 'предпросмотр ≠ сцена' : undefined }))
    if (a.kind === 'toggle') return [{ id: a.id, label: a.label, role: 'menuitemcheckbox', checked: !!a.pressed, run: a.run, disabled: a.disabled, hint: a.overridden ? 'предпросмотр ≠ сцена' : undefined }]
    if (a.kind === 'menu') return a.items.map(it => ({ ...it, id: `${a.id}:${it.id}`, label: `${a.label}: ${it.label.toLowerCase()}` }))
    return [{ id: a.id, label: a.label, hint: a.hint, run: a.run, disabled: a.disabled }]
  })
}

// Действия по группам в порядке GROUPS (пустые группы пропускаются)
export function groupActions(actions) {
  return GROUPS.map(g => ({ ...g, items: actions.filter(a => a.group === g.id) })).filter(g => g.items.length)
}

// Решение для «Назад»: blocked — идёт озвучка (окно не закрывается), confirm — есть
// несохранённые правки (диалог внутри окна), close — можно сразу
export function backDecision({ voiceBusy, dirty }) {
  if (voiceBusy) return 'blocked'
  return dirty ? 'confirm' : 'close'
}

// Исход диалога «Назад»: save | discard | stay. Сохранение удалось → закрываем; не удалось → остаёмся
// (ошибка уже в строке статуса). Возвращает, что сделано: 'closed' | 'stayed'
export async function runBackChoice(choice, { save, close }) {
  if (choice === 'discard') { close(); return 'closed' }
  if (choice === 'save') {
    const ok = await save()
    if (ok) { close(); return 'closed' }
  }
  return 'stayed'
}

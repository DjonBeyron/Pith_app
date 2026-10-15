import { Mic, ChevronsDownUp, ChevronsUpDown, Sun, Moon } from 'lucide-react'

// Раскладка тулбара сборщика сцен — чистая функция без React (тест: toolbar.test.jsx).
// ЧТОБЫ ДОБАВИТЬ КНОПКУ в тулбар (например озвучку перевода): добавьте объект в buildToolbarActions
// в нужную группу — широкое окно покажет её в группе, узкое сложит в меню «⋯» автоматически;
// ни разметку, ни меню править не нужно.
// Действие: { id, group, label, shortLabel?, hint?, run, disabled?, primary?, pinned?, Icon?, iconOnly? }
//  • group — voice (озвучка) | scene (сохранить/применить/новая) | view (вид окна); порядок — GROUPS;
//  • primary — главная кнопка (залита акцентом); pinned — остаётся на панели и на узком окне;
//  • iconOnly — только значок (label уходит в aria-label и title).

export const GROUPS = [
  { id: 'voice', label: 'Озвучка' },
  { id: 'scene', label: 'Сцена' },
  { id: 'view', label: 'Вид окна' },
]

// Режимы окна: admin — обычная админка, node — сцена для ноды урока, module — для модуля ленты
// (режим определяет sceneUseMode). «Применить» есть только в node/module.
export function buildToolbarActions({ mode, voice = null, save, apply = null, onNew, panels = null, theme, onToggleTheme }) {
  const embedded = mode === 'node' || mode === 'module'
  const list = []
  if (voice) {
    list.push({ id: 'voiceAll', group: 'voice', label: 'Озвучить всё', hint: voice.hint, run: voice.run, disabled: voice.disabled, Icon: Mic })
  }
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

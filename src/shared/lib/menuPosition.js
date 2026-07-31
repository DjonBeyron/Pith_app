// Позиционирует всплывающее меню (fixed, через portal) рядом с кнопкой-
// триггером так, чтобы оно не уезжало за нижний/верхний/правый край окна:
// снизу, если места хватает, иначе сверху — в обоих случаях высота меню
// ограничена доступным пространством (со своим скроллом), а не окном.
// Общая для InsertNodeButton.jsx и NodeTypeSelect.jsx — у обоих одна и та же
// попап-панель, различающаяся только содержимым.
export function computeMenuPos(triggerRect, { margin = 6, minWidth = 200, minSpaceBelow = 160 } = {}) {
  const spaceBelow = window.innerHeight - triggerRect.bottom
  const spaceAbove = triggerRect.top
  const width = Math.max(triggerRect.width, minWidth)
  const left = Math.max(margin, Math.min(triggerRect.left, window.innerWidth - width - margin))

  if (spaceBelow < minSpaceBelow && spaceAbove > spaceBelow) {
    return {
      left,
      bottom: window.innerHeight - triggerRect.top + margin,
      maxHeight: Math.max(120, spaceAbove - margin * 2),
      width,
    }
  }
  return {
    left,
    top: triggerRect.bottom + margin,
    maxHeight: Math.max(120, spaceBelow - margin * 2),
    width,
  }
}

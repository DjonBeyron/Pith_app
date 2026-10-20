// «Успокоение» позы кота перед заморозкой кадра. Доигравшая сцена заменяется статичным кадром (SceneBody: live → static,
// кружок — в конце сворачивания), а идл-анимации (дыхание, покачивание головы, хвост, пар) к этому моменту стоят на паузе в
// случайной позе: кадр «прыгал» в нейтральную позу статики — это и был рывок при сворачивании кружка. Снять анимацию с CSS
// transition нельзя — браузер прыгает к базовому значению сразу (проверено в Chromium). Поэтому руками: текущая поза
// фиксируется инлайном, класс .scn--settle убирает анимации и даёт transition, следующим кадром инлайн отпускается — части
// плавно едут в нейтраль за SETTLE_MS, и статичный кадр (нейтральная поза) встаёт без скачка. Частей ≤ 9 на сцену, один раз на конец.
// Отдельный файл без React: тестируется на подделках элементов (sceneSettle.test.js).

export const SETTLE_MS = 450
export const SETTLE_CLASS = 'scn--settle'
export const SETTLE_PARTS = '.cat-body, .cat-head, .cat-eyes, .cat-tail, .prop-steam'

const noop = () => {}

// root — корень сцены (.scn). Возвращает отмену (вернуть всё как было: повтор сцены снова оживляет анимации).
// Инъекции для тестов: getStyle (getComputedStyle), raf.
export function settleSceneIdle(root, {
  getStyle = el => getComputedStyle(el),
  raf = cb => requestAnimationFrame(cb),
  onDone = noop,
} = {}) {
  if (!root?.querySelectorAll) return noop
  const parts = [...root.querySelectorAll(SETTLE_PARTS)]
  // 1. Зафиксировать текущую позу (пока анимация ещё действует)
  for (const el of parts) {
    const cs = getStyle(el)
    el.style.transform = cs.transform && cs.transform !== 'none' ? cs.transform : 'none'
    if (el.classList.contains('prop-steam')) el.style.opacity = cs.opacity ?? ''
  }
  // 2. Снять анимации (transition — в CSS у .scn--settle)
  root.classList.add(SETTLE_CLASS)
  // 3. Следующим кадром отпустить инлайн — части едут в нейтраль
  let cancelled = false
  raf(() => {
    if (cancelled) return
    for (const el of parts) { el.style.transform = ''; el.style.opacity = '' }
    onDone(parts.length)
  })
  return () => {
    cancelled = true
    for (const el of parts) { el.style.transform = ''; el.style.opacity = '' }
    root.classList.remove(SETTLE_CLASS)
  }
}

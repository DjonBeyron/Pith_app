// Одна протяжка мышью в таймлайне (клип, его ручка, плейхед, конец линейки).
//
// Раньше каждый обработчик сам вешал mousemove/mouseup на window. Если mouseup
// не долетал — курсор ушёл за пределы окна, окно потеряло фокус, браузер начал
// свой drag выделенного текста — слушатели оставались висеть, и клип продолжал
// ехать за мышью с отпущенной кнопкой. Здесь протяжка закрывается по любому из
// признаков конца, а не только по mouseup.
export function startDragSession(onMove, onDone) {
  const move = mv => onMove(mv)
  const stop = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', stop)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    window.removeEventListener('dragend', stop)
    window.removeEventListener('blur', stop)
    onDone?.()
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', stop)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
  window.addEventListener('dragend', stop)
  window.addEventListener('blur', stop)
  return stop
}

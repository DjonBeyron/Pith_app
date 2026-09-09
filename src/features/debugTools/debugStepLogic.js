// Решения тулбара о времени — отдельно от React, чтобы их можно было
// прогнать тестами по всей матрице состояний.
//
// Состояний паузы в системе три, и они умеют расходиться:
//   running  — идут ли виртуальные часы (debugClock.js);
//   frozen   — замер ли сценарий урока (usePlayerStepControl.js);
//   paused   — что показывает кнопка тулбара (React-стейт, отстаёт от обоих).
// Пока каждое решение принималось «на глаз» по ближайшему из них, кнопки
// делали противоположное задуманному. Здесь правило одно: спрашиваем часы,
// а сценарий подтягиваем следом.

// Нажали кнопку паузы. Возвращает, что сделать со временем.
// displayPaused — запасной путь, когда часы не встали (прод-превью).
export function decideToggle({ clockInstalled, clockRunning, displayPaused }) {
  const goingToPause = clockInstalled ? clockRunning : !displayPaused
  return goingToPause ? 'pause' : 'resume'
}

// Сценарий замер или ожил сам (кнопки «назад»/«вперёд» в PlayerStepRow зовут
// pause()/unfreeze() внутри себя). Возвращает, чем ответить часам, или null,
// если они уже в согласии со сценарием.
export function decideFollowScenario({ frozen, clockInstalled, clockRunning }) {
  if (frozen === undefined || !clockInstalled) return null
  if (frozen && clockRunning) return 'pause'
  if (!frozen && !clockRunning) return 'resume'
  return null
}

// Шаг на deltaMs. Двигать надо ОБА, и это не двойной шаг: часы толкают живые
// setTimeout/rAF (анимации, медиа), а сценарий на паузе своих таймеров не
// имеет вовсе — useGraphPlayer их уничтожает и держит остаток в pendingMsRef,
// вычесть из которого умеет только stepTime.
export function decideStep({ deltaMs, clockInstalled }) {
  return {
    tickClock: deltaMs > 0 && clockInstalled,
    stepScenario: true,
    stepMedia: true,
  }
}

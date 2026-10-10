// Этапы прогрева Vosk (модель из кэша → в память) как явная машина состояний — для voskRuntime.js и админской диагностики «Сказать фразу».
// idle → checking-cache → importing-lib → loading-model → ready | failed. У каждого этапа свой таймаут (кэш 20 с, библиотека 30 с, модель 60 с): завис — failed с понятной причиной.
// Журнал этапов (trace) хранит время входа в каждый этап — его копирует отчёт диагностики. Без React; таймеры подставляются в тестах.

export const STAGES = ['idle', 'checking-cache', 'importing-lib', 'loading-model', 'ready', 'failed']

/** Название этапа простым русским (в диагностике «этап: …») */
export const STAGE_TEXT = {
  idle: 'ждём',
  'checking-cache': 'проверяем кэш модели',
  'importing-lib': 'загружаем библиотеку',
  'loading-model': 'загружаем модель в память',
  ready: 'готово',
  failed: 'ошибка',
}
/** Название этапа для сообщения об ошибке («ошибка загрузки модели: …») */
export const STAGE_FAIL_TEXT = {
  'checking-cache': 'проверки кэша', 'importing-lib': 'загрузки библиотеки', 'loading-model': 'загрузки модели', ready: 'записи', idle: 'прогрева', failed: 'прогрева',
}

/** Кто запустил прогрев (строка «прогрев запущен: …») */
export const TRIGGER_TEXT = {
  lesson: 'при входе в урок', panel: 'при открытии панели', manual: 'вручную (кнопка «Прогреть сейчас»)', tap: 'по нажатию (режим «Только Vosk»)',
  'bg-cached': 'после докачки модели в фоне', mode: 'после смены режима админом', retry: 'повтор после паузы',
}

export const STAGE_TIMEOUT_MS = { 'checking-cache': 20000, 'importing-lib': 30000, 'loading-model': 60000 }
export const TRACE_MAX = 30

/** Этап не уложился в свой таймаут */
export class StageTimeout extends Error {
  constructor(stage, ms) {
    super(`таймаут: этап «${STAGE_TEXT[stage]}» не закончился за ${Math.round(ms / 1000)} с`)
    this.name = 'StageTimeout'; this.stage = stage
  }
}
/** Прогрев отменён (перезапуск вручную / таймаут): результат запоздавшего этапа выбрасываем без ошибки */
export class WarmAbandoned extends Error {
  constructor() { super('прогрев отменён'); this.name = 'WarmAbandoned' }
}

/** Добавить запись в журнал этапов (не больше TRACE_MAX последних) */
export function addTrace(trace, entry) {
  trace.push(entry)
  if (trace.length > TRACE_MAX) trace.splice(0, trace.length - TRACE_MAX)
}

/**
 * Сторож таймаутов одного прогрева. arm(stage) — перезапустить таймер под новый этап; race(promise) — результат promise либо StageTimeout, что случится раньше
 * (запоздавший promise не остаётся «необработанным»); stop() — снять таймер.
 */
export function createStageGuard({ setTimer = setTimeout, clearTimer = clearTimeout, timeouts = STAGE_TIMEOUT_MS } = {}) {
  let timer = 0
  let reject = null
  return {
    arm(stage) {
      clearTimer(timer); timer = 0
      const ms = timeouts[stage]
      if (ms) timer = setTimer(() => { timer = 0; reject?.(new StageTimeout(stage, ms)) }, ms)
    },
    race(promise) {
      promise.catch(() => {})
      return Promise.race([promise, new Promise((_, rej) => { reject = rej })])
    },
    stop() { clearTimer(timer); timer = 0 },
  }
}

import { pLog } from '../../../../shared/lib/debug.js'

// Сверка «длина клипа по таймлайну» vs «сколько слово/ячейка реально светились
// в браузере» — чтобы расхождение было видно в скачанном логе как числа, а не
// на глаз. glowAssembled — отдельная точка: момент ухода в бокс сборки фразы
// (не обязательно момент, когда гаснет зелёный — см. glowOff).
const onAt = new Map()

export function glowOn(key, label, cfgDur) {
  onAt.set(key, performance.now())
  pLog(`[td-glow] ON   ${label} · длина_по_таймлайну=${cfgDur.toFixed(2)}s`)
}

export function glowAssembled(key, label) {
  const t0 = onAt.get(key)
  const ms = t0 != null ? Math.round(performance.now() - t0) : '?'
  pLog(`[td-glow] БОКС ${label} · ушло в бокс через ${ms}мс после ON`)
}

export function glowOff(key, label) {
  const t0 = onAt.get(key)
  onAt.delete(key)
  if (t0 == null) { pLog(`[td-glow] OFF  ${label} · ⚠ нет пары ON (уже удалён/повтор)`); return }
  pLog(`[td-glow] OFF  ${label} · реально_светилось=${Math.round(performance.now() - t0)}мс`)
}

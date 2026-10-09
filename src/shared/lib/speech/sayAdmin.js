// Распознанный текст («что услышал движок») в модуле «Сказать фразу» видит ТОЛЬКО админ: обычному ученику не показываем
// ни живой interim, ни «услышали …», ни подписи, цитирующие сказанное. Админу — одна компактная серая строка для диагностики:
// отдельно последний interim и итоговый final, чтобы было видно, когда движок «исправил» слово («I'm try → I'm trying»).
import { interimDiffers } from './sayResult.js'

/** Единственное правило: показывать ли распознанный текст. isAdmin — эффективный админ плеера (useAdmin) */
export const showHeardText = ({ isAdmin }) => !!isAdmin

const q = t => `«${t}»`

/**
 * Строка для админа или null. phase — фаза панели, view — вид контроллера (interim/lastInterim/final/alternatives).
 * @returns {{text: string, title: string}|null} title — все варианты распознавания (всплывающая подсказка)
 */
export function adminHeardLine({ isAdmin, phase, view }) {
  if (!showHeardText({ isAdmin }) || !view) return null
  const final = view.final?.text || ''
  if (phase === 'run' && view.status === 'listening') {
    return view.interim ? { text: `Админ: слышу ${q(view.interim)}`, title: '' } : null
  }
  if (!final || (phase !== 'passed' && phase !== 'failed')) return null
  const alts = (view.alternatives ?? []).map(a => a.text).filter(Boolean)
  const conf = typeof view.final?.confidence === 'number' ? ` · ${Math.round(view.final.confidence * 100)}%` : ''
  const text = interimDiffers(view.lastInterim, final)
    ? `Админ: interim: ${q(view.lastInterim)} → final: ${q(final)}${conf}`
    : `Админ: услышали ${q(final)}${conf}`
  return { text, title: alts.length > 1 ? `Варианты: ${alts.map(q).join(' · ')}` : '' }
}

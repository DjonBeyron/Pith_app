// Распознанный текст («что услышал движок») в модуле «Сказать фразу» видит ТОЛЬКО админ: обычному ученику не показываем
// ни живой interim, ни «услышали …», ни подписи, цитирующие сказанное. Админу — компактная серая плашка НАД панелью (вне модуля,
// не влияет на её высоту): отдельно последний interim и итоговый final, чтобы было видно, когда движок «исправил» слово
// («I'm try → I'm trying»), и вторая строка с пометками (слова, подтверждённые только final; звуки приложения подавлены).
// Строка НЕ очищается после результата/ошибки/таймаута — только в момент старта новой записи (sayFlow: 'begin').
import { interimDiffers, failReason } from './sayResult.js'

/** Единственное правило: показывать ли распознанный текст. isAdmin — эффективный админ плеера (useAdmin) */
export const showHeardText = ({ isAdmin }) => !!isAdmin

export const QUIET_NOTE = 'звуки приложения подавлены'

const q = t => `«${t}»`
/** Пометка про реальный уровень звука для колец (эксперимент, sayRealLevel.js): вкл / выкл / ошибка (тихий откат на синтетический) */
export const realLevelNote = status => `реальный уровень: ${status || 'выкл'}`

/**
 * Строка для админа или null (null — «нового сказать нечего», прежняя строка остаётся). phase — фаза панели, view — вид контроллера
 * (interim/lastInterim/final/alternatives), verdict/errorCode — итог попытки.
 * @returns {{text: string, note: string, title: string}|null} title — все варианты распознавания (всплывающая подсказка)
 */
export function adminHeardLine({ isAdmin, phase, view, verdict = null, errorCode = null, realLevel = null }) {
  if (!showHeardText({ isAdmin }) || !view) return null
  const note = (...parts) => [...parts.filter(Boolean), QUIET_NOTE, realLevelNote(realLevel)].join(' · ')
  const final = view.final?.text || ''
  if (phase === 'run' && view.status === 'listening') {
    return view.interim ? { text: `Админ: слышу ${q(view.interim)}`, note: note(), title: '' } : null
  }
  if (phase !== 'passed' && phase !== 'failed') return null
  if (!final) { // ошибка/тишина/таймаут: интерим (если был) остаётся на виду вместе с причиной
    const why = failReason({ errorCode, verdict }) || errorCode || 'нет текста'
    return { text: `Админ: ${why}${view.lastInterim ? ` · слышал ${q(view.lastInterim)}` : ''}`, note: note(), title: '' }
  }
  const alts = (view.alternatives ?? []).map(a => a.text).filter(Boolean)
  const conf = typeof view.final?.confidence === 'number' ? ` · ${Math.round(view.final.confidence * 100)}%` : ''
  const text = interimDiffers(view.lastInterim, final)
    ? `Админ: interim: ${q(view.lastInterim)} → final: ${q(final)}${conf}`
    : `Админ: услышали ${q(final)}${conf}`
  const dwell = verdict?.firstSeenBlocked ?? [] // слова, где ошибочная форма держалась в interim дольше выдержки («первое увиденное»)
  const onlyFinal = (verdict?.engineFixed ?? []).filter(w => !dwell.includes(w))
  const fixed = onlyFinal.length ? `слово ${onlyFinal.join(', ')} подтверждено только final (корректировка движка)` : ''
  const seen = dwell.length ? `слово ${dwell.join(', ')}: ошибочная форма держалась в interim дольше выдержки («первое увиденное»)` : ''
  return { text, note: note(fixed, seen), title: alts.length > 1 ? `Варианты: ${alts.map(q).join(' · ')}` : '' }
}

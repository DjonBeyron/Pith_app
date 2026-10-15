import { quotaVerdict, SET_LABEL } from './voicePlan.js'
import { AUDIO_SETS_ORDER } from './voiceAllDeps.js'
import ScTip from '../ScTip.jsx'

// Подтверждение «Озвучить всё»: выбор наборов (☑ Текст ☑ Перевод), расчёт по каждому набору
// (реплик / из кэша / вызовов / символов) и в сумме, остаток квоты и «не хватит». Часть
// VoiceAllDialog, вынесена ради размера файла. plan — planVoiceAll(scene, sets).
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many)
const fmt = n => Number(n ?? 0).toLocaleString('ru-RU')

export default function VoiceAllFacts({ plan, sets, quota, onSets }) {
  const q = quotaVerdict(plan, quota)
  const reuse = plan.items.length - plan.generate
  const toggle = set => {
    const next = sets.includes(set) ? sets.filter(s => s !== set) : [...AUDIO_SETS_ORDER.filter(s => sets.includes(s) || s === set)]
    if (next.length) onSets(next)
  }
  return (
    <>
      <div className="scbVoiceSetsPick" role="group" aria-label="Что озвучивать">
        <span className="scbSub">Озвучивать: <ScTip help="voice_sets" /></span>
        {AUDIO_SETS_ORDER.map(set => (
          <label key={set} className="scCheck">
            <input type="checkbox" checked={sets.includes(set)} disabled={sets.length === 1 && sets.includes(set)} onChange={() => toggle(set)} /> {SET_LABEL[set]}
          </label>
        ))}
      </div>
      {plan.items.length === 0 ? (
        <p className="scbSub">
          {sets.length === 1 && sets[0] === 'translation' && !plan.bySet?.translation?.withText
            ? 'Ни у одной реплики нет перевода — озвучивать нечего.'
            : `Все ${plan.total} ${plural(plan.total, 'реплика', 'реплики', 'реплик')} уже озвучены актуальными файлами — генерировать нечего.`}
        </p>
      ) : (
        <ul className="scbVoiceFacts">
          {sets.map(set => {
            const b = plan.bySet?.[set]
            if (!b) return null
            const cache = b.items - b.generate
            return (
              <li key={set}>
                <b>{SET_LABEL[set]}:</b> озвучить {b.items} из {b.withText}{set === 'translation' && b.withText < b.total ? ` (перевод есть у ${b.withText} из ${b.total})` : ''}
                {b.items > 0 && <> — вызовов {b.generate}, символов {fmt(b.chars)}{cache > 0 ? `, из кэша ${cache}` : ''}</>}
                {b.items === 0 && b.withText > 0 && ' — всё актуально'}
                {b.withText === 0 && ' — текста нет'}
              </li>
            )
          })}
          <li>Итого: <b>{plan.items.length}</b> {plural(plan.items.length, 'запись', 'записи', 'записей')}{reuse > 0 && <>, из них <b>{reuse}</b> — из кэша без вызова API (та же фраза тем же голосом, в любом наборе)</>}; вызовов ElevenLabs: <b>{plan.generate}</b>, символов в квоту: <b>{fmt(plan.chars)}</b></li>
          <li>
            Остаток квоты: {q.known ? <b className={q.enough ? 'scOk' : 'scBad'}>{fmt(q.remaining)} симв.</b> : <span className="scbSub">неизвестен (функция квоты недоступна)</span>}
            {q.known && !q.enough && <span className="scbVoiceErr"> — не хватит: часть реплик вернётся с ошибкой</span>}
          </li>
          <li className="scbSub">Реплики озвучиваются по одной; ошибка одной не останавливает остальные. Пока идёт озвучка, окно не закрывайте.</li>
        </ul>
      )}
    </>
  )
}

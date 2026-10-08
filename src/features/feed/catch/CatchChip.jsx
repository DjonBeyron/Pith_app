import { plural } from '../../../shared/lib/plural.js'

// Чип над фразой в режиме «Ловли слов»: что делать и сколько осталось.
//   до первого тапа по слову — «Здесь N твоих слов · нажимай на слова, чтобы напечатать их» (N — слова уровня ≥2);
//   после первого тапа — «Напечатай, что услышал»;
//   после первого набранного слова — «Ещё N» (N — ненабранные слова фразы); всё набрано — чипа нет.
// ownCount — свои слова, remaining — ненабранные, total — всего слов, started — панель уже открывали
export default function CatchChip({ ownCount, remaining, total, started }) {
  if (remaining === 0) return null
  let text
  if (remaining < total) text = `Ещё ${remaining}`
  else if (started) text = 'Напечатай, что услышал'
  else text = `Здесь ${ownCount} ${plural(ownCount, 'твоё слово', 'твоих слова', 'твоих слов')} · нажимай на слова, чтобы напечатать их`
  return <div className="catchChip" role="status">{text}</div>
}

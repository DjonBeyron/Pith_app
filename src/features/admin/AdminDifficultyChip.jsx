import { difficultyHint } from './difficultyHint.js'

// Чип-циклер «Сложность: авто / 1 / 2 / 3» в строке фразы (AdminModulesTab). Сложность от админа нужна, пока у фразы
// меньше MIN_DIFFICULTY_VOTES голосов: по ней строится «лесенка» второго визита и значок в ленте. Когда голосов
// достаточно, важнее медиана голосов — рядом подсказка с числом голосов. row — строка curricula (сырая, snake_case).
const nextValue = v => (v == null ? 1 : v >= 3 ? null : v + 1)

export default function AdminDifficultyChip({ row, onChange }) {
  const admin = row.difficulty_admin ?? null
  const hint = difficultyHint(row.difficulty_votes ?? 0, row.difficulty ?? null, admin)
  return (
    <div className="amDiff">
      <button
        type="button"
        className={admin ? 'amChip amChipOk amChipBtn' : 'amChip amChipDim amChipBtn'}
        onClick={() => onChange(nextValue(admin))}
        title={`Сложность фразы: авто → 1 → 2 → 3. ${hint}`}>
        Сложность: {admin ?? 'авто'}
      </button>
      <span className="amDiffHint">{hint}</span>
    </div>
  )
}

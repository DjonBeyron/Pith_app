export default function PhraseWordChip({ word, used, disabled, onClick }) {
  return (
    <button
      className={`phraseChip${used ? ' phraseChipUsed' : ''}`}
      onClick={onClick}
      disabled={used || disabled}
    >
      {word}
    </button>
  )
}

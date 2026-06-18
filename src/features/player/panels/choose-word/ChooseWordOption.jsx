export default function ChooseWordOption({ text, state, onClick, disabled }) {
  const cls = [
    'chooseWordBtn',
    state === 'correct' ? 'chooseWordBtnFlashOk'  : '',
    state === 'wrong'   ? 'chooseWordBtnFlashErr' : '',
    state === 'dimmed'  ? 'chooseWordBtnDimmed'   : '',
  ].filter(Boolean).join(' ')

  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {text}
    </button>
  )
}

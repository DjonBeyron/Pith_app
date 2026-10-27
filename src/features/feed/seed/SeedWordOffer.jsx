import { useRef } from 'react'
import { seedText } from './seedWord.js'

// «Семена памяти» (B6): плашка «Чтобы не забыть слово, сохрани его» со словом и двумя кнопками. По «Сохранить»
// родитель записывает слово и запускает полёт к панели — копию снимают с элемента слова (ref), поэтому onSave(el).
// Слов «память» и «вкладка» в тексте нет (решение №7). word — слово как оно записано во фразе; onDecline — «Не сейчас».
export default function SeedWordOffer({ word, onSave, onDecline }) {
  const wordRef = useRef(null)
  const t = seedText()
  return (
    <div className="seedOffer" role="group" aria-label={t.title} onClick={e => e.stopPropagation()}>
      <span className="seedOfferWord" ref={wordRef}>{word}</span>
      <p className="seedOfferText">{t.title}</p>
      <div className="seedOfferBtns">
        <button type="button" className="seedOfferSave" onClick={() => onSave?.(wordRef.current)}>{t.save}</button>
        <button type="button" className="seedOfferLater" onClick={onDecline}>{t.decline}</button>
      </div>
    </div>
  )
}

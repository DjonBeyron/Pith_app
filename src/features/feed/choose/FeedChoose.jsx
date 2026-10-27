import { useFeedChoose } from './useFeedChoose.js'
import ChooseSheet from './ChooseSheet.jsx'
import SeedWordOffer from '../seed/SeedWordOffer.jsx'
import { useSeedWord } from '../seed/useSeedWord.js'

// Игра ленты «Выбери слово» целиком (B4): шторка игры + «Семена памяти» после верного ответа. Монтируется один раз в
// FeedTab (рядом с GuestSaveHint); сама считает слайды (журнал feed_swipe), просит предложение у бюджета Пита и ничего
// не рисует, пока игры нет. Закрыли после верного ответа — предлагаем сохранить слово (useSeedWord.offer: только если
// слова нет в памяти и у него есть колода; дневной лимит и плашка — в seed/).
//   learnView — «Моё обучение» (stepOf — слова в памяти); enabled — лента на экране; soundOn — звук ленты включён
export default function FeedChoose({ learnView = null, enabled = true, soundOn = false }) {
  const game = useFeedChoose({ inMemory: learnView?.stepOf, enabled, soundOn })
  const seed = useSeedWord()
  const { open } = game
  function close() {
    if (open?.result?.ok) seed.offer(open.word, open.moduleId)
    game.close()
  }
  return (
    <>
      {open && <ChooseSheet item={open} onFinishStats={game.onFinishStats} onClose={close} />}
      {seed.current && <SeedWordOffer word={seed.current.word} onSave={seed.save} onDecline={seed.decline} />}
    </>
  )
}

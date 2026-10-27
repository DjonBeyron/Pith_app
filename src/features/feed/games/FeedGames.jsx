import { useFeedGames } from './useFeedGames.js'
import ChooseSheet from '../choose/ChooseSheet.jsx'
import FillSheet from '../fill/FillSheet.jsx'
import PictureSheet from '../picture/PictureSheet.jsx'
import SeedWordOffer from '../seed/SeedWordOffer.jsx'
import { useSeedWord } from '../seed/useSeedWord.js'

// Игры ленты целиком (B4–B5): шторка открытой игры + «Семена памяти» после верного ответа. Монтируется один раз в
// FeedTab (рядом с GuestSaveHint); сама считает слайды (журнал feed_swipe), просит предложение у бюджета Пита и ничего
// не рисует, пока игры нет. Какая игра сейчас — решает общая очередь (feedGame.js); здесь только выбор шторки по open.game.
// Закрыли после верного ответа — предлагаем сохранить слово (useSeedWord.offer: только если слова нет в памяти и у него
// есть колода; дневной лимит и плашка — в seed/).
//   learnView — «Моё обучение» (stepOf — слова в памяти); enabled — лента на экране; soundOn — звук ленты включён
const SHEETS = { choose: ChooseSheet, fill: FillSheet, picture: PictureSheet }

export default function FeedGames({ learnView = null, enabled = true, soundOn = false }) {
  const game = useFeedGames({ inMemory: learnView?.stepOf, enabled, soundOn })
  const seed = useSeedWord()
  const { open } = game
  const Sheet = open ? SHEETS[open.game] : null
  function close() {
    if (open?.result?.ok) seed.offer(open.word, open.moduleId)
    game.close()
  }
  return (
    <>
      {Sheet && <Sheet item={open} onFinishStats={game.onFinishStats} onClose={close} />}
      {seed.current && <SeedWordOffer word={seed.current.word} onSave={seed.save} onDecline={seed.decline} />}
    </>
  )
}

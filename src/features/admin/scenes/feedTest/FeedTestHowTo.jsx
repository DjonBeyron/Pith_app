import { FEED_TEST_HOWTO } from './feedTestModel.js'

// Короткая инструкция «как проверить голосовое задание» — в диалоге «Проверить в ленте» и в блоке «Тест в ленте»
export default function FeedTestHowTo() {
  return (
    <ol className="scbFtHow" aria-label="Как проверить голосовое задание">
      {FEED_TEST_HOWTO.map((t, i) => <li key={i}>{t}</li>)}
    </ol>
  )
}

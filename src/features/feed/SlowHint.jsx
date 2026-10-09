import { Fingerprint } from 'lucide-react'

// Обучающая подсказка «Зажми, чтобы замедлить»: отпечаток пальца с пульсом и плашка текста слева (feed-media.css).
// Общая для зоны над лайком (FeedHud, useSlowMotionHint) и правой полосы «Ловли слов» (FeedSlowStrip, useCatchSlowHint):
// className — позиционирование (в полосе — .feedSlowHintCatch, feed-slow-strip.css). Касаний не ловит
export default function SlowHint({ className = '' }) {
  return (
    <div className={className ? `feedSlowHint ${className}` : 'feedSlowHint'} aria-hidden="true">
      <Fingerprint className="feedSlowHintIcon" />
      <span className="feedSlowHintText">Зажми, чтобы замедлить</span>
    </div>
  )
}

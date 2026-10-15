import FeedSlide from '../../FeedSlide.jsx'
import SandboxSlide from './SandboxSlide.jsx'

// Вход для слайда ленты: модуль-песочница (mod.isSandbox) — своё облегчённое тело, остальные — обычный FeedSlide без
// изменений. Вынесено отдельно, чтобы не раздувать FeedSlide/FeedTab (они на пределе размера).
export default function FeedSlideEntry(props) {
  return props.module?.isSandbox ? <SandboxSlide {...props} /> : <FeedSlide {...props} />
}

// Иконочная кнопка сборщика: значок вместо подписи там, где подпись не несёт смысла сверх значка.
// aria-label и title обязательны (label), класс .scbIcon — общая основа admin-scenes-icons.css
// (padding 0, значок не сжимается, зона касания ≥ 32px на телефоне). danger — красная при наведении.
export default function IconBtn(props) {
  const { Icon, label, title = null, danger = false, size = 15, className = '', ...rest } = props
  return (
    <button type="button" className={`scbIcon${danger ? ' scbIconDanger' : ''}${className ? ` ${className}` : ''}`} aria-label={label} title={title ?? label} {...rest}>
      <Icon size={size} aria-hidden="true" />
    </button>
  )
}

import pitAvatar from '../assets/pitAvatar.webp'

// Аватарка Пита по умолчанию (запечённый маскот, WebP ≈3 КБ, вставлен в код — запросов нет; scripts/mascot/bake_avatar.mjs).
// Одна картинка для шапки чата и для админских превью («Учитель», настройки урока): обёртка-кружок задаёт размер и скругление.
export default function PitAvatar({ size = 36, className = '' }) {
  return <img className={className || undefined} src={pitAvatar} alt="" width={size} height={size} draggable={false} decoding="async" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', pointerEvents: 'none' }} />
}

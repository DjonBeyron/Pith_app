// Компонент отображения пользователя в рейтинге: аватар + ник + косметика

// Приглушённая палитра для тёмной темы — детерминированная по userId
const AVATAR_COLORS = [
  { bg: '#23344d', text: '#6b9fd4' }, // синий
  { bg: '#2a2340', text: '#9b7fd4' }, // фиолетовый
  { bg: '#2d2515', text: '#d4a23a' }, // золото
  { bg: '#1a2d1a', text: '#5ab85a' }, // зелёный
  { bg: '#2d1a1a', text: '#c46060' }, // красный
  { bg: '#1a2a2d', text: '#4ab8c0' }, // бирюзовый
  { bg: '#2d2520', text: '#c48b5a' }, // бронза
  { bg: '#1d1d2d', text: '#7a7ad4' }, // индиго
]

// Простой хеш строки → индекс в палитре
function hashColor(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// Цвета медалей
const MEDAL_COLORS = {
  1: '#ffd257', // золото
  2: '#c9d3e0', // серебро
  3: '#d29a6b', // бронза
}

/**
 * UserBadge — карточка участника рейтинга.
 * @param {string}      nickname    — ник пользователя
 * @param {string}      userId      — для детерминированного цвета аватара
 * @param {object}      cosmetics   — { bg, frame, medal } — что надето
 * @param {number|null} medalPlace  — 1/2/3; если cosmetics.medal — показываем медаль
 * @param {number|null} wreathPlace — 1/2/3: лавровый венок вокруг аватара
 *                                    (топ-3 рейтинга; 2/3 перекрашены CSS-фильтром)
 * @param {number}      size        — диаметр аватара в px (по умолчанию 40)
 * @param {boolean}     pro         — подписчик Pithy Pro: золотой чип PRO у ника
 */
export default function UserBadge({
  nickname = '?',
  userId = '',
  cosmetics = {},
  medalPlace = null,
  wreathPlace = null,
  size = 40,
  pro = false,
}) {
  const color = hashColor(userId || nickname)
  const letter = (nickname[0] ?? '?').toUpperCase()

  const showMedal = cosmetics.medal && medalPlace && MEDAL_COLORS[medalPlace]
  const medalColor = showMedal ? MEDAL_COLORS[medalPlace] : null

  // Стили аватара через inline — размер параметризован
  const avatarStyle = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42),
    background: color.bg,
    color: color.text,
  }

  return (
    <span className="ubWrap">
      {/* Обёртка аватара — position:relative нужен для медали и венка */}
      <span className="ubAvatarWrap" style={{ position: 'relative', flexShrink: 0 }}>
        {/* Венок топ-3: форма 1/2 места — лавры с лучами, 3 — плотный венок */}
        {wreathPlace >= 1 && wreathPlace <= 3 && (
          <img
            className={`ubWreath ubWreath${wreathPlace}`}
            src={wreathPlace === 3 ? '/rating/wreath-dense.svg' : '/rating/wreath-laurel.svg'}
            alt=""
          />
        )}
        <span
          className={`ubAvatar${cosmetics.frame ? ' ubAvatarFrame' : ''}`}
          style={avatarStyle}
        >
          {letter}
        </span>

        {/* Медаль — маленький кружок снизу-справа аватара */}
        {showMedal && (
          <span
            className={`ubMedal ubMedal${medalPlace}`}
            style={{ background: medalColor }}
            aria-label={`${medalPlace} место`}
          >
            {medalPlace}
          </span>
        )}
      </span>

      {/* Ник: с подложкой или без */}
      <span className={`ubNick${cosmetics.bg ? ' ubNickBg' : ''}`}>
        {nickname}
      </span>

      {pro && <span className="ubPro">PRO</span>}
    </span>
  )
}

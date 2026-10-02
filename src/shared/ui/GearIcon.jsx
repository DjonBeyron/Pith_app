// Шестерёнка настроек: сплошной круглый диск с отверстием и шесть пухлых зубчиков-пилюль (раньше — Cog из lucide: контур
// с восемью острыми зубцами и вложенной фигурой). Цвет — currentColor, размер — из CSS. Зубчики — короткие толстые
// отрезки со скруглёнными концами, поэтому шестерёнка выглядит мягко и просто
export default function GearIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" aria-hidden="true">
      <path stroke="none" fillRule="evenodd" d="M12 5.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 1 0 0-13.2ZM12 9.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4Z" />
      <path fill="none" strokeWidth="3.4" strokeLinecap="round" d="M12 5.6V3.4M12 18.4v2.2M17.5 8.8l1.9-1.1M6.5 8.8 4.6 7.7M6.5 15.2l-1.9 1.1M17.5 15.2l1.9 1.1" />
    </svg>
  )
}

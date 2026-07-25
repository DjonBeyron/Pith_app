import { X } from 'lucide-react'
import AvatarPicker from './AvatarPicker.jsx'

// Попап выбора аватара — открывается тапом по аватару в профиле. Закрытие:
// тап по фону, по крестику или сразу после выбора картинки.
export default function AvatarPickerPopup({ selected, onSelect, busy, onClose }) {
  return (
    <>
      <div className="avpBackdrop" onClick={onClose} />
      <div className="avpPopup">
        <div className="avpPopupHead">
          <b>Выбери аватар</b>
          <button className="avpClose" onClick={onClose}><X size={16} /></button>
        </div>
        <AvatarPicker
          selected={selected}
          busy={busy}
          onSelect={seed => { onSelect(seed); onClose() }}
        />
      </div>
    </>
  )
}

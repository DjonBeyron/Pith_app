import NodeTextWrapModal from './NodeTextWrapModal.jsx'
import EmojiPicker from '../../shared/ui/EmojiPicker.jsx'

// Окна над текстом ноды: свои переносы и смайлики — вынесены из
// NodeContentEditor.jsx (потолок размера). Раскраска слов больше не окно —
// она инлайн в самом текстовом поле (RichTextField/RichTextToolbar).
export default function NodeTextModals({
  node, tData, mainText, mainField,
  wrapRect, onWrapClose, onWrapChange,
  emoji,
}) {
  return (
    <>
      {wrapRect && (
        <NodeTextWrapModal
          text={mainText}
          highlights={tData.highlights ?? []}
          hardWrap={!!tData.hardWrap}
          field={mainField}
          /* ширина пузыря по строкам осмысленна только у текстовой ноды:
             у аудио пузырь держит волна, у закрепа — вся ширина экрана */
          widthToggle={node.type === 'text'}
          anchorRect={wrapRect}
          onClose={onWrapClose}
          onChange={onWrapChange}
        />
      )}

      {emoji.rect && (
        <EmojiPicker anchorRect={emoji.rect} onPick={emoji.insert} onClose={emoji.close} />
      )}
    </>
  )
}

import NodeTextHighlighter from './NodeTextHighlighter.jsx'
import NodeTextWrapModal from './NodeTextWrapModal.jsx'
import EmojiPicker from '../../shared/ui/EmojiPicker.jsx'

// Три окна над текстом ноды: раскраска слов, свои переносы и смайлики.
// Вынесены из NodeContentEditor.jsx — он у потолка размера файла.
export default function NodeTextModals({
  node, tData, mainText, mainField,
  hlRect, hlTarget, onHlClose, onHighlightsChange,
  wrapRect, onWrapClose, onWrapChange,
  emoji,
}) {
  const isPro = hlTarget === 'pro'

  return (
    <>
      {hlRect && (
        <NodeTextHighlighter
          text={isPro ? (tData.proText ?? '') : mainText}
          highlights={(isPro ? tData.proHighlights : tData.highlights) ?? []}
          /* предпросмотр в раскраске должен совпадать с уроком, в том числе
             когда автор задал свои переносы */
          hardWrap={node.type === 'text' && !isPro && !!tData.hardWrap}
          anchorRect={hlRect}
          onClose={onHlClose}
          onChange={hl => onHighlightsChange(isPro ? { proHighlights: hl } : { highlights: hl })}
        />
      )}

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

// Task selector boxes. activeIndex and completedPrompts must already be the
// frozen values when the session is stopped (freeze-on-stop invariant).
import { getPromptBoxClassName, getPromptBoxState } from './promptSelectorLogic.js';
import { memo, useLayoutEffect, useRef } from 'react';

const PromptSelector = ({
  prompts,
  isExportMode,
  downloadPromptIndex,
  activeIndex,
  completedPrompts,
  onSelect,
}) => {
  const selectorRef = useRef(null);

  useLayoutEffect(() => {
    const selector = selectorRef.current;
    const activeBox = selector?.querySelector(`[data-prompt-index="${activeIndex}"]`);
    if (!selector || !activeBox) return;

    const styles = getComputedStyle(selector);
    const rowGap = parseFloat(styles.rowGap) || 0;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const rowHeight = activeBox.offsetHeight;
    const fourthRowOffset = (rowHeight + rowGap) * 3;
    const targetScrollTop = activeBox.offsetTop - paddingTop - fourthRowOffset;
    const maxScrollTop = selector.scrollHeight - selector.clientHeight;

    selector.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

    const selectorRect = selector.getBoundingClientRect();
    const activeBoxRect = activeBox.getBoundingClientRect();
    const visibleTop = selectorRect.top + selector.clientTop;
    const visibleBottom = selectorRect.bottom - selector.clientTop;

    if (activeBoxRect.top < visibleTop) {
      selector.scrollTop -= visibleTop - activeBoxRect.top;
    } else if (activeBoxRect.bottom > visibleBottom) {
      selector.scrollTop += activeBoxRect.bottom - visibleBottom;
    }
  }, [activeIndex, isExportMode, prompts.length]);

  return (
    <div
      ref={selectorRef}
      className={`prompt-selector ${isExportMode ? 'export-mode' : ''}`}
      aria-label="Task selector"
    >
      {prompts.map((prompt, index) => {
        const state = getPromptBoxState({
          index,
          activeIndex,
          completedPrompts,
          isExportMode,
          downloadPromptIndex,
        });
        return (
          <button
            key={`prompt-box-${prompt}-${index}`}
            data-prompt-index={index}
            type="button"
            className={getPromptBoxClassName(state)}
            onClick={() => onSelect(index)}
          >
            <span>Task {index + 1}</span>
          </button>
        );
      })}
    </div>
  );
};

export default memo(PromptSelector);

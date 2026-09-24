// Task selector boxes. activeIndex and completedPrompts must already be the
// frozen values when the session is stopped (freeze-on-stop invariant).
import { getPromptBoxClassName, getPromptBoxState } from './promptSelectorLogic.js';

const PromptSelector = ({
  prompts,
  isExportMode,
  downloadPromptIndex,
  activeIndex,
  completedPrompts,
  onSelect,
}) => (
  <div className={`prompt-selector ${isExportMode ? 'export-mode' : ''}`} aria-label="Task selector">
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

export default PromptSelector;

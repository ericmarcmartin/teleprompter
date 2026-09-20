// Task selector boxes. activeIndex and completedPrompts must already be the
// frozen values when the session is stopped (freeze-on-stop invariant).
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
      const isActive = index === activeIndex;
      const isCompleted = completedPrompts.includes(index);
      const isExportSelected = isExportMode && downloadPromptIndex !== 'all' && Number(downloadPromptIndex) === index;
      const isAllSelected = isExportMode && downloadPromptIndex === 'all' && index === 0;
      return (
        <button
          key={`prompt-box-${prompt}-${index}`}
          type="button"
          className={`prompt-box ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isExportSelected || isAllSelected ? 'export-selected' : ''}`}
          onClick={() => onSelect(index)}
        >
          <span>Task {index + 1}</span>
        </button>
      );
    })}
  </div>
);

export default PromptSelector;

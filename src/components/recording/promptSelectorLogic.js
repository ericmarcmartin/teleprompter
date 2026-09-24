export const getPromptBoxState = ({
  index,
  activeIndex,
  completedPrompts,
  isExportMode,
  downloadPromptIndex,
}) => ({
  isActive: index === activeIndex,
  isCompleted: completedPrompts.includes(index),
  isExportSelected: isExportMode && downloadPromptIndex !== 'all' && Number(downloadPromptIndex) === index,
  isAllSelected: isExportMode && downloadPromptIndex === 'all' && index === 0,
});

export const getPromptBoxClassName = (state) => (
  `prompt-box ${state.isActive ? 'active' : ''} ${state.isCompleted ? 'completed' : ''} ${state.isExportSelected || state.isAllSelected ? 'export-selected' : ''}`
);

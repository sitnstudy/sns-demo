// Shared completion pacing for interactive Quode help.
export function createCompletionPrompt(dialog, isReady, {delay = 1000, modal = true, beforeShow, afterShow} = {}) {
  dialog.classList.add('quode-completion-dialog');
  let timer;
  const cancel = () => {
    clearTimeout(timer); timer = undefined;
    if (dialog.open) dialog.close();
  };
  const schedule = () => {
    if (!isReady()) { cancel(); return; }
    if (timer !== undefined || dialog.open) return;
    const show = () => {
      timer = undefined;
      if (dialog.isConnected && isReady() && !dialog.open) {
        beforeShow?.();
        if (modal) dialog.showModal();
        else dialog.show();
        afterShow?.();
      }
    };
    if (delay === 0) show();
    else timer = setTimeout(show, delay);
  };
  return { schedule, cancel };
}

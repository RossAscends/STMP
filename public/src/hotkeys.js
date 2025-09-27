// Keyboard hotkeys for AIRetry and Continue-last-AI
// Usage: initHotkeys({ onAIRetry: fn, onContinue: fn })

export function initHotkeys({ onAIRetry, onContinue } = {}) {
  // Helper: is a text-entry element focused (excluding #AIMessageInput)
  function isOtherTextFieldFocused() {
    const ae = document.activeElement;
    const aiInput = document.getElementById('AIMessageInput');
    if (!ae) return false;
    const isTexty = ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable === true;
    return isTexty && ae !== aiInput;
  }

  function isAIInputEmpty() {
    const aiInput = document.getElementById('AIMessageInput');
    if (!aiInput) return false; // if missing, don't trigger hotkeys
    return String(aiInput.value || '').trim().length === 0;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight') return;
    // Only allow Shift as optional modifier
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    // Conditions: AI input empty AND no other text input focused
    if (!isAIInputEmpty() || isOtherTextFieldFocused()) return;

    // We handle this hotkey
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey) {
      if (typeof onContinue === 'function') onContinue();
    } else {
      if (typeof onAIRetry === 'function') onAIRetry();
    }
  }, { capture: true });
}

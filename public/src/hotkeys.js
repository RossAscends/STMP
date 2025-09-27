// Keyboard hotkeys for AIRetry and Continue-last-AI
// Usage: initHotkeys({ onAIRetry: fn, onContinue: fn })

export function initHotkeys({ onAIRetry, onContinue } = {}) {
  // Helper: is any popup/modal currently visible?
  function isPopupOrModalOpen() {
    try {
      // Prefer jQuery visibility checks if available
      if (typeof window !== 'undefined' && window.$) {
        const $ = window.$;
        // Any jQuery UI dialog or its overlay visible
        if ($('.ui-dialog:visible').length > 0) return true;
        if ($('.ui-widget-overlay:visible').length > 0) return true;
        // Char defs popup content (defensive; usually wrapped by .ui-dialog)
        if ($('#charDefPopup').length && $('#charDefPopup').is(':visible')) return true;
      } else {
        // Fallback without jQuery: check any element with role="dialog" that is visible
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .ui-dialog, .ui-widget-overlay'));
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
        };
        if (dialogs.some(isVisible)) return true;
      }
    } catch (_) { /* ignore */ }
    return false;
  }

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

    // Guard: if any popup/modal is open, do not fire hotkeys
    if (isPopupOrModalOpen()) return;

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

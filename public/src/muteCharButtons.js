// Handles character mute button logic (UI + state reflection) independent of handleconfig core.
// Convention: A character is considered MUTED when its mute button DOES NOT have the 'greyscale' class.
// greyscale present  => NOT muted (active)
// greyscale absent   => muted (excluded)

//import $ from 'jquery';

export function getMuteButtonForIndex(idx) {
  return idx === 0 ? $('#muteChar') : $(`#muteChar${idx + 1}`);
}

export function isMutedButton($btn) {
  if (!$btn || !$btn.length) return false;
  return !$btn.hasClass('greyscale');
}

export function ensureMuteButtonInitialState($btn) {
  if (!$btn || !$btn.length) return;
  // New / reset state = NOT muted => ensure greyscale present
  if (!$btn.hasClass('greyscale')) $btn.addClass('greyscale');
}

export function applyMuteButtonStates(liveConfig) {
  const sc = liveConfig?.promptConfig?.selectedCharacters || [];
  sc.forEach((c, idx) => {
    const $btn = getMuteButtonForIndex(idx);
    if ($btn && $btn.length) {
      // NOT muted => greyscale ON; muted => greyscale OFF
      $btn.toggleClass('greyscale', !c.isMuted);
      if (!c.isMuted && !$btn.hasClass('greyscale')) {
        $btn.addClass('greyscale');
      }
      const slot = $btn.closest('.custom-select');
      if (slot && slot.length) slot.toggleClass('charMutedSlot', !!c.isMuted);
    }
  });
}

export function bindMuteButtonEvents(onStateChange) {
  $(`[id^='muteChar']`).off('click.muteChar').on('click.muteChar', function () {
    const $btn = $(this);
    const $slot = $btn.closest('.custom-select');
    $btn.toggleClass('greyscale');
    const nowMuted = !$btn.hasClass('greyscale');
    if ($slot && $slot.length) $slot.toggleClass('charMutedSlot', nowMuted);
    if (typeof onStateChange === 'function') onStateChange();
  });
}

export default { getMuteButtonForIndex, isMutedButton, applyMuteButtonStates, bindMuteButtonEvents, ensureMuteButtonInitialState };

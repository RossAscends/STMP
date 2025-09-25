import util from './utils.js';
import { myUUID, isHost } from '../script.js';

const $button = $('#disableGuestInput');
const $body = $('body');

function setHostButtonState(allowed) {
    // allowed === true means guests CAN type (host would show option to disable)
    const isPressed = !allowed; // pressed visually when guest input is disabled
    $button.toggleClass('toggleButtonOn', isPressed);
    $button.attr('aria-pressed', isPressed ? 'true' : 'false');
    $button.prop('title', isPressed ? 'Allow Guest Input' : 'Disable Guest Input');
}

async function sendToggleRequest(nextAllowed) {
    if (!myUUID) return;
    const type = nextAllowed ? 'allowGuestInput' : 'disableGuestInput';
    util.messageServer({ type, UUID: myUUID });
}

function toggleState(allowed) {
    // allowed: boolean - whether guests are allowed to input
    console.debug('[disableGuestInput.toggleState] allowed:', allowed);
    if (!isHost) {
        if (!allowed) {
            $body.addClass('disableGuestInput');
            $('.inputAndIconsWrapper ').prop('title', 'Guest Input Disabled by Host');
        } else {
            $body.removeClass('disableGuestInput');
            $('.inputAndIconsWrapper ').prop('title', '');
        }
    } else {
        setHostButtonState(allowed);
    }
}

export default { toggleState };

$(function () {
    if (!$button.length) return;
    $button.on('click', function () {
        if (!isHost) return; // guests shouldn't trigger
        // Derive next state from aria-pressed (pressed means currently disabled)
    const isPressed = $button.attr('aria-pressed') === 'true';
        const nextAllowed = isPressed; // if pressed (disabled), clicking will allow
        // Optimistically update UI for snappier feel
        setHostButtonState(nextAllowed);
        sendToggleRequest(nextAllowed);
    });
});
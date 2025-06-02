import util from './utils.js';
import { myUUID, isPhone, isLandscape, isHost } from '../script.js';

const $button = $("#disableGuestInput");
const $body = $("body");
//console.warn($button.prop('title'))

async function requestDisable() {
    if (myUUID) {
        const disableGuestInputMessage = {
            type: "disableGuestInput",
            UUID: myUUID,
        };
        util.messageServer(disableGuestInputMessage);
    }
}

async function requestAllow() {
    if (myUUID) {
        const allowGuestInputMessage = {
            type: "allowGuestInput",
            UUID: myUUID,
        };
        util.messageServer(allowGuestInputMessage);
    }
}

function toggleState(allowed) {
    console.debug("[disableGuestInput.toggleState] called with allowed:", allowed);
    if (!isHost) {
        if (!allowed) {
            $body.addClass("disableGuestInput");
            $(".inputAndIconsWrapper ").prop('title', "Guest Input Disabled by Host");
        } else {
            $body.removeClass("disableGuestInput");
            $(".inputAndIconsWrapper ").prop('title', "");
        }
    }
    else if (isHost) {
        if (allowed) {
            $button.prop('title', "Disable Guest Input").removeClass('toggledOnCrowdControl');

        } else {
            $button.prop('title', "Allow Guest Input").addClass('toggledOnCrowdControl');

        }
    }
}

export default { requestDisable, requestAllow, toggleState };

$(async function () {
    $button.on("click", async () => {
        //send either function depending on the title value of the button
        if ($button.prop('title') === "Allow Guest Input") {
            await requestAllow()
        } else {
            await requestDisable();
        }
    });
});
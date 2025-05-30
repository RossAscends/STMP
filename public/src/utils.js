import {
    socket, isUserScrollingAIChat, isUserScrollingUserChat, username,
    isAutoResponse, isStreaming, isClaude, contextSize, responseLength,
    isLandscape, currentlyStreaming, myUUID,
} from '../script.js'

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function debounce(func, delay) {
    let timeoutId;
    return function () {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(func, delay);
    };
}

function isValidURL(url) {
    const urlRegex = /^(?:(?:https?|http):\/\/)?(?:\S+(?::\S*)?@)?(?:[a-zA-Z0-9.-]+|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/[\w.-]*)*(?:\/)?$/;
    return urlRegex.test(url);
}

//target and reference are both JQuery DOM objects ala $("#myDiv")
function setHeightToDivHeight(target, reference) {
    if (target.hasClass('isAnimating') || reference.hasClass('isAnimating')) {
        console.log('saw animating reference div, waiting')
        setTimeout(function () { setHeightToDivHeight(target, reference) }, 100)
        return
    }
    console.log(target.attr('id'), reference.attr('id'), reference.css('height'))
    target.css('height', reference.css('height'))
}

async function betterSlideToggle(target, speed = 250, animationDirection = 'height', toggleOpacity = true) {

    if (!target) {
        console.error('No target passed to betterSlideToggle, skipping');
        return
    }

    if (target.hasClass('isAnimating')) return;

    return new Promise((resolve) => {
        const props = { [animationDirection]: 'toggle' };
        if (toggleOpacity) props.opacity = 'toggle';

        target.animate(props, {
            duration: speed,
            start: () => target.addClass('isAnimating'),
            complete: () => {
                target.removeClass('isAnimating');
                target.toggleClass('needsReset');
                resolve();
            }
        });
    });
}

function minMax(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

async function flashElement(elementID, type, flashDelay = 400, times = 1) {
    var element = $('#' + elementID);
    let color
    switch (type) {
        case 'good':
            color = '#496951'
            break;
        case 'bad':
            color = '#8a4f4e'
            break;
        case 'warn':
            color = '#a4a155'
            break;
    }
    for (var i = 0; i < times; i++) {
        element.css('background-color', color);
        await delay(flashDelay);
        element.css('background-color', '');
        await delay(flashDelay);
    }
}

function formatSQLTimestamp(timestamp) {
    var date = new Date(timestamp);
    var formattedDate = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    var formattedTime = date.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
    var formattedTimestamp = formattedDate + ' ' + formattedTime;
    return formattedTimestamp;
}

let heartbeatCounter = 0
function heartbeat(socket) {
    if (socket && (socket.readyState !== WebSocket.CONNECTING && socket.readyState !== WebSocket.OPEN)) {
        console.log(heartbeatCounter);
        heartbeatCounter = 0
        console.log("[heartbeat()] saw the socket was disconnected");
        console.log("readystate", socket.readyState);
        $("#reconnectButton").show();
        $("#disconnectButton").hide();
        $("#userList ul").empty();
        $("#messageInput").prop("disabled", true).prop('placeholder', 'DISCONNECTED').addClass('disconnected');
        $("#AIMessageInput").prop("disabled", true).prop('placeholder', 'DISCONNECTED').addClass('disconnected');
        return;
    }
    let heartbeatSend = {
        UUID: myUUID,
        type: 'heartbeat',
        value: 'ping?'
    }
    messageServer(heartbeatSend);
    setTimeout(function () {
        heartbeat(socket);
        heartbeatCounter++
    }, 5000);
}

function checkIsLandscape() {
    console.debug('checking landscape or not..')
    console.debug("window H, W: ", $(window).height(), $(window).width())
    if ($(window).height() > $(window).width()) { return false }
    else { return true }
}

function enterToSendChat(event, buttonElementId) {
    if (event.which === 13) {
        if (event.shiftKey || event.metaKey || isPhone()) {
            // Ctrl+Enter was pressed, allow default behavior
            return;
        }
        event.preventDefault();
        $(buttonElementId).trigger('click');
    }
}

async function toggleControlPanelBlocks(toggle, type = null) {
    let target = toggle.next();
    if (target.hasClass('isAnimating')) { return; }

    if (type === 'single') {
        // Toggle the target panel
        console.debug(`Toggling panel view ${target.attr('id')}`);
        toggle.children('i').toggleClass('fa-toggle-on fa-toggle-off');

        if (toggle.children('i').hasClass('fa-toggle-off')) target.addClass('minimized')
        await betterSlideToggle(target, 100, 'height');
        if (toggle.children('i').hasClass('fa-toggle-on')) target.removeClass('minimized')

        return;
    }
}

function isPhone() {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileViewport = window.matchMedia('(max-width: 999px)').matches;
    console.debug('isTouchDevice', isTouchDevice, 'isMobileViewport', isMobileViewport)
    return isTouchDevice && isMobileViewport;
}

function correctSizeChats() {
    let universalControlsHeight = $("#universalControls").outerHeight()
    let totalHeight = $(window).height()
    let chatHeight = totalHeight - universalControlsHeight - 10 + 'px'
    $("#OOCChatWrapper, #LLMChatWrapper, #chatWrap").animate({ height: chatHeight }, { duration: 1 })
}

function correctSizeBody(isPhoneCheck, isIOS) {
    var orientation = window.orientation;
    if (isPhoneCheck && (orientation === 90 || orientation === -90)) {
        // Landscape orientation on iOS
        if (isIOS) {
            $('body').css({
                'padding-right': '0px',
                'width': 'calc(100svw - 10px)',
                'height': 'calc(100svh - 36px)'
            })
        }
    } else if (isPhoneCheck) {
        // Portrait orientation
        $('body').css({
            'padding': '0px',
            'padding-left': '',
            'width': 'calc(100svw - 10px)',
            'height': 'calc(100svh - 20px)',
            'margin': 'auto'
        });
    }
    correctSizeChats()
};


function calculatePromptsBlockheight() {
    const $contents = $("#controlPanelContents");
    const controlPanelHeight = Math.floor($contents.outerHeight());

    const divsToSubtract = [
        '#AIConfigToggle',
        '#configSelectorsBlock',
        '#promptsToggle',
        '#pastChatsBlock'
    ];

    let usedHeight = 0;
    divsToSubtract.forEach(selector => {
        const $el = $(selector);
        if ($el.is(":visible")) {
            usedHeight += $el.outerHeight(true); // includes margin
        }
    });

    const hrHeight = $contents.find("hr:visible").length * 11;
    const remainingHeight = controlPanelHeight - usedHeight - hrHeight;

    console.warn(`Remaining prompts block height: ${remainingHeight}px`);
    return `${remainingHeight}px`;
}


function trimIncompleteSentences(input, include_newline = false) {
    if (input === undefined) { return 'Error processing response (could not trim sentences because input was undefined).' }
    console.debug("incoming string for trim", input)
    const punctuation = new Set(['...', '…', '.', '!', '?', '*', '"', ')', '}', '`', ']', '$', '。', '！', '？', '”', '）', '】', '】', '’', '」', '】']); // extend this as you see fit
    let last = -1;
    for (let i = input.length - 1; i >= 0; i--) {
        const char = input[i];
        if (punctuation.has(char)) {
            last = i;
            break;
        }
        if (include_newline && char === '\n') {
            last = i;
            break;
        }
    }
    if (last === -1) {
        console.log('only removed whitespaces')
        console.log(input.trimEnd())
        return input.trimEnd();
    }
    let trimmedString = input.substring(0, last + 1).trimEnd();
    const trimmedOff = input.substring(last + 1);
    console.log('Trimmed off:', trimmedOff);
    return trimmedString;
}


function messageServer(message) {
    socket.send(JSON.stringify(message))

}

//gets args as JQuery objects: $("#ElementID")
//only scrolls to bottom if the user scroll point was already within 100px of bottom
//and the user is not presently scrolling.
//used to keep streamed chats in view as they come in if you're sitting at the bottom
//but allows for uninterrupted chat history viewing when new messages arrive as well.
function kindlyScrollDivToBottom($div) {
    const el = $div.get(0);
    if (!el || !autoScrollLocked) return;

    el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth"
    });
}

let autoScrollLocked = true;

$("#AIChat").on("scroll", function () {
    const $this = $(this);
    const tolerance = 150;
    const scrolledToBottom = $this.scrollTop() + $this.outerHeight() >= this.scrollHeight - tolerance;

    autoScrollLocked = scrolledToBottom;
});


function unkindlyScrollDivToBottom(divElement, duration = 300) {
    divElement.stop().animate(
        { scrollTop: divElement[0].scrollHeight },
        duration
    );
}



const activeChatClearTimers = {
    '#userChat': { intervalID: null, timeoutID: null },
    '#AIChat': { intervalID: null, timeoutID: null },
};

export function clearChatWithCountdown(trigger, type, targetSelector, isHost, onComplete) {
    const $chatDiv = $(targetSelector);
    const $wrapper = $chatDiv.parent();
    let $overlay = $wrapper.find('.chatOverlay');

    if ($overlay.length === 0) {
        $overlay = $('<div class="chatOverlay"></div>');
        $wrapper.append($overlay);
    }

    const secondsTotal = 5;
    const msTotal = secondsTotal * 1000;

    // Cancel request
    if (type === 'cancel') {
        const { intervalID, timeoutID } = activeChatClearTimers[targetSelector] || {};
        if (intervalID) clearInterval(intervalID);
        if (timeoutID) clearTimeout(timeoutID);
        activeChatClearTimers[targetSelector] = { intervalID: null, timeoutID: null };

        $overlay.hide().removeData('intervalID timeoutID');
        $overlay.empty();
        return;
    }

    // Avoid duplicates
    const existing = activeChatClearTimers[targetSelector];
    if (existing?.intervalID || existing?.timeoutID) return;

    // Host manually triggers it → notify server
    if (trigger === 'manual' && isHost) {
        messageServer({
            type: "startClearChatTimer",
            target: targetSelector,
            secondsLeft: secondsTotal,
            UUID: myUUID,
        });
    }

    // Setup overlay UI
    const $text = $('<div class="overlayText"></div>');
    const $cancel = $('<button class="clearChatCancelButton">Cancel</button>');
    $overlay.empty().append($text);
    if (isHost) $overlay.append($cancel);
    $overlay.css({ backgroundColor: 'rgba(0,0,0,0)', display: 'flex' });

    // Immediate display
    let secondsLeft = secondsTotal;
    $text.text(`This chat will clear in ${secondsLeft} seconds`); //this only displays once on load

    // Set up animation from frame 0
    let elapsed = 0;
    const updateVisuals = () => {

        const remaining = Math.round(msTotal - elapsed * 1000) / 1000
        $text.text(`This chat will clear in ${remaining} seconds`); //this is updated every frame afterwards

        const progressrate = (elapsed / msTotal) * 1000; //very granular from 0 to 1, used to calc all anim intensity
        $overlay.css('background-color', `rgba(0,0,0,${progressrate * 1.3})`)
        $overlay.css('backdrop-filter', `blur(${progressrate * 4}px)`)
        $text.css('opacity', 1 - (progressrate) * .9);
        $cancel.css('opacity', 1 - (progressrate) * .9);

        // Increase shake intensity: 1px → 8px
        const intensityPx = 1 + (progressrate) * 10;
        const intensity = `${intensityPx}px`;

        $text.addClass("nervousShake").css('--shake-intensity', intensity);
        $cancel.addClass("nervousShake").css('--shake-intensity', intensity);

    };

    updateVisuals(); // Immediately apply first frame visuals
    let framecounter = 0
    const intervalID = setInterval(() => {
        elapsed = elapsed + .016; //16ms added per interval, for a total of 313ish frames in 5 seconds. 
        framecounter += 1
        if (elapsed > msTotal) {
            clearInterval(intervalID);
            $overlay.remove();

            $text.removeClass("nervousShake panicMode").css('--shake-intensity', '1px');
            $cancel.removeClass("nervousShake panicMode").css('--shake-intensity', '1px');
            return;
        }
        //console.warn(framecounter, " frames over ", elapsed, " sec = ", framecounter / elapsed, " fps?")
        updateVisuals();
    }, 16); //16ms = 60fps (1000/60...)
    //but we are aiming for a total of 5 seconds = 5000 ms = 5000/16 = 312.5 frames

    const timeoutID = setTimeout(() => {
        clearInterval(intervalID);
        $overlay.css('background-color', 'rgba(0,0,0,1)').hide();
        $overlay.removeData('intervalID timeoutID');
        activeChatClearTimers[targetSelector] = { intervalID: null, timeoutID: null };
        if (typeof onComplete === "function") onComplete();
    }, msTotal);

    activeChatClearTimers[targetSelector] = { intervalID, timeoutID };

    $cancel.on('click', () => {
        messageServer({
            type: "cancelClearChatTimer",
            target: targetSelector,
            UUID: myUUID,
        });
    });
}


export default {
    correctSizeBody,
    correctSizeChats,
    toggleControlPanelBlocks,
    enterToSendChat,
    checkIsLandscape,
    heartbeat,
    formatSQLTimestamp,
    flashElement,
    betterSlideToggle,
    setHeightToDivHeight,
    debounce,
    delay,
    trimIncompleteSentences,
    messageServer,
    kindlyScrollDivToBottom,
    unkindlyScrollDivToBottom,
    isValidURL,
    calculatePromptsBlockheight,
    clearChatWithCountdown,
    minMax,
    isPhone
}    
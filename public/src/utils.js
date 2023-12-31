import {
    socket, isUserScrollingAIChat, isUserScrollingUserChat, username,
    isAutoResponse, isStreaming, isClaude, contextSize, responseLength, isPhone, isLandscape, currentlyStreaming, myUUID
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

async function betterSlideToggle(target, speed = 250, animationDirection) {
    return new Promise((resolve) => {
        if (target.hasClass('isAnimating')) { return }
        target.animate({ [animationDirection]: 'toggle', opacity: 'toggle' }, {
            duration: speed,
            start: () => {
                target.addClass('isAnimating')
            },
            complete: () => {
                target.removeClass('isAnimating')
                target.toggleClass('needsReset')
                resolve()
            }
        });
    })
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
        heartbeat = 0
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
    console.debug($(window).height(), $(window).width())
    if ($(window).height() > $(window).width()) { return false }
    else { return true }
}

function enterToSendChat(event, buttonElementId) {
    if (event.which === 13) {
        if (event.shiftKey || event.metaKey || isPhone) {
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
        await betterSlideToggle(target, 100, 'height');
        target.parent().css(
            "height", 'unset'
        );
        return;
    }

    // Close all panels
    $(".isControlPanelToggle:not(.subToggle)").each(async function () {
        let panelToggle = $(this);

        let panelTarget = panelToggle.next();
        console.debug(`toggling: ${panelTarget.prop('id')}`)
        if (panelTarget.css('display') == 'none') {
            return;
        }
        if (panelTarget.hasClass('isAnimating')) { return; }
        panelToggle.children('i').removeClass('fa-toggle-on').addClass('fa-toggle-off');
        await betterSlideToggle(panelTarget, 100, 'height')
    });

    // Open the clicked panel
    toggle.children('i').toggleClass('fa-toggle-on fa-toggle-off');
    await betterSlideToggle(target, 100, 'height')

}

/*
function sendKeepAlive() {
    // Set the interval for sending messages (e.g., every 1 second)
    const interval = 1000;
    const keepAliveMessage = {
        type: "keepAlive",
        UUID: myUUID,
        value: "Ping?"
    }
    //messageServer(keepAliveMessage);

    // Start the interval timer for sending periodic messages
    const timerId = setInterval(function () {
        console.log('sending KeepAlive Message')
        messageServer(keepAliveMessage)
    }, interval);

    // Stop the interval when the app becomes visible again
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            console.log('Clearing Keep Alive loop')
            clearInterval(timerId);
        }
    });
} 
*/

function correctSizeChats() {
    let universalControlsHeight = $("#universalControls").outerHeight()
    let totalHeight = $(window).height()
    let chatHeight = totalHeight - universalControlsHeight - 10 + 'px'
    $("#OOCChatWrapper, #LLMChatWrapper, #innerChatWrap").animate({ height: chatHeight }, { duration: 1 })
}

function correctSizeBody() {
    var orientation = window.orientation;
    if (isPhone && (orientation === 90 || orientation === -90)) {
        // Landscape orientation on iOS
        if (isIOS) {
            $('body').css({
                'padding-right': '0px',
                'width': 'calc(100svw - 10px)',
                'height': 'calc(100svh - 36px)'
            })
        }
    } else {
        // Portrait orientation
        $('body').css({
            'padding': '0px',
            'padding-left': '',
            'width': 'calc(100svw - 10px)',
            'height': '100svh',
            'margin': 'auto'
        });
    }
    correctSizeChats()
};
//args passed as JQUery DOM Objects //e.g. $("#myDiv")
// subtracts the height of a child div from that of its parent and returns the remaining height.
// used to calculate exact heights of divs that should fill container space.
// if no childToSubtract is passed, returns the container's height.


function calculatePromptsBlockheight() {
    let controlPanel = parseFloat($("#controlPanel > div").outerHeight());
    let crowdControlBlock = parseFloat($("#crowdControlBlock").outerHeight());
    let pastChatsBlock = parseFloat($("#pastChatsBlock").outerHeight())
    let configSelectorsBlock = parseFloat($("#configSelectorsBlock").outerHeight())
    let promptsToggle = parseFloat($("#promptsToggle").outerHeight())
    let AIConfigToggle = parseFloat($("#AIConfigToggle").outerHeight())
    let hrSize = ($("#controlPanel > div > hr").length) * 11

    let controlPanelGaps = ($("#promptConfig").children().length - 1) * 5;

    let promptsBlockHeight = controlPanel - crowdControlBlock - pastChatsBlock - configSelectorsBlock - promptsToggle - AIConfigToggle - controlPanelGaps - hrSize + 'px';

    console.log(controlPanel, crowdControlBlock, pastChatsBlock, configSelectorsBlock, promptsToggle, AIConfigToggle, controlPanelGaps, hrSize);
    console.log(promptsBlockHeight);

    return promptsBlockHeight;
}

function heightMinusDivHeight(container, childToSubtract = null) {
    console.log(`subtracting ${childToSubtract.prop('id')} height ${childToSubtract.height()} from ${container.prop('id')} height.`)

    if (childToSubtract) {
        let containerHeight = parseFloat(getComputedStyle(container[0]).height);
        let childHeight = parseFloat(getComputedStyle(childToSubtract[0]).height);

        let containerGapSize = parseFloat(container.css('gap').replace('px', '')) || 0;
        let numberOfContainerGaps = container.children().length;

        let numChildGaps = childToSubtract.children().length;
        let childGapSize = parseFloat(childToSubtract.css('gap').replace('px', '')) || 0;

        let containerPaddingTop = parseFloat(container.css('padding-top').replace('px', ''));
        let containerPaddingBottom = parseFloat(container.css('padding-bottom').replace('px', ''));
        let childPaddingTop = parseFloat(childToSubtract.css('padding-top').replace('px', ''));
        let childPaddingBottom = parseFloat(childToSubtract.css('padding-bottom').replace('px', ''));
        let gapCope = (containerGapSize * numberOfContainerGaps) + (numChildGaps * childGapSize);

        let otherChildrenHeight = 0;
        container.parent().parent().children().each(function () {
            console.log(`getting child of ${container.parent().parent().parent().prop('id')} called ${$(this).prop('id')}`)
            if (!$(this).is(childToSubtract) && !$(this).is(container) && !$(this).is(container.parent())) {
                let computedHeight = getComputedStyle(this).height;
                if (computedHeight === 'auto') {
                    $(this).css('height', 'auto');
                    computedHeight = $(this).height();
                    $(this).css('height', '');
                } else {
                    computedHeight = parseFloat(computedHeight);
                }
                let marginTop = parseFloat(getComputedStyle(this).marginTop);
                let marginBottom = parseFloat(getComputedStyle(this).marginBottom);
                computedHeight += marginTop + marginBottom;
                otherChildrenHeight += computedHeight;
                console.log(computedHeight);
            }
        });

        let controlPanelHeight = parseFloat($("#controlPanel").css('height'))
        let remainingHeight = controlPanelHeight - childHeight - otherChildrenHeight + 'px';

        console.debug(`Returning height as: 
        ${containerHeight} (container height)
        - ${childHeight} (child height)
        - ${otherChildrenHeight} (other children height)
        = ${remainingHeight}`);

        return remainingHeight;
    } else {
        return container.outerHeight();
    }
}

function trimIncompleteSentences(input, include_newline = false) {
    if (input === undefined) { return 'Error processing response (could not trim sentences).' }
    console.log("incoming string for trim", input)
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

function convertNonsenseTokensToUTF(x) {
    x = x.replace(/â¦/g, '...')
    x = x.replace(/Ã¢ÂÂ¦/g, '...')
    x = x.replace(/â|â/g, '"');
    x = x.replace(/â/g, "'");
    x = x.replace(/ÃÂ¢ÃÂÃÂ/g, '\'')
    x = x.replace(/â([^“(”)]*)â/g, '<q class="invisible-quotation">\'$1\'</q>');
    return x;
}

function messageServer(message) {
    socket.send(JSON.stringify(message))
}

//gets args as JQuery objects: $("#ElementID")
//only scrolls to bottom if the user scroll point was already within 100px of bottom
//and the user is not presently scrolling.
//used to keep streamed chats in view as they come in if you're sitting at the bottom
//but allows for uninterrupted chat history viewing when new messages arrive as well.
function kindlyScrollDivToBottom(divElement) {
    let relevantScrollStatus = false
    if (divElement.get(0) === $("#AIChat").get(0)) {
        relevantScrollStatus = isUserScrollingAIChat
    }
    if (divElement.get(0) === $("#chat").get(0)) {
        relevantScrollStatus = isUserScrollingUserChat
    }

    const isScrolledToBottom = divElement.scrollTop() + divElement.outerHeight() >= divElement[0].scrollHeight - 100;

    //console.log(divElement.attr('id'), isScrolledToBottom, relevantScrollStatus, isUserScrollingAIChat, isUserScrollingUserChat)
    //console.log(`scrolling? ${isScrolledToBottom && !relevantScrollStatus}`)

    if (isScrolledToBottom && !relevantScrollStatus) {
        divElement.scrollTop(divElement[0].scrollHeight);
    }
}

export default {
    heightMinusDivHeight,
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
    convertNonsenseTokensToUTF,
    messageServer,
    kindlyScrollDivToBottom,
    isValidURL,
    calculatePromptsBlockheight
}    
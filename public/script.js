var username, storedUsername, AIChatUsername, storedAIChatUsername, isAutoResponse, contextSize, responseLength,
    isPhone, isHorizontalChats

import control from './src/controls.js'

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startupUsernames() {
    async function initializeUsername() {
        const userInput = prompt("Enter your username:");
        if (userInput !== null && userInput !== "") {
            localStorage.setItem('username', userInput);
            console.log(`Set localStorage 'username' to ${userInput}`);
            return String(userInput);
        } else {
            return await initializeUsername();
        }
    }

    return new Promise(async (resolve) => {
        const storedUsername = localStorage.getItem('username');
        const storedAIChatUsername = localStorage.getItem('AIChatUsername');
        let username = storedUsername !== null && storedUsername !== '' ? storedUsername : await initializeUsername();
        const myUUID = localStorage.getItem('UUID') !== null ? localStorage.getItem('UUID') : '';
        let AIChatUsername = storedAIChatUsername !== null && storedAIChatUsername !== '' ? storedAIChatUsername : username;
        console.debug(`[localStorage] username:${username}, AIChatUsername:${AIChatUsername}`);

        resolve({ username, AIChatUsername });
    });
}

var sanitizeExtension = {
    type: 'output',
    filter: function (text) {
        var sanitizedHTML = DOMPurify.sanitize(text, {
            FORBID_TAGS: ['style', 'audio', 'script', 'iframe', 'object', 'embed', 'form'], // Exclude the specified tags
            FORBID_ATTR: ['onload', 'onclick', 'onmouseover', 'srcdoc', 'data-*', 'style'] // Exclude the specified attributes
        });
        return sanitizedHTML;
    }
};

var quotesExtension = function () {
    var regexes = [
        { regex: /"([^""]*)"/g, replace: '<q>$1</q>' },
        { regex: /“([^“”]*)”/g, replace: '<q class="invisible-quotation">“$1”</q>' },
        { regex: /‘([^‘’]*)’/g, replace: '<q class="invisible-quotation">‘$1’</q>' },
        { regex: /«([^«»]*)»/g, replace: '<q class="invisible-quotation">«$1»</q>' },
        { regex: /「([^「」]*)」/g, replace: '<q class="invisible-quotation">「$1」</q>' },
        { regex: /『([^『』]*)』/g, replace: '<q class="invisible-quotation">『$1』</q>' },
        { regex: /【([^【】]*)】/g, replace: '<q class="invisible-quotation">【$1】</q>' },
        { regex: /《([^《》]*)》/g, replace: '<q class="invisible-quotation">《$1》</q>' }

    ];

    return regexes.map(function (rule) {
        return {
            type: 'output',
            regex: rule.regex,
            replace: rule.replace
        };
    });
};

var converter = new showdown.Converter({
    simpleLineBreaks: true,
    openLinksInNewWindow: true,
    parseImgDimensions: false,
    emoji: true,
    backslashEscapesHTMLTags: true,
    literalMidWordUnderscores: true,
    strikethrough: true,
    extensions: [sanitizeExtension, quotesExtension]
});

//routine to check if we are on an iOS device or not
var dummyElement = $('<div>').css('-webkit-touch-callout', 'none');
var isIOS = dummyElement.css('-webkit-touch-callout') === 'none';
dummyElement.remove();

var hostname = window.location.hostname;
var port = window.location?.port;
//var wsType = window.location.hostname === (`localhost` || `127.0.0.1`) ? 'ws' : 'wss'

//disclaimer: this works, but i can't speak for the robustness of this check. 
var wsType = /[a-zA-Z]/.test(window.location.hostname) && window.location.hostname !== 'localhost' ? 'wss' : 'ws';
console.log(`We will connect to "${wsType}" server..`)
var serverUrl = `${wsType}://${hostname}:${port}`
export var myUUID, myUsername

var socket = null
var isHost

var AIChatDelay, userChatDelay

export function messageServer(message) {
    socket.send(JSON.stringify(message))
}

function updateUserChatUserList(userList) {
    console.log("updating user chat user list");
    console.debug(userList);
    if (!userList || userList.length === 0) {
        return;
    }

    const userListElement = $("#userList ul");
    userListElement.empty(); // Clear the existing user list

    userList.forEach(({ username, role, color }) => {
        const usernameText = role === "host" ? `${username} 🔑` : username;
        const listItem = `<li data-foruser="${username}" title="${username}" style="color: ${color};">${usernameText}</li>`;
        userListElement.append(listItem);
    });
}

function updateAIChatUserList(message) {
    console.debug(message);

    if (!message || message.length === 0) {
        return;
    }

    const userListElement = $('#AIChatUserList ul');
    userListElement.empty(); // Clear the existing user list

    message.forEach(({ username, color, entity }) => {
        const usernameText = entity === 'AI' ? `${username} 🤖` : username;
        const listItem = `<li data-foruser="${username}" title="${username}" style="color: ${color};">${usernameText}</li>`;
        userListElement.append(listItem);
    });
}

async function processConfirmedConnection(parsedMessage) {
    console.log('--- processing confirmed connection...');
    const { clientUUID, newAIChatDelay, newUserChatDelay, role, D1JB, instructList, instructFormat,
        selectedCharacter, selectedCharacterDisplayName, selectedSamplerPreset, chatHistory,
        AIChatHistory, cardList, samplerPresetList, userList, isAutoResponse, contextSize,
        responseLength, engineMode } = parsedMessage;
    if (newAIChatDelay) {
        AIChatDelay = newAIChatDelay * 1000
        $("#AIChatInputDelay").val(newAIChatDelay)
        flashElement('AIChatInputDelay', 'good')
    }
    if (newUserChatDelay) {
        userChatDelay = newUserChatDelay * 1000
        $("#UserChatInputDelay").val(newUserChatDelay)
        flashElement('UserChatInputDelay', 'good')
    }
    myUUID = myUUID === '' ? clientUUID : myUUID;
    localStorage.setItem('UUID', myUUID);
    isHost = role === 'host' ? true : false
    console.debug(`my UUID is: ${myUUID}`)
    var userRole = isHost ? 'Host' : 'Guest';
    $("#userRole").text(userRole)
    $("#charName").text(selectedCharacterDisplayName)
    if (isHost) {
        $("#charName").hide()

        //on page load controlPanel is 'open' but has display:none,
        //and the toggle has 'closePanel' in the HTML file, indicating that its next click will close the panel.
        //the assumption is, for PC users, the panel should be shown for Hosts automatically.
        //however, in the case of reconnect without page load, the panel might be closed by user.
        //we should respecst that so...check if toggle is prepped to close panel

        //if 'closePanel' doesn't exist, we can assume user closed the panel already and it should stay closed.
        if ($("#controlPanelToggle").hasClass('closePanel')) {
            //however for phones the panel should not be loaded automatically, so make sure we are not on a phone
            if (!isPhone) {
                //...and then display the panel.
                $("#controlPanel").css('display', 'flex')
            } else {
                //or if we ARE on a phone, swap the toggle class
                $("#controlPanelToggle").removeClass('closePanel').addClass('openPanel')
                    //and do the animation to make sure it is facing the right way.
                    .animate({ deg: 180 }, {
                        duration: 100,
                        step: function (now) {
                            $("#controlPanelToggle").css({ transform: 'rotate(' + now + 'deg)' });
                        }
                    })
                //and make sure to hide the panel so the next width toggle works correctly.
                $("#controlPanel").hide()
                $("#roleKeyInputDiv").removeClass('positionAbsolute')
            }
        }

        $(".hostControls").css('display', 'flex')

        $("#AIAutoResponse").prop('checked', isAutoResponse)
        flashElement('AIAutoResponse', 'good')

        $("#maxContext").find(`option[value="${contextSize}"]`).prop('selected', true)
        flashElement('maxContext', 'good')

        $("#responseLength").find(`option[value="${responseLength}"]`).prop('selected', true)
        flashElement('responseLength', 'good')

        control.populateSelector(cardList, 'characters');
        control.populateSelector(instructList, 'instructStyle');
        control.populateSelector(samplerPresetList, 'samplerPreset');
        console.log('updating UI to match server state...')
        control.updateSelectedChar(myUUID, selectedCharacter, selectedCharacterDisplayName, 'forced');
        control.updateSelectedSamplerPreset(myUUID, selectedSamplerPreset, 'forced');
        control.updateInstructFormat(myUUID, instructFormat, 'forced');
        control.updateD1JB(myUUID, D1JB, 'forced')
        control.setEngineMode(myUUID, engineMode);
        $("#showPastChats").trigger('click')
    } else {
        $("#controlPanel, .hostControls").remove()
    }

    $("#chat").empty();
    $("#AIchat").empty();
    updateUserChatUserList(userList);

    if (chatHistory) {
        const trimmedChatHistoryString = chatHistory.trim();
        const parsedChatHistory = JSON.parse(trimmedChatHistoryString);
        appendMessagesWithConverter(parsedChatHistory, "#chat");
    }

    if (AIChatHistory) {
        const trimmedAIChatHistoryString = AIChatHistory.trim();
        const parsedAIChatHistory = JSON.parse(trimmedAIChatHistoryString);
        appendMessagesWithConverter(parsedAIChatHistory, "#AIchat");
    }

    $("#chat").scrollTop($("#chat").prop("scrollHeight"));
    $("#AIchat").scrollTop($("#AIchat").prop("scrollHeight"));
}

function appendMessagesWithConverter(messages, elementSelector) {
    messages.forEach(({ username, userColor, content }) => {
        const message = converter.makeHtml(content);
        const newDiv = $("<div></div>").html(`<span style="color:${userColor}" class="chatUserName">${username}</span>${message}`);
        $(elementSelector).append(newDiv);
    });
}

async function connectWebSocket(username) {
    var username, AIChatUsername
    myUsername = localStorage.getItem('username') !== null ? localStorage.getItem('username') : { username, AIChatUsername } = await startupUsernames();

    myUUID = localStorage.getItem('UUID') !== null ? localStorage.getItem('UUID') : '';
    console.log(`trying to connect to ${serverUrl} with ${myUUID}, ${myUsername} or ${username}`)
    socket = new WebSocket(serverUrl + '?uuid=' + myUUID + '&username=' + encodeURIComponent(username));
    console.log('socket connected!')
    socket.onopen = handleSocketOpening;
    socket.onclose = disconnectWebSocket;
    // Handle incoming messages from the server
    socket.addEventListener('message', async function (event) {
        var message = event.data;
        console.debug('Received server message:', message);
        let parsedMessage = JSON.parse(message);
        switch (parsedMessage?.type) {
            case 'clearChat':
                console.log('Clearing User Chat')
                $("#chat").empty()
                break;
            case 'clearAIChat':
                console.log('Clearing AI Chat')
                $("#AIchat").empty()
                break;
            case 'chatUpdate':
                console.log('saw chat update instruction');
                $("#AIchat").empty();
                let resetChatHistory = parsedMessage.chatHistory;
                resetChatHistory.forEach((obj) => {
                    let username = obj.username;
                    let userColor = obj.userColor;
                    let message = converter.makeHtml(obj.content);
                    let newDiv = $(`<div></div>`);
                    newDiv.html(`<span style="color:${userColor}" class="chatUserName">${username}</span>${message}`);
                    $("#AIchat").append(newDiv);
                });
                break;
            case 'modeChange':
                control.setEngineMode(parsedMessage.engineMode);
                break;
            case 'userList':
            case 'userConnect':
            case 'userDisconnect':
                const userList = parsedMessage.userList;
                updateUserChatUserList(userList);
                break;
            case 'forceDisconnect':
                disconnectWebSocket();
                break;
            case 'connectionConfirmed':
                processConfirmedConnection(parsedMessage)
                break;
            case 'userChangedName':
                console.log('saw notification of user name change');
                var { type, content } = JSON.parse(message);
                const HTMLizedUsernameChangeMessage = converter.makeHtml(content);
                const sanitizedUsernameChangeMessage = DOMPurify.sanitize(HTMLizedUsernameChangeMessage);
                let newUsernameChatItem = $('<div>');
                newUsernameChatItem.html(`<i>${sanitizedUsernameChangeMessage}</i>`);
                $("#chat").append(newUsernameChatItem).scrollTop($(`div[data-chat-id="${chatID}"]`).prop("scrollHeight"));
                break;
            case 'changeCharacter':
                let currentChar = $("#characters").val()
                let newChar = parsedMessage.char
                if (currentChar !== newChar) {
                    control.updateSelectedChar(myUUID, newChar, parsedMessage.charDisplayName, 'forced');
                }
                break;
            case 'changeSamplerPreset':
                let currentPreset = $("#samplerPreset").val()
                let newPreset = parsedMessage.newPreset
                if (currentPreset !== newPreset) {
                    control.updateSelectedSamplerPreset(myUUID, newPreset, 'forced');
                }
                break;
            case 'changeInstructFormat':
                let currentFormat = $("#instructStyle").val()
                let newFormat = parsedMessage.newInstructFormat
                if (currentFormat !== newFormat) {
                    control.updateInstructFormat(myUUID, newFormat, 'forced');
                }
                break;
            case 'changeD1JB':
                let currentJB = $("#finalInstruction").val()
                let newJB = parsedMessage.newD1JB
                if (currentJB !== newJB) {
                    control.updateD1JB(myUUID, newJB, 'forced');
                }
                break;
            case 'keyAccepted':
                //refresh page to get new info, could be done differently in the future
                await flashElement('roleKeyInput', 'good')
                console.log('key accepted, refreshing page...')
                location.reload();
                break;
            case 'keyRejected':
                //refresh page to get new info, could be done differently in the future
                console.log('key rejected')
                $("#roleKeyInput").val('')
                await flashElement('roleKeyInput', 'bad')
                break;
            case 'pastChatsList':
                let chatList = parsedMessage.pastChats
                showPastChats(chatList)
                break;
            case 'pastChatToLoad':
                console.log('loading past chat session');
                $("#AIchat").empty();
                $("#AIChatUserList ul").empty();
                let pastChatHistory = parsedMessage.pastChatHistory;
                let sessionID = parsedMessage.sessionID
                $("#pastChatsList .activeChat").removeClass('activeChat')
                $("#pastChatsList").find(`div[data-session_id="${sessionID}"]`).addClass('activeChat')
                pastChatHistory.forEach((obj) => {
                    let username = obj.username;
                    let userColor = obj.userColor;
                    let message = converter.makeHtml(obj.content);
                    let newDiv = $(`<div></div>`);
                    newDiv.html(`<span style="color:${userColor}" class="chatUserName">${username}</span>${message}`);
                    $("#AIchat").append(newDiv);
                });
                break;
            case 'pastChatDeleted':
                let wasActive = parsedMessage?.wasActive
                if (wasActive) {
                    $("#clearAIChat").trigger('click')
                }
                $("#showPastChats").trigger('click')
                break
            case 'autoAItoggleUpdate':
                $("#AIAutoResponse").prop('checked', parsedMessage.value)
                console.log('autoAI toggle updated')
                break
            case 'contextSizeChange':
                $("#maxContext").find(`option[value="${parsedMessage.value}"]`).prop('selected', true)
                console.log('maxContext  updated')
                break
            case 'responseLengthChange':
                $("#responseLength").find(`option[value="${parsedMessage.value}"]`).prop('selected', true)
                console.log('responseLength updated')
                break
            case 'AIChatDelayChange':
                AIChatDelay = parsedMessage.value * 1000
                console.log('AI Chat delay updated')
                break
            case 'userChatDelayChange':
                userChatDelay = parsedMessage.value * 1000
                console.log('User Chat delay updated')
                break
            default:
                console.log('saw chat message')
                var { chatID, username, content, userColor, workerName, hordeModel, kudosCost, AIChatUserList } = JSON.parse(message);
                console.log(`saw chat message: [${chatID}]${username}:${content}`)
                const HTMLizedMessage = converter.makeHtml(content);
                const sanitizedMessage = DOMPurify.sanitize(HTMLizedMessage);
                let newChatItem = $('<div>');
                newChatItem.html(`<span style="color:${userColor}" class="chatUserName">${username}</span> ${sanitizedMessage}`)
                if (workerName !== undefined && hordeModel !== undefined && kudosCost !== undefined) {
                    $(newChatItem).prop('title', `${workerName} - ${hordeModel} (Kudos: ${kudosCost})`);
                }
                console.log('appending new mesage to chat')
                $(`div[data-chat-id="${chatID}"]`).append(newChatItem).scrollTop($(`div[data-chat-id="${chatID}"]`).prop("scrollHeight"));
                if (chatID === 'AIChat') {
                    $("#showPastChats").trigger('click') //autoupdate the past chat list with each AI chat message
                }
                if (chatID === 'AIChat') {
                    //console.log(AIChatUserList)
                    updateAIChatUserList(AIChatUserList)
                }
                break;

        }
    });
}

export async function flashElement(elementID, type, flashDelay = 400, times = 1) {
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

function showPastChats(chatList) {
    const $pastChatsList = $("#pastChatsList");
    $pastChatsList.empty();

    if (Object.keys(chatList).length === 0) {
        $pastChatsList.html('<span class="flexbox Hcentered" style="margin-left: -15px;">No past chats yet!</span>');
        return;
    }

    for (let sessionID in chatList) {
        if (chatList.hasOwnProperty(sessionID)) {
            const item = chatList[sessionID];
            const divElement = $(`<div class="pastChatItem flexbox transition250" data-session_id="${item.session_id}">`);
            if (item.is_active) {
                divElement.addClass('activeChat');
            }
            const formattedTimestamp = formatSQLTimestamp(item.latestTimestamp);
            const sessionText = $(`<span>${item.aiName} (${item.messageCount})</span>`);
            const nameAndTimestampDiv = $(`<div data-session_id="${item.session_id}" class="pastChatInfo flexbox flexFlowCol flex1">`);
            const timestampText = $(`<small>${formattedTimestamp}</small>`);
            const delButton = $(`<button data-session_id="${item.session_id}" class="pastChatDelButton opacityHalf bgTransparent">🗑️</button>`);
            divElement.append(nameAndTimestampDiv).append(delButton);
            nameAndTimestampDiv.append(sessionText).append(timestampText);
            $pastChatsList.append(divElement);
        }
    }

    $pastChatsList.off('click', '.pastChatDelButton').on('click', '.pastChatDelButton', async function (e) {
        const $parent = $(this).parent();
        $parent.animate({ opacity: 0, height: 0 }, {
            duration: 250,
            complete: async function () {
                await delay(250);
                $parent.hide();
                console.log('animation done');
                e.preventDefault();
                const sessionID = $parent.data('session_id');
                console.log(sessionID);
                const pastChatDelMessage = {
                    type: 'pastChatDelete',
                    UUID: myUUID,
                    sessionID: sessionID
                };
                messageServer(pastChatDelMessage);
            }
        });
    });

    $pastChatsList.off('click', '.pastChatInfo').on('click', '.pastChatInfo', function () {
        const sessionID = $(this).data('session_id');
        console.log(`requesting to load chat from session ${sessionID}...`);
        const pastChatListRequest = {
            UUID: myUUID,
            type: "loadPastChat",
            session: sessionID
        };
        messageServer(pastChatListRequest);
    });
}

function formatSQLTimestamp(timestamp) {
    var date = new Date(timestamp);
    var formattedDate = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    var formattedTime = date.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
    var formattedTimestamp = formattedDate + ' ' + formattedTime;
    return formattedTimestamp;
}

function handleSocketOpening() {
    console.log("WebSocket opened to server:", serverUrl);
    $("#reconnectButton").hide()
    $("#disconnectButton").show()
    const username = $("#usernameInput").val()
    console.debug(`connected as ${username}`)
    $("#messageInput").prop("disabled", false).prop('placeholder', 'Message the User Chat').removeClass('disconnected')
    $("#AIMessageInput").prop("disabled", false).prop('placeholder', 'Message the AI Chat').removeClass('disconnected')
};

function disconnectWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("WebSocket disconnected from server:", serverUrl);
        $("#reconnectButton").show()
        $("#disconnectButton").hide()
        $("#userList ul").empty()
        $("#messageInput").prop("disabled", true).prop('placeholder', 'DISCONNECTED').addClass('disconnected');
        $("#AIMessageInput").prop("disabled", true).prop('placeholder', 'DISCONNECTED').addClass('disconnected');
        socket.close();
    }
}

function doAIRetry() {
    let char = $('#characters').val();
    let retryMessage = {
        type: 'AIRetry',
        UUID: myUUID,
        chatID: 'AIChat',
        username: username,
        char: char
    }
    messageServer(retryMessage)
}

async function sendMessageToAIChat(type) {
    if ($("#AIUsernameInput").val().trim() === '') {
        alert("Can't send chat message with no username!");
        return;
    }

    var messageInput = $("#AIMessageInput");
    if (messageInput.val().trim() === '' && type !== 'forced') {
        alert("Can't send empty message!");
        return;
    }
    username = $("#AIUsernameInput").val()
    var markdownContent = `${messageInput.val()}`;
    var websocketRequest = {
        type: 'chatMessage',
        chatID: 'AIChat',
        UUID: myUUID,
        username: username,
        userInput: markdownContent,
    }
    localStorage.setItem('AIChatUsername', username);
    messageServer(websocketRequest);
    messageInput.val('').trigger('focus');
}

let isDisconnecting = false;
// Send a disconnect message to the server before unloading the page
window.addEventListener('beforeunload', () => {
    if (!isDisconnecting) {
        disconnectWebSocket()
        isDisconnecting = true;
    }
});

$(async function () {
    console.log('document is ready')
    let { username, AIChatUsername } = await startupUsernames();
    $("#usernameInput").val(username)
    flashElement('usernameInput', 'good')
    $("#AIUsernameInput").val(AIChatUsername)
    flashElement('AIUsernameInput', 'good')

    connectWebSocket(username);

    isPhone = /Mobile/.test(navigator.userAgent);
    console.log(`Is this a phone? ${isPhone}`)

    $("#reconnectButton").off('click').on('click', function () {
        connectWebSocket()
    })
    $("#disconnectButton").off('click').on('click', function () {
        disconnectWebSocket()
    })

    $("#submitkey").off('click').on('click', function () {
        if (isPhone) {
            betterSlideToggle($("#profileManagementMenu"))
        }
        $("#roleKeyInputDiv").css('height', 'unset').toggleClass('needsReset').fadeToggle()
    })

    $("#roleKeyInput").on('input', function () {
        if ($(this).val().length === 32) {
            control.submitKey()
        }
    })

    $("#AIAutoResponse").on('input', function () {
        isAutoResponse = $(this).prop('checked')
        console.debug(`AutoResponse = ${isAutoResponse}`)
        const autoResponseStateMessage = {
            type: 'toggleAutoResponse',
            UUID: myUUID,
            value: isAutoResponse
        }
        messageServer(autoResponseStateMessage);
        flashElement('AIAutoResponse', 'good')
    })

    $("#maxContext").on('input', function () {
        contextSize = $(this).find(`option:selected`).val()
        const adjustCtxMes = {
            type: 'adjustContextSize',
            UUID: myUUID,
            value: contextSize
        }
        messageServer(adjustCtxMes);
        flashElement('maxContext', 'good')
    })

    $("#responseLength").on('input', function () {
        responseLength = $(this).find(`option:selected`).val()
        const adjustResponseLength = {
            type: 'adjustResponseLength',
            UUID: myUUID,
            value: responseLength
        }
        messageServer(adjustResponseLength);
        flashElement('responseLength', 'good')
    })

    // Send a message to the user chat
    $("#sendButton").off('click').on("click", function () {

        if ($(this).hasClass('disabledButton')) { return }
        if ($("#usernameInput").val().trim() === '') {
            alert("Can't send chat message with no username!");
            return;
        }
        var messageInput = $("#messageInput");
        if (messageInput.val().trim() === '') {
            alert("Can't send empty message!");
            return;
        }

        $(this).addClass('disabledButton').text('🚫')
        setTimeout(() => {
            $(this).removeClass('disabledButton').text('✏️')
        }, userChatDelay)

        username = $("#usernameInput").val();
        var markdownContent = `${messageInput.val()}`;
        //var htmlContent = converter.makeHtml(markdownContent);
        var messageObj = {
            type: 'chatMessage',
            chatID: "UserChat",
            UUID: myUUID,
            username: username,
            content: markdownContent,
        };
        localStorage.setItem('username', username);
        messageServer(messageObj);
        messageInput.val('');
        messageInput.trigger('focus').trigger('input');
    });

    $("#triggerAIResponse").off('click').on("click", function () {
        sendMessageToAIChat('forced')
    })

    $("#AIRetry").off('click').on('click', function () {
        doAIRetry()
    })

    $("#characters").on('change', function () {
        let displayName = $("#characters").find('option:selected').text()
        control.updateSelectedChar(myUUID, $(this).val(), displayName)
    })

    $("#samplerPreset").on('change', function () {
        control.updateSelectedSamplerPreset(myUUID, $(this).val())
    })

    $("#instructStyle").on('change', function () {
        control.updateInstructFormat(myUUID, $(this).val())
    })

    $("#finalInstruction").on('blur', function () {
        control.updateD1JB(myUUID, $(this).val())
    })

    //A clickable icon that toggles between Text Completions and horde mode, swaps the API parameters, and updates the UI and server to reflect the change.
    $("#toggleMode").off('click').on('click', function () {
        let newMode = $("#toggleMode").hasClass('hordeMode') ? 'TC' : 'horde';
        let modeChangeMessage = {
            type: 'modeChange',
            UUID: myUUID,
            newMode: newMode
        }
        messageServer(modeChangeMessage);
    })

    $("#usernameInput").on('blur', function () {
        console.log('saw username input blur')
        let oldUsername = localStorage.getItem('username');
        let currentUsername = $("#usernameInput").val()
        if (oldUsername !== currentUsername) {
            console.log('notifying server of UserChat username change...')
            control.updateUserName(myUUID, currentUsername)
        }
    })

    $("#AIUsernameInput").on('blur', function () {
        control.updateAIChatUserName()
    })

    $("#AISendButton").off('click').on('click', function () {
        if ($(this).hasClass('disabledButton')) { return }
        sendMessageToAIChat()
        $("#AIMessageInput").trigger('input')
        $(this).addClass('disabledButton').text('🚫')
        setTimeout(() => {
            $(this).removeClass('disabledButton').text('✏️')
        }, AIChatDelay)
    })

    $("#clearUserChat").off('click').on('click', function () {
        console.log('Requesting OOC Chat clear')
        const clearMessage = {
            type: 'clearChat',
            UUID: myUUID,
        };
        messageServer(clearMessage);
    })

    $("#clearAIChat").off('click').on('click', function () {
        console.log('Requesting AI Chat clear')
        const clearMessage = {
            type: 'clearAIChat',
            UUID: myUUID
        };
        messageServer(clearMessage);
    })

    $("#deleteLastMessageButton").off('click').on('click', function () {
        console.log('deleting last AI Chat message')
        const delLastMessage = {
            type: 'deleteLast',
            UUID: myUUID,
        }
        messageServer(delLastMessage);
    })

    $("#profileManagementButton").on('click', function () {
        betterSlideToggle($("#profileManagementMenu"))
    })

    $('#clearLocalStorage').on('click', function () {
        betterSlideToggle($("#profileManagementMenu"))
        $("<div></div>").dialog({
            draggable: false,
            resizable: false,
            modal: true,
            position: { my: "center", at: "center top+25%", of: window },
            title: "Delete user data?",
            buttons: {

                Ok: function () {
                    $("#usernameInput").val('');
                    $("#AIUsernameInput").val('');
                    localStorage.clear();
                    alert('Deleted saved usernames!');
                    $(this).dialog("close");
                },
                Cancel: function () {
                    $(this).dialog("close");
                }
            },
            open: function () {
                $(".ui-button").trigger('blur')
            },
            close: function () {
            }
        }).html("This will clear your saved usernames and unique ID.<br><br><b style='color: #cd334d;'>!! You will lose any roles you had !!");
    });

    if (window.matchMedia("(orientation: landscape)").matches && /Mobile/.test(navigator.userAgent)) {
        if (isIOS) {
            $('body').css({
                'padding-left': '0px',
                'padding-right': '0px',
                'width': '100sfw',
                'height': 'calc(100svh - 5px)'
            })
            $(".bodywrap").css({
                gap: '5px'
            })
            $(".fontSize1p5em").addClass('fontSize1p25em').removeClass('fontSize1p5em')
            $('.fontSize1p25em')
                .css('width', '2em')
                .css('height', '2em')
                .css('line-height', '2em')
                .css('padding', '0')
        }
    }

    if (/Mobile/.test(navigator.userAgent) && isIOS) {
        $('body').css({
            'padding-left': '0px',
            'padding-right': '0px',
            'width': '100sfw',
            'height': 'calc(100svh - 15px)'
        })
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

    $("#messageInput").on("keypress", function (event) {
        enterToSendChat(event, "#sendButton");
    });

    $("#AIMessageInput").on("keypress", function (event) {
        enterToSendChat(event, "#AISendButton");
    });

    $("#showPastChats").on('click', function () {
        console.log('requesting past chat list')
        const pastChatListRequest = {
            UUID: myUUID,
            type: "pastChatsRequest"
        }
        messageServer(pastChatListRequest)
    })

    $(document).on('click', async function (e) {
        var $target = $(e.target);
        if (!$target.is("#profileManagementButton")
            && !$target.parents("#profileManagementMenu").length
            && !$target.is("#roleKeyInput")) {
            if ($("#profileManagementMenu").hasClass('needsReset')) {
                betterSlideToggle($("#profileManagementMenu"));
            }
            if ($("#roleKeyInputDiv").hasClass('needsReset')) {
                $("#roleKeyInputDiv").fadeToggle().removeClass('needsReset')
            }

        }
    });

    $(document).on('click', '#controlPanelToggle', function () {
        var $controlPanelToggle = $("#controlPanelToggle");
        var $controlPanel = $("#controlPanel");
        console.log($controlPanel.css('width'))
        let degree, isOpening
        if ($("#controlPanelToggle").hasClass('closePanel') && $("#controlPanel").css('display', 'flex')) {
            degree = 180
            isOpening = false
        } else {
            degree = 0
            isOpening = true
        }
        $controlPanelToggle.toggleClass('closePanel openPanel')
            .animate({ deg: degree }, {
                duration: 100,
                step: function (now) {
                    $controlPanelToggle.css({ transform: 'rotate(' + now + 'deg)' });
                },
                complete: function () {
                    if (isOpening) {
                        $controlPanel.animate({ opacity: 1, width: 'toggle' }, { duration: 100 })
                    } else {
                        $controlPanel.animate({ opacity: 0, width: 'toggle' }, { duration: 100 })
                    }
                }
            })
    });

    $("#AIChatToggle").off('click').on('click', function () {
        $(this).parent().parent().find('.chatHideDivWrapper').slideToggle()
    })

    const $LLMChatWrapper = $('#LLMChatWrapper');
    const $OOCChatWrapper = $('#OOCChatWrapper');
    const $AIChatInputButtons = $("#AIChatInputButtons");
    const $UserChatInputButtons = $("#UserChatInputButtons");

    $("#chatsToggle").off('click').on('click', async function () {
        //second we shrink LLM chat, and show user chat.
        if ($(this).hasClass('shrinkLLMChat')) {
            betterSlideToggle($OOCChatWrapper, false)
            await delay(250)
            betterSlideToggle($LLMChatWrapper, false)
            $(this).toggleClass('shrinkLLMChat returnToNormal');
        } else if ($(this).hasClass('returnToNormal')) {
            betterSlideToggle($LLMChatWrapper, false)
            $(this).removeClass('returnToNormal')
            //first we shrink User chat..
        } else {
            betterSlideToggle($OOCChatWrapper, false)
            $(this).toggleClass('shrinkUserChat shrinkLLMChat');
        }
    })

    $("#userListsToggle").off('click').on('click', function () {
        betterSlideToggle($("#AIChatUserList"))
        betterSlideToggle($("#userList"))
    })

    function betterSlideToggle(target, forceHorizontal = true) {
        const isChatDiv = target.parent().attr('id') === 'innerChatWrap';
        const shouldDoHorizontalAnimation = forceHorizontal || (isChatDiv && isHorizontalChats);
        const animatedDimension = shouldDoHorizontalAnimation ? 'width' : 'height';
        const isNeedsReset = target.hasClass('needsReset');
        let originalDimensionValue = shouldDoHorizontalAnimation ? target.css('width') : target.css('height')
        let appliedStyleValue = target.hasClass('needsReset') ? '' : 'unset'
        let appliedStyle = {
            [animatedDimension]: originalDimensionValue,
            [`min-${animatedDimension}`]: appliedStyleValue,
            [`max-${animatedDimension}`]: appliedStyleValue,
            'flex': appliedStyleValue
        };
        target.toggleClass('needsReset', !isNeedsReset)
        if (!isNeedsReset) {
            target.css(appliedStyle)
        }
        target.animate({ [animatedDimension]: 'toggle' }, {
            duration: 250,
            step: (now) => {
                target.css({ [animatedDimension]: now + 'px' });
            },
            complete: () => {
                if (isNeedsReset) {
                    target.css(appliedStyle);
                }
            }
        });
    }

    $('#AIMessageInput, #messageInput').on('input', function () {
        const activeInputboxID = this.id;
        const isAIMessageInput = activeInputboxID === 'AIMessageInput';
        const chatBlock = isAIMessageInput ? $LLMChatWrapper : $OOCChatWrapper;
        const inputButtons = isAIMessageInput ? $AIChatInputButtons : $UserChatInputButtons;

        const paddingRight = inputButtons.outerWidth() + 5 + 'px';
        const maxHeight = chatBlock.outerHeight() / 2 + 'px';

        $(this).css({
            'max-height': maxHeight,
            'padding-right': paddingRight
        });

        this.style.height = ''; // Reset height to default value
        this.style.height = this.scrollHeight + 'px'; // Set height based on content

        if (navigator.userAgent.toLowerCase().indexOf('firefox') === -1) {
            const scrollHeight = chatBlock.prop('scrollHeight');
            const scrollTop = chatBlock.prop('scrollTop');
            const outerHeight = chatBlock.outerHeight();
            const originalScrollBottom = scrollHeight - (scrollTop + outerHeight);
            const newScrollTop = Math.max(scrollHeight - (outerHeight + originalScrollBottom), 0);
            chatBlock.prop('scrollTop', newScrollTop);
        }
    });

    AIChatDelay = ($("#AIChatInputDelay").val()) * 1000
    userChatDelay = ($("#UserChatInputDelay").val()) * 1000

    $("#UserChatInputDelay, #AIChatInputDelay").on('change', function () {
        const messageType = this.id === 'UserChatInputDelay' ? 'userChatDelayChange' : 'AIChatDelayChange';
        const settingsChangeMessage = {
            type: messageType,
            value: $(this).val()
        };
        messageServer(settingsChangeMessage);
        flashElement(this.id, 'good');
    });

    function correctSizeChats() {
        let universalControlsHeight = $("#universalControls").outerHeight()
        let totalHeight = $(window).height()
        let chatHeight = totalHeight - universalControlsHeight - 10 + 'px'
        $("#OOCChatWrapper, #LLMChatWrapper, #innerChatWrap").animate({ height: chatHeight }, { duration: 1 })
    }

    function correctSizeBody() {
        console.log('window resize')
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
        checkChatOrientation()
    };

    $(window).on('resize', async function () {
        correctSizeBody()
    })
    correctSizeBody()
    correctSizeChats()

    function checkChatOrientation() {
        if ($("#innerChatWrap").css('flex-flow') === 'column nowrap') {
            console.log('chat is vertical')
            isHorizontalChats = false
        } else {
            console.log('chat is vertical')
            isHorizontalChats = true
        }
    }

    checkChatOrientation()

})



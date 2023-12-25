var username, storedUsername, AIChatUsername, storedAIChatUsername, isAutoResponse, contextSize, responseLength

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

var converter = new showdown.Converter({
    simpleLineBreaks: true,
    openLinksInNewWindow: true,
    parseImgDimensions: false,
    emoji: true,
    backslashEscapesHTMLTags: true,
    literalMidWordUnderscores: true,
    strikethrough: true,
    extensions: [sanitizeExtension]
});

//routine to check if we are on an iOS device or not
var dummyElement = $('<div>').css('-webkit-touch-callout', 'none');
var isIOS = dummyElement.css('-webkit-touch-callout') === 'none';
dummyElement.remove();

var hostname = window.location.hostname;
var port = window.location?.port;
var wsType = window.location.hostname === (`localhost` || `127.0.0.1`) ? 'ws' : 'wss'
var serverUrl = `${wsType}://${hostname}:${port}`
export var myUUID, myUsername

var socket = null
var isHost

var AIChatDelay, userChatDelay

export function messageServer(message) {
    socket.send(JSON.stringify(message))
}

function updateUserChatUserList(message) {
    console.log('updating user chat user list')
    console.debug(message);
    const userList = message;

    if (!userList || userList.length === 0 || userList === undefined) {
        //console.log('Saw an empty userList or userList is undefined, will wait for another...');
        return;
    }

    //console.log('Populating user list...');
    const userListElement = $('#userList ul');
    userListElement.empty(); // Clear the existing user list

    userList.forEach(user => {
        const { username, color } = user;
        let usernameText
        if (user.role === 'host') {
            usernameText = `${username} 🔑`
        } else {
            usernameText = username
        }
        const listItem = `<li data-foruser="${username}" title="${username}" style="color: ${color};">${usernameText}</li>`;

        userListElement.append(listItem);
    });
}

function updateAIChatUserList(message) {
    console.debug(message);
    const userList = message;
    if (!userList || userList.length === 0) {
        //console.log('Saw an empty or undefined AI Chat userList or userList, aborting update');
        return;
    }

    //console.log('Populating AI Chat user list...');
    const userListElement = $('#AIChatUserList ul');
    userListElement.empty(); // Clear the existing user list

    userList.forEach(user => {
        const { username, color, entity } = user;
        let usernameText
        if (entity === 'AI') {
            usernameText = `${username} 🤖`
        } else {
            usernameText = username
        }
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
        //only force show the control panel if the user has not set it to be closed with the toggle
        if ($("#controlPanelToggle.closePanel").length !== 0) {
            $("#controlPanel").show()
        }
        $(".hostControls").show()

        $("#AIAutoResponse").prop('checked', isAutoResponse)
        flashElement('AIAutoResponse', 'good')

        $("#maxContext").find(`option[value="${contextSize}"]`).prop('selected', true)
        flashElement('maxContext', 'good')

        $("#responseLength").find(`option[value="${responseLength}"]`).prop('selected', true)
        flashElement('responseLength', 'good')

        control.populateCardSelector(cardList);
        control.populateInstructSelector(instructList);
        control.populateSamplerSelector(samplerPresetList);
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
    messages.forEach((obj) => {
        const { username, userColor, content } = obj;
        const message = converter.makeHtml(content);
        const newDiv = $("<div></div>");
        newDiv.html(`<span style="color:${userColor}" class="chatUserName">${username}</span>${message}`);
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
    $("#pastChatsList").empty();
    console.log(Object.keys(chatList).length)
    if (Object.keys(chatList).length === 0) {
        $("#pastChatsList").html('<span class="flexbox Hcentered" style="margin-left: -15px;">No past chats yet!</span>')
        return
    }
    let JSONChatList = chatList;

    for (let sessionID in JSONChatList) {
        if (JSONChatList.hasOwnProperty(sessionID)) {
            let item = JSONChatList[sessionID];

            // Create a new div element for each item
            var divElement = $(`<div class="pastChatItem flexbox transition250" data-session_id="${item.session_id}">`);
            if (item.is_active) {
                divElement.addClass('activeChat')
            }
            var timestamp = item.latestTimestamp;

            // Format the timestamp
            var formattedTimestamp = formatSQLTimestamp(timestamp);

            // Set the session_id as the text content of the div

            var sessionText = $('<span>').text(`${item.aiName} (${item.messageCount})`);
            var nameAndTimestampDiv = $(`<div data-session_id="${item.session_id}" class="pastChatInfo flexbox flexFlowCol flex1">`)
            var timestampText = $(`<small>`).text(`${formattedTimestamp}`);
            var delButton = $(`<button data-session_id="${item.session_id}" class="pastChatDelButton opacityHalf bgTransparent">🗑️</button>`)
            divElement.append(nameAndTimestampDiv).append(delButton);
            nameAndTimestampDiv.append(sessionText).append(timestampText)
            $('#pastChatsList').append(divElement);
        }
    }

    $('.pastChatDelButton').off('click').on('click', async function (e) {
        $(this).parent().animate({ opacity: 0, height: 0 }, {
            duration: 250,
            complete: async function () {
                await delay(250);
                $(this).hide()
                console.log('animation done');
                e.preventDefault();
                let sessionID = $(this).data('session_id');
                console.log(sessionID);
                const pastChatDelMessage = {
                    type: 'pastChatDelete',
                    UUID: myUUID,
                    sessionID: sessionID
                };
                messageServer(pastChatDelMessage);
            }
        });
    })

    $(".pastChatInfo").off('click').on('click', function () {
        console.log(`requesting to load chat from session ${$(this).data('session_id')}...`)
        const pastChatListRequest = {
            UUID: myUUID,
            type: "loadPastChat",
            session: $(this).data('session_id')
        }
        messageServer(pastChatListRequest)
    })
}

function formatSQLTimestamp(timestamp) {
    // Convert the timestamp to a JavaScript Date object
    var date = new Date(timestamp);

    // Format the date and time components
    var formattedDate = date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    var formattedTime = date.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

    // Combine the formatted date and time components
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
        //APICallParams: APICallParams,
        char: char
    }
    messageServer(retryMessage)
}



async function sendMessageToAIChat(type) {
    //hordeAPICallParams.params.stop_sequence = stoppingStrings;

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
    messageInput.val('');
    messageInput.trigger('focus');
}

let isDisconnecting = false;
window.addEventListener('beforeunload', () => {
    if (!isDisconnecting) {
        // Send a disconnect message to the server before unloading the page
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

    var isPhone = /Mobile/.test(navigator.userAgent);
    //handle disconnect and reconnect
    $("#reconnectButton").off('click').on('click', function () {
        connectWebSocket()
    })
    $("#disconnectButton").off('click').on('click', function () {
        disconnectWebSocket()
    })

    //handle key submission
    $("#submitkey").off('click').on('click', function () {
        //show/hide roleKeyInput
        $("#roleKeyInput").toggle()
    })

    //when roleKeyInput has 16 characters, submit the key
    $("#roleKeyInput").on('input', function () {
        if ($(this).val().length === 32) {
            control.submitKey()
        }
    })

    $("#AIAutoResponse").on('input', function () {
        isAutoResponse = $(this).prop('checked')
        console.log(isAutoResponse)
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
        var htmlContent = converter.makeHtml(markdownContent);
        var messageObj = {
            type: 'chatMessage',
            chatID: "UserChat",
            UUID: myUUID,
            username: username,
            content: markdownContent,
        };
        localStorage.setItem('username', username);
        //messageServer(messageObj)
        messageServer(messageObj); //why is this one NOT strigified?

        messageInput.val('');
        messageInput.trigger('focus');
    });
    //this just circumvents the logic of requiring a username and input message before pushing send.
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
        //$("#usernameInput").trigger('change')
        control.updateAIChatUserName()
    })

    $("#AISendButton").off('click').on('click', function () {
        if ($(this).hasClass('disabledButton')) { return }

        sendMessageToAIChat()
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



    $('#clearLocalStorage').on('click', function () {
        $("#usernameInput").val('')
        $("#AIUsernameInput").val('')
        localStorage.clear();
        alert('Deleted saved usernames!');
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
    //do message send on Enter
    $("#messageInput").on("keypress", function (event) {
        if (event.which === 13) {
            if (event.shiftKey || event.metaKey) {
                // Ctrl+Enter was pressed, allow default behavior
                return;
            }
            event.preventDefault();
            $("#sendButton").trigger('click');
        }
    });
    //same for AI chat
    $("#AIMessageInput").on("keypress", function (event) {
        if (event.which === 13) {
            if (event.shiftKey || event.metaKey) {
                // Ctrl+Enter was pressed, allow default behavior
                return;
            }
            event.preventDefault();
            $("#AISendButton").trigger('click');
        }
    });

    $("#showPastChats").on('click', function () {
        console.log('requesting past chat list')
        const pastChatListRequest = {
            UUID: myUUID,
            type: "pastChatsRequest"
        }
        messageServer(pastChatListRequest)
    })

    $(document).on('click', '#controlPanelToggle.closePanel', function () {
        var $controlPanelToggle = $("#controlPanelToggle");
        var $controlPanel = $("#controlPanel");
        var $controlPanelContents = $("#controlPanel div");
        $controlPanelToggle.removeClass('closePanel').addClass('openPanel')
            .animate({ deg: 180 }, {
                duration: 100,
                step: function (now) {
                    $controlPanelToggle.css({ transform: 'rotate(' + now + 'deg)' });
                },
                complete: function () {
                    $controlPanel.css('min-width', 'unset')
                    $controlPanel.animate({ opacity: 0, width: 'toggle' }, { duration: 100 })
                }
            });
    });

    $(document).on('click', '#controlPanelToggle.openPanel', function () {
        var $controlPanelToggle = $("#controlPanelToggle");
        var $controlPanel = $("#controlPanel");
        var $controlPanelContents = $("#controlPanel div");
        $controlPanelToggle.removeClass('openPanel').addClass('closePanel')
            .animate({ deg: 0 }, {
                duration: 100,
                step: function (now) {
                    $controlPanelToggle.css({ transform: 'rotate(' + now + 'deg)' });
                },
                complete: function () {
                    $controlPanel.animate({ opacity: 1, width: 'toggle' }, {
                        duration: 100,
                        complete: function () {
                            $controlPanel.css('min-width', '200px');

                        }
                    });
                }
            });
    });

    $('#AIMessageInput, #messageInput').on('input', function () {
        const activeInputboxID = $(this).prop('id')
        let paddingRight, chatBlock
        console.log(activeInputboxID)
        const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        if (activeInputboxID === 'AIMessageInput') {
            chatBlock = $('#AIchat');
            paddingRight = $("#AIChatInputButtons").outerWidth() + 5 + 'px'
        } else {
            chatBlock = $('#chat');
            paddingRight = $("#UserChatInputButtons").outerWidth() + 5 + 'px'
        }
        const originalScrollBottom = chatBlock[0].scrollHeight - (chatBlock.scrollTop() + chatBlock.outerHeight());
        this.style.paddingRight = paddingRight
        this.style.height = window.getComputedStyle(this).getPropertyValue('min-height');
        this.style.height = this.scrollHeight + 0.3 + 'px';

        if (!isFirefox) {
            const newScrollTop = Math.round(chatBlock[0].scrollHeight - (chatBlock.outerHeight() + originalScrollBottom));
            chatBlock.scrollTop(newScrollTop);
        }
    });

    AIChatDelay = ($("#AIChatInputDelay").val()) * 1000
    userChatDelay = ($("#UserChatInputDelay").val()) * 1000

    $("#UserChatInputDelay").on('change', function () {
        //userChatDelay = ($("#UserChatInputDelay").val()) * 1000
        const settingsChangeMessage = {
            type: 'userChatDelayChange',
            value: $("#UserChatInputDelay").val()
        }
        messageServer(settingsChangeMessage)
        flashElement('UserChatInputDelay', 'good')
    })

    $("#AIChatInputDelay").on('change', function () {
        //AIChatDelay = ($("#AIChatInputDelay").val()) * 1000
        const settingsChangeMessage = {
            type: 'AIChatDelayChange',
            value: $("#AIChatInputDelay").val()
        }
        messageServer(settingsChangeMessage)
        flashElement('AIChatInputDelay', 'good')
    })


    $(window).on('orientationchange', function () {
        var orientation = window.orientation;
        if (isPhone && (orientation === 90 || orientation === -90)) {
            // Landscape orientation on iOS
            if (isIOS) {
                $('body').css({
                    'padding-left': '15px',
                    'padding-right': '0px',
                    'width': '100svw',
                    'height': 'calc(100svh - 36px)'
                })
            }
        } else {
            // Portrait orientation
            $('body').css({
                'padding': '0px',
                'height': '100svh'
            });
        }
    });
});

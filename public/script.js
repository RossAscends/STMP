var username, isAutoResponse, isStreaming, isClaude, contextSize, responseLength, isPhone, currentlyStreaming

//this prevents selectors from firing off when being initially populated
var initialLoad = true

import control from './src/controls.js'

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startupUsernames() {
    async function initializeUsername() {
        const userInput = prompt("Enter your username:");
        if (userInput !== null && userInput !== "") {
            localStorage.setItem('username', userInput);
            console.debug(`Set localStorage 'username' to ${userInput}`);
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
            FORBID_TAGS: ['style', 'audio', 'script', 'iframe', 'object', 'embed', 'form',
                'input', 'select', 'button', 'marquee', 'blink', 'font', 'style'], // Exclude the specified tags
            FORBID_ATTR: ['onload', 'onclick', 'onmouseover', 'srcdoc', 'data-*', 'style', 'color', 'bgcolor'] // Exclude the specified attributes
        });
        return sanitizedHTML;
    }
};




var quotesExtension = function () {
    var regexes = [
        /*         { regex: /â|â/g, replace: '"' },
                { regex: /â/g, replace: '\'' },*/
        { regex: /"([^"]*)"/g, replace: '<q>$1</q>' },
        { regex: /“([^“”]*)”/g, replace: '<q class="invisible-quotation">"$1"</q>' },
        { regex: /‘([^‘’]*)’/g, replace: '<q class="invisible-quotation">\'$1\'</q>' },
        //{ regex: /â([^(ââ]*)â/g, replace: '<q class="invisible-quotation">\'$1\'</q>' },
        { regex: /«([^«»]*)»/g, replace: '<q class="invisible-quotation">«$1»</q>' },
        { regex: /「([^「」]*)」/g, replace: '<q class="invisible-quotation">「$1」</q>' },
        { regex: /『([^『』]*)』/g, replace: '<q class="invisible-quotation">『$1』</q>' },
        { regex: /【([^【】]*)】/g, replace: '<q class="invisible-quotation">【$1】</q>' },
        { regex: /《([^《》]*)》/g, replace: '<q class="invisible-quotation">《$1》</q>' },
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
console.debug(`We will connect to "${wsType}" server..`)
var serverUrl = `${wsType}://${hostname}:${port}`
export var myUUID, myUsername

var socket = null
var isHost

var AIChatDelay, userChatDelay

export function messageServer(message) {
    socket.send(JSON.stringify(message))
}

function updateUserChatUserList(userList) {
    console.debug("updating user chat user list");
    console.debug(userList);
    if (!userList || userList.length === 0) {
        return;
    }

    const userListElement = $("#userList ul");
    userListElement.empty(); // Clear the existing user list

    userList.sort((a, b) => {
        const usernameA = a.username.toLowerCase();
        const usernameB = b.username.toLowerCase();

        if (usernameA < usernameB) {
            return -1;
        }

        if (usernameA > usernameB) {
            return 1;
        }

        return 0;
    });


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

    message.sort((a, b) => {
        const usernameA = a.username.toLowerCase();
        const usernameB = b.username.toLowerCase();

        if (usernameA < usernameB) {
            return -1;
        }

        if (usernameA > usernameB) {
            return 1;
        }

        return 0;
    });

    const userListElement = $('#AIChatUserList ul');
    userListElement.empty(); // Clear the existing user list

    message.forEach(({ username, color, entity }) => {
        const usernameText = entity === 'AI' ? `${username} 🤖` : username;
        const listItem = `<li data-foruser="${username}" title="${username}" style="color: ${color};">${usernameText}</li>`;
        userListElement.append(listItem);
    });
}

function getAPIList() {
    const APIListRequest = {
        type: 'APIListRequest',
        UUID: myUUID
    }
    messageServer(APIListRequest)
}

async function addNewAPI() {
    //check each field for validity, flashElement if invalid
    console.debug('[addNewAPI()] >> GO')
    let name = $("#newAPIName").val()
    let endpoint = $("#newAPIEndpoint").val()
    let key = $("#newAPIKey").val()
    let type = $("#newAPIEndpointType").val()
    let claude = $("#isClaudeCheckbox").prop('checked')
    console.log(`Claude value: ${claude}`)

    if (name === '') {
        await flashElement('newAPIName', 'bad')
        return
    }
    if (endpoint === '') {
        await flashElement('newAPIEndpoint', 'bad')
        return
    }

    messageServer({
        type: 'addNewAPI',
        name: name,
        endpoint: endpoint,
        key: key,
        endpointType: type,
        claude: claude,
        UUID: myUUID
    })
    await delay(250)
    //hide edit panel after save is done
    betterSlideToggle($("#addNewAPI"), 250, 'height')
    control.disableAPIEdit()

}

function testNewAPI() {
    let name = $("#newAPIName").val()
    let endpoint = $("#newAPIEndpoint").val()
    let key = $("#newAPIKey").val()
    let type = $("#newAPIEndpointType").val()
    let claude = $("#isClaudeCheckbox").prop('checked')

    messageServer({
        type: 'testNewAPI',
        UUID: myUUID,
        api: {
            name: name,
            endpoint: endpoint,
            key: key,
            type: type,
            claude: claude
        }
    })
}

async function getModelList() {
    let name = $("#newAPIName").val()
    let endpoint = $("#newAPIEndpoint").val()
    let key = $("#newAPIKey").val()
    let type = $("#newAPIEndpointType").val()
    let claude = $("#isClaudeCheckbox").prop('checked')
    let modelListRequestMessage = {
        UUID: myUUID,
        type: 'modelListRequest',
        api: {
            name: name,
            endpoint: endpoint,
            key: key,
            type: type,
            claude: claude
        }

    }
    messageServer(modelListRequestMessage)
}

async function processConfirmedConnection(parsedMessage) {
    console.debug('[processConfirmedConnection()]>> GO');
    const { clientUUID, newAIChatDelay, newUserChatDelay, role, D1JB, instructList, instructFormat,
        selectedCharacter, selectedCharacterDisplayName, selectedSamplerPreset, chatHistory,
        AIChatHistory, cardList, samplerPresetList, userList, isAutoResponse, isStreaming, contextSize,
        responseLength, engineMode, APIList, selectedAPI, selectedModel, API } = parsedMessage;
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

        if (isPhone) { //handle initial loads for phones, hide the control panel
            $("#roleKeyInputDiv").removeClass('positionAbsolute');
            if ($("#controlPanel").hasClass('initialState')) {
                $("#controlPanel").removeClass('initialState').hide()
            }
        } else if ($("#controlPanel").hasClass('initialState')) { //handle first load for PC, shows the panel
            betterSlideToggle($("#controlPanel"), 100, 'width')
            $("#controlPanel").removeClass('initialState')
        }

        console.debug('updating UI to match server state...')
        //populate and load config inputs & checkboxes
        $(".hostControls").css('display', 'flex')
        $("#AIAutoResponse").prop('checked', isAutoResponse)
        flashElement('AIAutoResponse', 'good')
        $("#streamingCheckbox").prop('checked', isStreaming)
        flashElement('streamingCheckbox', 'good')
        $("#maxContext").find(`option[value="${contextSize}"]`).prop('selected', true)
        flashElement('maxContext', 'good')
        $("#responseLength").find(`option[value="${responseLength}"]`).prop('selected', true)
        flashElement('responseLength', 'good')

        control.populateAPISelector(APIList, selectedAPI);
        $("#apiList").find(`option[value="${selectedAPI}"]`).prop('selected', true)
        $(("#apiList")).trigger('change')

        control.populateAPIValues(API)
        flashElement('newAPIName', 'good')
        flashElement('newAPIEndpoint', 'good')
        flashElement('newAPIKey', 'good')
        flashElement('newAPIEndpointType', 'good')
        flashElement('isClaudeCheckbox', 'good')
        flashElement('apiList', 'good')

        control.disableAPIEdit()

        control.populateSelector(cardList, 'characters');
        control.populateSelector(instructList, 'instructStyle');
        control.populateSelector(samplerPresetList, 'samplerPreset');

        //send updates back to server...why? perhaps to populate liveconfig
        control.updateSelectedChar(myUUID, selectedCharacter, selectedCharacterDisplayName, 'forced');
        control.updateSelectedSamplerPreset(myUUID, selectedSamplerPreset, 'forced');
        control.updateInstructFormat(myUUID, instructFormat, 'forced');
        control.updateD1JB(myUUID, D1JB, 'forced')
        control.setEngineMode(myUUID, engineMode);

        $("#showPastChats").trigger('click')
    } else {
        //hide control panel and host controls for guests
        $("#controlPanel, .hostControls").remove()
    }

    $("#chat").empty();
    $("#AIChat").empty();
    updateUserChatUserList(userList);

    if (chatHistory) {
        const trimmedChatHistoryString = chatHistory.trim();
        const parsedChatHistory = JSON.parse(trimmedChatHistoryString);
        appendMessagesWithConverter(parsedChatHistory, "#chat");
    }

    if (AIChatHistory) {
        const trimmedAIChatHistoryString = AIChatHistory.trim();
        const parsedAIChatHistory = JSON.parse(trimmedAIChatHistoryString);
        appendMessagesWithConverter(parsedAIChatHistory, "#AIChat");
    }

    $("#chat").scrollTop($("#chat").prop("scrollHeight"));
    $("#AIChat").scrollTop($("#AIChat").prop("scrollHeight"));

    initialLoad = false;
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
        let parsedMessage = JSON.parse(message);

        //dont send spammy server messages to the console
        if (parsedMessage.type !== 'streamedAIResponse' &&
            parsedMessage.type !== 'pastChatsList' &&
            parsedMessage.type !== 'pastChatToLoad') {
            console.debug('Received server message:', message);
        }
        switch (parsedMessage?.type) {
            case 'clearChat':
                console.debug('Clearing User Chat')
                $("#chat").empty()
                break;
            case 'clearAIChat':
                console.debug('Clearing AI Chat')
                $("#AIChat").empty()
                break;
            case 'chatUpdate':
                console.debug('saw chat update instruction');
                $("#AIChat").empty();
                let resetChatHistory = parsedMessage.chatHistory;
                resetChatHistory.forEach((obj) => {
                    let username = obj.username;
                    let userColor = obj.userColor;
                    let message = converter.makeHtml(obj.content);
                    let newDiv = $(`<div></div>`);
                    newDiv.html(`<span style="color:${userColor}" class="chatUserName">${username}</span>${message}`);
                    $("#AIChat").append(newDiv);
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
                console.debug('saw notification of user name change');
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
            case 'changeCharacterDisplayName':
                let newCharDisplayName = parsedMessage.charDisplayName
                $("#charName").text(newCharDisplayName)
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
                console.debug('key accepted, refreshing page...')
                location.reload();
                break;
            case 'keyRejected':
                console.log('key rejected')
                $("#roleKeyInput").val('')
                await flashElement('roleKeyInput', 'bad')
                break;
            case 'pastChatsList':
                let chatList = parsedMessage.pastChats
                showPastChats(chatList)
                break;
            case 'APIList':
                let APIList = parsedMessage.APIList;
                control.populateAPISelector(APIList, parsedMessage.selectedAPI);
                break;
            case 'pastChatToLoad':
                console.debug('loading past chat session');
                $("#AIChat").empty();
                $("#AIChatUserList ul").empty();
                let pastChatHistory = parsedMessage.pastChatHistory;
                let sessionID = parsedMessage.sessionID
                $("#pastChatsList .activeChat").removeClass('activeChat')
                $("#pastChatsList").find(`div[data-session_id="${sessionID}"]`).addClass('activeChat')
                //TODO: this feels like a duplicate of the appendWithConverter function...merge?
                pastChatHistory.forEach((obj) => {
                    let username = obj.username;
                    let userColor = obj.userColor;
                    let message = converter.makeHtml(obj.content);
                    let newDiv = $(`<div></div>`);
                    newDiv.html(`<span style="color:${userColor}" class="chatUserName">${username}</span>${message}`);
                    $("#AIChat").append(newDiv);
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
                console.debug('autoAI toggle updated')
                break
            case 'streamingToggleUpdate':
                $("#streamingCheckbox").prop('checked', parsedMessage.value)
                console.debug('streaming toggle updated')
                break
            case 'claudeToggleUpdate':
                $("#isClaudeCheckbox").prop('checked', parsedMessage.value)
                console.debug('Claude toggle updated')
                break
            case 'contextSizeChange':
                $("#maxContext").find(`option[value="${parsedMessage.value}"]`).prop('selected', true)
                console.debug('maxContext updated')
                break
            case 'apiChange':
                $("#apiList").find(`option[value="${parsedMessage.name}"]`).prop('selected', true)
                $("#modelList").empty().attr('disabled', false)
                // Update the Name, endpoint, and key fields with the new API info
                control.populateAPIValues(parsedMessage)
                flashElement('newAPIName', 'good')
                flashElement('newAPIEndpoint', 'good')
                flashElement('newAPIKey', 'good')
                flashElement('newAPIEndpointType', 'good')
                flashElement('isClaudeCheckbox', 'good')
                flashElement('apiList', 'good')
                break
            case 'testAPIResult':
                let result = parsedMessage.value
                console.debug(result)
                if (result.status === 200) {
                    flashElement('APIEditDiv', 'good')
                } else {
                    await flashElement('APIEditDiv', 'bad', 150, 3)
                    alert(`Error: status code ${result.status}`)
                }
                break
            case 'modelListResult':
                if (parsedMessage.value === 'ERROR') {
                    flashElement('modelList', 'bad')
                    $("#modelList").attr('disabled', true)
                } else {
                    let modelList = parsedMessage.value
                    control.populateModelsList(modelList)
                }
                break
            case 'modelChange':
                let selectedModel = parsedMessage.value
                control.updateSelectedModel(selectedModel)
                break
            case 'responseLengthChange':
                $("#responseLength").find(`option[value="${parsedMessage.value}"]`).prop('selected', true)
                console.debug('responseLength updated')
                break
            case 'AIChatDelayChange':
                AIChatDelay = parsedMessage.value * 1000
                console.debug('AI Chat delay updated')
                break
            case 'userChatDelayChange':
                userChatDelay = parsedMessage.value * 1000
                console.debug('User Chat delay updated')
                break
            case 'streamedAIResponse':
                $('body').addClass('currentlyStreaming')

                currentlyStreaming = true
                let newStreamDivSpan;
                if (!$("#AIChat .incomingStreamDiv").length) {
                    newStreamDivSpan = $(`<div class="incomingStreamDiv"><span style="color:${parsedMessage.color}" class="chatUserName">${parsedMessage.username}🤖</span><p></p></div>`);
                    $("#AIChat").append(newStreamDivSpan);
                } else {
                    await displayStreamedResponse(message)
                }

                $("#AISendButton").prop('disabled', true);
                $("#deleteLastMessageButton").prop('disabled', true);
                $("#triggerAIResponse").prop('disabled', true);
                $("#AIRetry").prop('disabled', true);
                $("#characters").prop('disabled', true)
                $("#characters").prop('disabled', true)
                $("#apiList").prop('disabled', true)
                $("#toggleMode").prop('disabled', true)
                break;
            case 'streamedAIResponseEnd':
                console.debug('saw stream end')
                //const HTMLizedContent = converter.makeHtml(accumulatedContent);
                console.log(accumulatedContent)
                const newDivElement = $('<div>').html(accumulatedContent);
                const usernameSpan = $('.incomingStreamDiv').find('.chatUserName');
                if (usernameSpan.length > 0) {
                    // Remove all elements after the username span
                    const elementsToRemove = $(usernameSpan).nextAll();
                    elementsToRemove.remove();
                    $(usernameSpan).after(newDivElement.html());
                } else {
                    // If there is no existing username span, replace .incomingStreamDiv with new content
                    $('.incomingStreamDiv').replaceWith(newDivElement);
                }
                accumulatedContent = ''
                $('.incomingStreamDiv').removeClass('incomingStreamDiv')
                currentlyStreaming = false
                $('body').removeClass('currentlyStreaming')
                $("#AISendButton").prop('disabled', false);
                $("#deleteLastMessageButton").prop('disabled', false);
                $("#triggerAIResponse").prop('disabled', false);
                $("#AIRetry").prop('disabled', false);
                $("#characters").prop('disabled', false)
                $("#apiList").prop('disabled', false)
                $("#toggleMode").prop('disabled', false)
                updateAIChatUserList(parsedMessage.AIChatUserList)
                break;
            case 'AIResponse':
            case 'trimmedStreamMessage':
            case 'chatMessage':
                let isAIResponse = false
                console.debug('saw chat message')
                if (parsedMessage.type === 'trimmedStreamMessage') {
                    console.log('saw trimmed stream, removing last div')
                    $("#AIChat div").last().remove()
                }

                if (parsedMessage.type === 'AIResponse' || parsedMessage.type === 'trimmedStreamMessage') {
                    isAIResponse = true
                }
                var { chatID, username, content, userColor, color, workerName, hordeModel, kudosCost, AIChatUserList } = JSON.parse(message);
                console.debug(`saw chat message: [${chatID}]${username}:${content}`)
                const HTMLizedMessage = converter.makeHtml(content);
                const sanitizedMessage = DOMPurify.sanitize(HTMLizedMessage);
                let newChatItem = $('<div>');
                let usernameToShow = isAIResponse ? `${username} 🤖` : username
                newChatItem.html(`<span style="color:${userColor ? userColor : color}" class="chatUserName">${usernameToShow}</span> ${sanitizedMessage}`)
                if (workerName !== undefined && hordeModel !== undefined && kudosCost !== undefined) {
                    $(newChatItem).prop('title', `${workerName} - ${hordeModel} (Kudos: ${kudosCost})`);
                }
                console.debug('appending new message to chat')
                $(`div[data-chat-id="${chatID}"]`).append(newChatItem).scrollTop($(`div[data-chat-id="${chatID}"]`).prop("scrollHeight"));
                if (chatID === 'AIChat') {
                    $("#showPastChats").trigger('click') //autoupdate the past chat list with each AI chat message
                }
                if (chatID === 'AIChat') {
                    //console.debug(AIChatUserList)
                }
                isAIResponse = false
                break;
            default:
                console.log(`UNKNOWN MESSAGE TYPE ${parsedMessage.type}: IGNORING`)
                break
        }
    });
}

let accumulatedContent = ''; // variable to store accumulated content
async function displayStreamedResponse(message) {
    var { chatID, username, content, userColor, AIChatUserList } = JSON.parse(message);
    let newStreamDivSpan;
    //if (!$("#AIChat .incomingStreamDiv").length) {
    //  newStreamDivSpan = $(`<div class="incomingStreamDiv"><span style="color:${userColor}" class="chatUserName">${username}</span><p></p></div>`);
    //  $("#AIChat").append(newStreamDivSpan);
    //} else {
    newStreamDivSpan = $("#AIChat .incomingStreamDiv p");
    // }

    // Create a temporary span element with raw text
    const sanitizedToken = DOMPurify.sanitize(content);
    accumulatedContent += sanitizedToken;
    const spanElement = $('<span>').html(sanitizedToken);
    // Find and preserve existing username span within .incomingStreamDiv
    const existingUsernameSpan = newStreamDivSpan.find('.chatUserName');

    newStreamDivSpan.append(spanElement);

    // Scroll to the bottom of the div to view incoming tokens
    //not sure this is working
    $("#AIChat").scrollTop($("#AIChat")[0].scrollHeight);
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
                resolve()
            }
        });
    })
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
                e.preventDefault();
                const sessionID = $parent.data('session_id');
                console.debug(`Loading Chat ${sessionID}`);
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
        console.debug(`requesting to load chat from session ${sessionID}...`);
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
        chatID: 'AIChat',
        UUID: myUUID,
        username: username,
        char: char
    }
    messageServer(retryMessage)
}

async function sendMessageToAIChat(type) {

    if (currentlyStreaming) { return }

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
    console.debug('document is ready')
    let { username, AIChatUsername } = await startupUsernames();
    $("#usernameInput").val(username)
    flashElement('usernameInput', 'good')
    $("#AIUsernameInput").val(AIChatUsername)
    flashElement('AIUsernameInput', 'good')

    connectWebSocket(username);

    isPhone = /Mobile/.test(navigator.userAgent);
    console.debug(`Is this a phone? ${isPhone}`)

    $("#reconnectButton").off('click').on('click', function () {
        connectWebSocket()
    })
    $("#disconnectButton").off('click').on('click', function () {
        disconnectWebSocket()
    })

    $("#submitkey").off('click').on('click', function () {
        if (isPhone) {
            betterSlideToggle($("#profileManagementMenu"), 250, 'width')
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

    $("#streamingCheckbox").on('input', function () {
        isStreaming = $(this).prop('checked')
        console.debug(`Streaming = ${isStreaming}`)
        const streamingStateMessage = {
            type: 'toggleStreaming',
            UUID: myUUID,
            value: isStreaming
        }
        messageServer(streamingStateMessage);
        flashElement('streamingCheckbox', 'good')
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

    $("#AIRetry").off('click').on('click', function () { doAIRetry() })

    $("#characters").on('change', function () {
        let displayName = $("#characters").find('option:selected').text()
        control.updateSelectedChar(myUUID, $(this).val(), displayName)
    })

    $("#samplerPreset").on('change', function () { control.updateSelectedSamplerPreset(myUUID, $(this).val()) })
    $("#instructStyle").on('change', function () { control.updateInstructFormat(myUUID, $(this).val()) })
    $("#finalInstruction").on('blur', function () { control.updateD1JB(myUUID, $(this).val()) })

    //A clickable icon that toggles between Text Completions and horde mode, swaps the API parameters, and updates the UI and server to reflect the change.
    $("#toggleMode").off('click').on('click', function () {
        let newMode = $("#toggleMode").hasClass('hordeMode') ? 'TC' : 'horde';
        let modeChangeMessage = {
            type: 'modeChange',
            UUID: myUUID,
            newMode: newMode
        }
        if (newMode === 'horde') {
            $("#TCCCAPIBlock").hide()
            $("#streamingChekboxBlock").hide()
        } else {
            $("#TCCCAPIBlock").show()
            $("#streamingChekboxBlock").show()
        }
        messageServer(modeChangeMessage);
    })

    $("#usernameInput").on('blur', function () {
        console.debug('saw username input blur')
        let oldUsername = localStorage.getItem('username');
        let currentUsername = $("#usernameInput").val()
        if (oldUsername !== currentUsername) {
            console.debug('notifying server of UserChat username change...')
            control.updateUserName(myUUID, currentUsername)
        }
    })

    $("#AIUsernameInput").on('blur', function () { control.updateAIChatUserName() })

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
        console.debug('Requesting OOC Chat clear')
        const clearMessage = {
            type: 'clearChat',
            UUID: myUUID,
        };
        messageServer(clearMessage);
    })

    $("#clearAIChat").off('click').on('click', function () {
        console.debug('Requesting AI Chat clear')
        const clearMessage = {
            type: 'clearAIChat',
            UUID: myUUID
        };
        messageServer(clearMessage);
    })

    $("#deleteLastMessageButton").off('click').on('click', function () {
        console.debug('deleting last AI Chat message')
        const delLastMessage = {
            type: 'deleteLast',
            UUID: myUUID,
        }
        messageServer(delLastMessage);
    })

    $("#profileManagementButton").on('click', function () { betterSlideToggle($("#profileManagementMenu"), 250, 'width') })

    $('#clearLocalStorage').on('click', function () {
        betterSlideToggle($("#profileManagementMenu"), 250, 'width')
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

    $("#messageInput").on("keypress", function (event) { enterToSendChat(event, "#sendButton"); });
    $("#AIMessageInput").on("keypress", function (event) { enterToSendChat(event, "#AISendButton"); });

    $("#showPastChats").on('click', function () {
        console.debug('requesting past chat list')
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
                betterSlideToggle($("#profileManagementMenu"), 250, 'width');
            }
            if ($("#roleKeyInputDiv").hasClass('needsReset')) {
                $("#roleKeyInputDiv").fadeToggle().removeClass('needsReset')
            }

        }
    });
    const $controlPanel = $("#controlPanel");
    const $LLMChatWrapper = $('#LLMChatWrapper');
    const $OOCChatWrapper = $('#OOCChatWrapper');
    const $AIChatInputButtons = $("#AIChatInputButtons");
    const $UserChatInputButtons = $("#UserChatInputButtons");

    $('#controlPanelToggle').on('click', async function () { await betterSlideToggle($controlPanel, 100, 'width') });

    var chatsToggleState = 0;
    $("#chatsToggle").off('click').on('click', function () {
        chatsToggleState = (chatsToggleState + 1) % 3; // Increment the state and wrap around to 0 after the third state
        if (chatsToggleState === 0) {
            $LLMChatWrapper.removeClass('transition500').css({ flex: '1', opacity: '1' });
            $OOCChatWrapper.removeClass('transition500').css({ flex: '1', opacity: '1' });
        } else if (chatsToggleState === 1) {
            $OOCChatWrapper.css({ flex: '0', opacity: '0' });
        } else if (chatsToggleState === 2) {
            $OOCChatWrapper.addClass('transition500').css({ flex: '1', opacity: '1' });
            $LLMChatWrapper.addClass('transition500').css({ flex: '0', opacity: '0' });
        }
    });



    $("#userListsToggle").off('click').on('click', function () {
        betterSlideToggle($("#AIChatUserList"), 250, 'width')
        betterSlideToggle($("#userList"), 250, 'width')
    })

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

    $("#apiList").on('change', function () {
        if ($(this).val() === 'Default') { return }

        console.debug('[#apilist] changed')
        if ($(this).val() === 'addNewAPI') {
            console.debug('[#apilist]...to "addNewApi"')
            //clear all inputs for API editing
            $("#addNewAPI input").val('')
            control.enableAPIEdit()
            //hide API config, show API edit panel.
            betterSlideToggle($("#AIConfigInputs"), 250, 'height')
            betterSlideToggle($("#addNewAPI"), 250, 'height')
            return
        } else {
            console.debug(`[#apilist]...to "${$(this).val()}"`)
            if ($("#addNewAPI").css('display') !== 'none') {
                betterSlideToggle($("#addNewAPI"), 250, 'height')
                control.hideAddNewAPIDiv()
            }
            if ($("#AIConfigInputs").css('display') === 'none') {
                betterSlideToggle($("#AIConfigInputs"), 250, 'height')
            }

        }
        const APIChangeMessage = {
            type: 'APIChange',
            UUID: myUUID,
            newAPI: $(this).val()
        }
        messageServer(APIChangeMessage);
        flashElement('apiList', 'good')
    })

    //disabled this for now, assuming adding a new API will be done through the selector option.
    /*     $("#addNewAPIButton").on('click', function () {
            addNewAPI()
        }) */

    $("#editAPIButton").on('click', function () {
        control.enableAPIEdit()
        betterSlideToggle($("#AIConfigInputs"), 250, 'height')
        betterSlideToggle($("#addNewAPI"), 250, 'height')
    })

    $("#saveAPIButton").on('click', async function () {
        await addNewAPI()
        betterSlideToggle($("#AIConfigInputs"), 250, 'height')
    })
    $("#testAPIButton").on('click', function () { testNewAPI() })

    $("#canceAPIEditButton").on('click', function () {
        betterSlideToggle($("#AIConfigInputs"), 250, 'height')
        betterSlideToggle($("#addNewAPI"), 250, 'height')
        //select the second option if we cancel out of making a new API
        //this is not ideal and shuld really select whatever was selected previous before 'add new api' was selected.
        if ($("#apiList").val() === 'addNewAPI') {
            $("#apiList option:eq(1)").prop("selected", 'width');
        }
    })

    $("#modelLoadButton").on('click', async function () {
        await getModelList()
    })

    $("#modelList").on('input', function () {
        let selectedModel = $(this).find(`option:selected`).val()
        const modelSelectMessage = {
            type: 'modelSelect',
            UUID: myUUID,
            value: selectedModel
        }
        messageServer(modelSelectMessage);
        flashElement('responseLength', 'good')
    })

    $("#pastChatsToggle").on('click', function () {
        let target = $("#pastChatsWrap")
        if (target.hasClass('isAnimating')) { return }
        console.debug('toggling past Chats view...')
        $(this).children('i').toggleClass('fa-toggle-on fa-toggle-off')
        betterSlideToggle(target, 100, 'height')
    })

    $("#crowdControlToggle").on('click', function () {
        let target = $("#crowdControlWrap")
        if (target.hasClass('isAnimating')) { return }
        console.debug('toggling Crowd Control view...')
        $(this).children('i').toggleClass('fa-toggle-on fa-toggle-off')
        betterSlideToggle(target, 100, 'height')
    })


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

    $(window).on('resize', async function () {
        correctSizeBody()
    })
    correctSizeBody()
    correctSizeChats()


})



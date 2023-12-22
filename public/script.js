var username, storedUsername, AIChatUsername, storedAIChatUsername, isAutoResponse

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function startupUsernames() {
    storedUsername = localStorage.getItem('username');
    storedAIChatUsername = localStorage.getItem('AIChatUsername');

    username = storedUsername !== null && storedUsername !== '' ? storedUsername : await initializeUsername();
    AIChatUsername = storedAIChatUsername !== null && storedAIChatUsername !== '' ? storedAIChatUsername : username;
    console.debug(`[localStorage] username:${username}, AIChatUsername:${AIChatUsername}`)
}

async function initializeUsername() {
    var userInput = prompt("Enter your username:");
    if (userInput !== null && userInput !== "") {
        localStorage.setItem('username', userInput);
        console.log(`set localStorage 'username' to ${userInput}`)
        return String(userInput)
    } else {
        initializeUsername()
    }
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
var myUUID

var socket = null
var isHost

//API_PARAMS_FOR_TABBY
var TabbyAPICallParams = {
    "prompt": "",
    "stream": false,
    "truncation_length": 4096,
    "max_tokens": 200,
    "temperature": 2,
    "top_k": 0,
    "top_p": 1,
    "min_p": 0.2,
    "typical_p": 1,
    "tfs": 1,
    "repetition_penalty": 1.1,
    "repetition_penalty_range": 400,
    "seed": -1,
    "skip_special_tokens": true,
    "mirostat_mode": 0,
    "mirostat_tau": 5,
    "mirostat_eta": 0.1,
    "grammar_string": "",
    "custom_token_bans": "",
    "stop": []
}
//END_OF_TABBY_PARAMETERS

//API_PARAMS_FOR_HORDE
var HordeAPICallParams = {
    "prompt": "",
    "params": {
        "gui_settings": false,
        "sampler_order": [
            6,
            0,
            1,
            2,
            3,
            4,
            5
        ],
        "max_context_length": 2048,
        "max_length": 400,
        "rep_pen_slope": 1,
        "temperature": 1,
        "tfs": 0.95,
        "top_a": 0,
        "top_k": 100,
        "top_p": 0.9,
        "typical": 1,
        "s1": 6,
        "s2": 0,
        "s3": 1,
        "s4": 2,
        "s5": 3,
        "s6": 4,
        "s7": 5,
        "use_world_info": false,
        "singleline": false,
        "streaming": false,
        "can_abort": false,
        "n": 1,
        "frmtadsnsp": false,
        "frmtrmblln": false,
        "frmtrmspch": false,
        "frmttriminc": false,
        "stop_sequence": [`${username}:`]
    },
    "trusted_workers": true,
    "models": [
        "koboldcpp/mistral-pygmalion-7b.Q5_K_M",
        "koboldcpp/Toppy-M-7B",
        "koboldcpp/LLaMA2-13B-Tiefighter",
        "aphrodite/jebcarter/psyonic-cetacean-20B",
        "aphrodite/DiscoResearch/DiscoLM-120b",
        "aphrodite/KoboldAI/LLaMA2-13B-Psyfighter2",
        "aphrodite/Undi95/Toppy-M-7B",
        "koboldcpp/Noromaid-7b-v0.1.1",
        "koboldcpp/Mistral-7B-claude-chat",
        "aphrodite/alpindale/goliath-120b",
        "koboldcpp/Mistral-7B-claude-chat",
        "aphrodite/KoboldAI/LLaMA2-13B-Tiefighter",
        "aphrodite/KoboldAI/LLaMA2-13B-TiefighterLR",
        "aphrodite/Undi95/MLewd-ReMM-L2-Chat-20B-Inverted",
        "aphrodite/Undi95/Xwin-MLewd-13B-V0.2",
        "aphrodite/NeverSleep/Echidna-13b-v0.1",
        "aphrodite/PygmalionAI/mythalion-13b",
        "aphrodite/NeverSleep/Echidna-13b-v0.3",
        "PygmalionAI/pygmalion-2-7b",
        "RossAscends/Mistral7B_Dolphin2.1_LIMARP0.5_4bpw_exl2",
        "aphrodite/Undi95/Emerhyst-20B"
    ],
    "disuedmodels": [
    ]
}
//END_OF_HORDE_PAREMETERS

//default to TabbyAPI
var APICallParams = TabbyAPICallParams;

function messageServer(message) {
    socket.send(JSON.stringify(message))
}

function updateUIUserList(userList) {
    console.debug(userList)
    if (userList.length === 0) {
        console.log('saw empty userList, will wait for another..')
        return
    }
    console.log('populating user list...')
    const userListElement = $('#userList ul');
    userListElement.empty() // Clear the existing user list
    userList.forEach(username => {
        const listItem = `<li data-foruser="${username}" title="${username}">${username}</li>`;
        userListElement.append(listItem);
    });
}

async function requestUserList() {
    const userListRequestMessage = {
        type: 'userListRequest',
        UUID: myUUID
    }
    messageServer(userListRequestMessage)
}

function updateSelectedChar(char, displayName, type) {
    console.debug(char, displayName)
    $("#charName").text(displayName)
    if (type === 'forced') { //if server ordered it
        console.debug('changing Char from server command')
        $("#characters").find(`option[value="${char}"]`).prop('selected', true)
    } else { //if user did it
        //let newChar = String($("#characters").val())
        console.debug('I manually changed char, and updating to server')
        let newCharDisplayName = $("#characters").find(`option[value="${char}"]`).text()
        let changeCharacterRequest = {
            type: 'changeCharacterRequest',
            UUID: myUUID,
            newChar: char,
            newCharDisplayName: newCharDisplayName
        }
        messageServer(changeCharacterRequest);
    }
}

function updateSelectedSamplerPreset(preset, type) {
    console.debug(preset)
    if (type === 'forced') {
        console.debug('changing preset from server command')
        $("#samplerPreset").find(`option[value="${preset}"]`).prop('selected', true)
    } else {
        console.debug('I manually changed char, and updating to server')
        let changeSamplerPresetMessage = {
            type: 'changeSamplerPreset',
            UUID: myUUID,
            newPreset: preset
        }
        messageServer(changeSamplerPresetMessage);
    }
}

function updateInstructFormat(format, type) {
    console.debug(format)
    if (type === 'forced') {
        console.debug('changing Instruct format from server command')
        $("#instructStyle").find(`option[value="${format}"]`).prop('selected', true)
    } else {
        console.debug('I manually changed Instruct format, and updating to server')
        let changeInstructFormatMessage = {
            type: 'changeInstructFormat',
            UUID: myUUID,
            newInstructFormat: format
        }
        messageServer(changeInstructFormatMessage);
    }
}

function updateD1JB(jb, type) {
    console.debug(jb, type)
    if (type === 'forced') {
        console.debug('changing D1JB from server command')
        $("#finalInstruction").val(jb)
    } else {
        console.debug('I manually changed D1JB, and updating to server')
        let changeD1JBMessage = {
            type: 'changeD1JB',
            UUID: myUUID,
            newD1JB: jb
        }
        messageServer(changeD1JBMessage);
    }
}

async function processConfirmedConnection(parsedMessage) {
    console.log('--- processing confirmed connection...');
    const { clientUUID, role, D1JB, instructList, instructFormat, selectedCharacter, selectedCharacterDisplayName, selectedSamplerPreset, chatHistory, AIChatHistory, cardList, samplerPresetList, userList, isAutoResponse, contextSize, responseLength, engineMode } = parsedMessage;
    myUUID = clientUUID
    isHost = role === 'host' ? true : false
    console.debug(`my UUID is: ${myUUID}`)
    var userRole = isHost ? 'Host' : 'Guest';
    $("#userRole").text(userRole)
    $("#charName").text(selectedCharacterDisplayName)
    if (isHost) {
        $("#controlPanel").show()
        await delay(100)
        $("#AIAutoResponse").prop('checked', isAutoResponse)
        await delay(100)
        $("#maxContext").find(`option[value="${contextSize}"]`).prop('selected', true)
        await delay(100)
        $("#responseLength").find(`option[value="${responseLength}"]`).prop('selected', true)
        populateCardSelector(cardList);
        populateInstructSelector(instructList);
        populateSamplerSelector(samplerPresetList);
        updateSelectedChar(selectedCharacter, selectedCharacterDisplayName, 'forced');
        updateSelectedSamplerPreset(selectedSamplerPreset, 'forced');
        updateInstructFormat(instructFormat, 'forced');
        updateD1JB(D1JB, 'forced')
        setEngineMode(engineMode);
    } else {
        $("#controlPanel").remove()
    }

    $("#chat").empty();
    $("#AIchat").empty();
    updateUIUserList(userList);

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
    const connectionMessage = {
        type: 'connect',
        UUID: myUUID,
        username: username
    };
    console.log('sending connection message..')
    messageServer(connectionMessage);
}

function appendMessagesWithConverter(messages, elementSelector) {
    messages.forEach((obj) => {
        const { username, userColor, content } = obj;
        const message = converter.makeHtml(content);
        const newDiv = $("<div></div>");
        newDiv.html(`<span style="color:${userColor}">${username}</span>:${message}`).append('<hr>');
        $(elementSelector).append(newDiv);
    });
}

function connectWebSocket() {
    console.log(`trying to connect to ${serverUrl}`)
    socket = new WebSocket(serverUrl);
    console.log('socket connected!')
    socket.onopen = handleSocketOpening;
    socket.onclose = disconnectWebSocket;
    // Handle incoming messages from the server
    socket.addEventListener('message', async function (event) {
        var message = event.data;
        console.debug('Received server message:', message);
        let parsedMessage = JSON.parse(message);
        const userList = parsedMessage.userList;

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
                    newDiv.html(`<span style="color:${userColor}">${username}</span>:${message}`).append('<hr>');
                    $("#AIchat").append(newDiv);
                });
                break;
            case 'modeChange':
                setEngineMode(parsedMessage.engineMode);
                break;
            case 'userList':
            case 'userConnect':
            case 'userDisconnect':
                updateUIUserList(userList);
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
                newUsernameChatItem.append('<hr>');
                $("#chat").append(newUsernameChatItem).scrollTop($(`div[data-chat-id="${chatID}"]`).prop("scrollHeight"));
                break;
            case 'changeCharacter':
                let currentChar = $("#characters").val()
                let newChar = parsedMessage.char
                if (currentChar !== newChar) {
                    updateSelectedChar(newChar, parsedMessage.charDisplayName, 'forced');
                }
                break;
            case 'changeSamplerPreset':
                let currentPreset = $("#samplerPreset").val()
                let newPreset = parsedMessage.newPreset
                if (currentPreset !== newPreset) {
                    updateSelectedSamplerPreset(newPreset, 'forced');
                }
                break;
            case 'changeInstructFormat':
                let currentFormat = $("#instructStyle").val()
                let newFormat = parsedMessage.newInstructFormat
                if (currentFormat !== newFormat) {
                    updateInstructFormat(newFormat, 'forced');
                }
                break;
            case 'changeD1JB':
                let currentJB = $("#finalInstruction").val()
                let newJB = parsedMessage.newD1JB
                if (currentJB !== newJB) {
                    updateD1JB(newJB, 'forced');
                }
                break;
            default:
                console.log('saw chat message')
                var { chatID, username, content, userColor, workerName, hordeModel, kudosCost } = JSON.parse(message);
                console.log(`saw chat message: [${chatID}]${username}:${content}`)
                const HTMLizedMessage = converter.makeHtml(content);
                const sanitizedMessage = DOMPurify.sanitize(HTMLizedMessage);
                let newChatItem = $('<div>');
                newChatItem.html(`<span style="color:${userColor};">${username}</span>: ${sanitizedMessage}`).append('<hr>');
                if (workerName !== undefined && hordeModel !== undefined && kudosCost !== undefined) {
                    $(newChatItem).prop('title', `${workerName} - ${hordeModel} (Kudos: ${kudosCost})`);
                }
                console.log('appending new mesage to chat')
                $(`div[data-chat-id="${chatID}"]`).append(newChatItem).scrollTop($(`div[data-chat-id="${chatID}"]`).prop("scrollHeight"));
                break;
        }
    });
}

function handleSocketOpening() {
    console.log("WebSocket opened to server:", serverUrl);
    $("#reconnectButton").hide()
    $("#disconnectButton").show()
    const username = $("#usernameInput").val()
    console.debug(`connected as ${username}`)
    $("#messageInput").prop("disabled", false).prop('placeholder', 'Type a message').removeClass('disconnected')
    $("#AIMessageInput").prop("disabled", false).prop('placeholder', 'Type a message').removeClass('disconnected')
};

function disconnectWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("WebSocket disconnected from server:", serverUrl);
        $("#reconnectButton").show()
        $("#disconnectButton").hide()
        $("#userList ul").empty()
        $("#messageInput").prop("disabled", true).prop('placeholder', 'DISCONNECTED').addClass('disconnected');
        $("#AIMessageInput").prop("disabled", true).prop('placeholder', 'DISCONNECTED').addClass('disconnected');
        const disconnectMessage = {
            type: 'disconnect',
            UUID: myUUID,
            username: username
        };
        messageServer(disconnectMessage);
        socket.close();
    }
}

function updateUserName() {
    let nameChangeMessage = {
        type: 'usernameChange',
        UUID: myUUID,
        newName: $("#usernameInput").val(),
        oldName: username
    }
    username = $("#usernameInput").val()
    localStorage.setItem('username', username)
    console.log(`Set localstorage "username" key to ${username}`)
    messageServer(nameChangeMessage)
}

function doAIRetry() {
    let char = $('#characters').val();
    let retryMessage = {
        type: 'AIRetry',
        UUID: myUUID,
        chatID: 'AIChat',
        username: username,
        APICallParams: APICallParams,
        char: char
    }
    messageServer(retryMessage)
}

//Just update Localstorage, no need to send anything to server for this.
//but possibly add it in the future if we want to let users track which user is speaking as which entity in AI Chat.
function updateAIChatUserName() {
    username = $("#AIUsernameInput").val()
    localStorage.setItem('AIChatUsername', username)
    console.log(`Set localstorage "AIChatUsername" key to ${username}`)
}

async function populateCardSelector(cardList) {
    console.debug(cardList)
    let cardSelectElement = $("#characters");
    cardSelectElement.empty()
    for (const card of cardList) {
        let newElem = $('<option>');
        newElem.val(card.filename);
        newElem.text(card.name);
        cardSelectElement.append(newElem);
    }
}

async function populateInstructSelector(instrustList) {
    console.debug(instrustList)
    let instructSelectElement = $("#instructStyle");
    instructSelectElement.empty()
    for (const style of instrustList) {
        let newElem = $('<option>');
        newElem.val(style.filename);
        newElem.text(style.name);
        instructSelectElement.append(newElem);
    }
}

async function populateSamplerSelector(presetList) {
    console.debug(presetList)
    let samplerSelectElement = $("#samplerPreset");
    samplerSelectElement.empty()
    for (const preset of presetList) {
        let newElem = $('<option>');
        newElem.val(preset.filename);
        newElem.text(preset.name);
        samplerSelectElement.append(newElem);
    }
}

// set the engine mode to either horde or tabby based on a value from the websocket
function setEngineMode(mode) {
    if (mode === 'horde') {
        $("#toggleMode").removeClass('tabbyMode').addClass('hordeMode').text('🧟');
        $("#toggleMode").attr('title', 'Click to switch to Tabby Mode');
        //copy the horde parameters into the APICallParams object
        APICallParams = JSON.parse(JSON.stringify(HordeAPICallParams));
        console.log('Switching to Horde Mode')
    } else {
        $("#toggleMode").removeClass('hordeMode').addClass('tabbyMode').text('🐈');
        $("#toggleMode").attr('title', 'Click to switch to Horde Mode');
        //copy the tabby parameters into the APICallParams object
        APICallParams = JSON.parse(JSON.stringify(TabbyAPICallParams));
        console.debug('Switching to Tabby Mode')
    }
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
    let charDisplayName = $('#characters option:selected').text();
    //TODO: make this function grab usernames for all entities in chat history
    //and move it inside the Prompt crafting function
    //Move it to server-side. client side has no idea on its own.

    var markdownContent = `${messageInput.val()}`;
    var htmlContent = converter.makeHtml(markdownContent);
    var char = $('#characters').val();
    var stringToSend = markdownContent
    APICallParams.prompt = stringToSend;
    var websocketRequest = {
        type: 'chatMessage',
        chatID: 'AIChat',
        UUID: myUUID,
        username: username,
        APICallParams: APICallParams,
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

    connectWebSocket();

    var isPhone = /Mobile/.test(navigator.userAgent);
    //handle disconnect and reconnect
    $("#reconnectButton").off('click').on('click', function () {
        connectWebSocket()
    })
    $("#disconnectButton").off('click').on('click', function () {
        disconnectWebSocket()
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
    })
    $("#maxContext").on('input', function () {
        contextSize = $(this).find(`option:selected`).val()
        const adjustCtxMes = {
            type: 'adjustContextSize',
            UUID: myUUID,
            value: contextSize
        }
        messageServer(adjustCtxMes);
    })
    $("#responseLength").on('input', function () {
        responseLength = $(this).find(`option:selected`).val()
        const adjustResponseLength = {
            type: 'adjustResponseLength',
            UUID: myUUID,
            value: responseLength
        }
        messageServer(adjustResponseLength);
    })

    // Send a message to the user chat
    $("#sendButton").off('click').on("click", function () {
        if ($("#usernameInput").val().trim() === '') {
            alert("Can't send chat message with no username!");
            return;
        }
        var messageInput = $("#messageInput");
        if (messageInput.val().trim() === '') {
            alert("Can't send empty message!");
            return;
        }
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
        updateSelectedChar($(this).val(), displayName)
    })

    $("#samplerPreset").on('change', function () {
        updateSelectedSamplerPreset($(this).val())
    })

    $("#instructStyle").on('change', function () {
        updateInstructFormat($(this).val())
    })

    $("#finalInstruction").on('blur', function () {
        updateD1JB($(this).val())
    })

    //A clickable icon that toggles between tabby and horde mode, swaps the API parameters, and updates the UI and server to reflect the change.
    $("#toggleMode").off('click').on('click', function () {
        let newMode = $("#toggleMode").hasClass('hordeMode') ? 'tabby' : 'horde';
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
            updateUserName()
        }
    })

    $("#AIUsernameInput").on('blur', function () {
        //$("#usernameInput").trigger('change')
        updateAIChatUserName()
    })

    $("#AISendButton").off('click').on('click', function () {
        sendMessageToAIChat()
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

    await startupUsernames()
    $("#usernameInput").val(username)
    $("#AIUsernameInput").val(AIChatUsername)

    $('#clearLocalStorage').on('click', function () {
        $("#usernameInput").val('')
        $("#AIUsernameInput").val('')
        localStorage.clear();
        alert('Deleted saved usernames!');
    });

    if (window.matchMedia("(orientation: landscape)").matches && /Mobile/.test(navigator.userAgent)) {
        if (isIOS) {
            $('body').css({
                'padding-left': '15px',
                'padding-right': '0px',
                'width': '100sfw',
                'height': 'calc(100svh - 36px)'
            })
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
            $("#sendButton").click();
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
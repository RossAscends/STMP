var username, storedUsername, AIChatUsername, storedAIChatUsername

async function startupUsernames() {
    storedUsername = localStorage.getItem('username');
    storedAIChatUsername = localStorage.getItem('AIChatUsername');

    username = storedUsername !== null && storedUsername !== '' ? storedUsername : await initializeUsername();
    AIChatUsername = storedAIChatUsername !== null && storedAIChatUsername !== '' ? storedAIChatUsername : username;
    console.log(`[localStorage] username:${username}, AIChatUsername:${AIChatUsername}`)
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

var socket
var userRole = (hostname === 'localhost' || hostname === '127.0.0.1') ? 'Host' : 'Guest';
var isHost = (userRole === 'Host') ? true : false;

function clearChatDiv() {
    $("#chat").empty()
}

function updateUserList(username) {
    let nameAlreadyExists = $("#userList ul").find(`li[data-foruser="${username}"]`);
    if (nameAlreadyExists.length !== 0) {
        nameAlreadyExists.remove();
    } else {
        $("#userList ul").append(`<li data-foruser="${username}">${username}</li>`)
    }
}

function updateUIUserList(userList) {
    //console.log(userList)
    //console.log('starting initial userlist population')
    const userListElement = $('#userList ul');
    userListElement.empty() // Clear the existing user list
    userList.forEach(username => {
        const listItem = `<li>${username}</li>`;
        userListElement.append(listItem);
    });
}

function updateSelectedChar(char, type) {
    if (type === 'forced') {
        $("#characters").find(`option[value="${char}"]`).prop('selected', true).trigger('change')
    }
}

function connectWebSocket() {
    socket = new WebSocket(serverUrl);

    socket.onopen = function (event) {
        console.log("WebSocket connected to server:", serverUrl);
        $("#reconnectButton").hide()
        $("#disconnectButton").show()
        $("#messageInput").prop("disabled", false).prop('placeholder', 'Type a message').removeClass('disconnected')
        $("#AIMessageInput").prop("disabled", false).prop('placeholder', 'Type a message').removeClass('disconnected')
        const connectionMessage = {
            type: 'connect',
            username: username
        };
        socket.send(JSON.stringify(connectionMessage));
        queryCardList()
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
                username: username
            };
            socket.send(JSON.stringify(disconnectMessage));
            socket.close();
        }
    }

    function updateUserName() {
        let nameChangeMessage = {
            type: 'usernameChange',
            newName: $("#usernameInput").val(),
            oldName: username
        }
        username = $("#usernameInput").val()
        localStorage.setItem('username', username)
        console.log(`Set localstorage "username" key to ${username}`)
        socket.send(JSON.stringify(nameChangeMessage))
    }

    //Just update Localstorage, no need to send anything to server for this.
    //but possibly add it in the future if we want to let users track which user is speaking as which entity in AI Chat.
    function updateAIChatUserName() {
        username = $("#AIUsernameInput").val()
        localStorage.setItem('AIChatUsername', username)
        console.log(`Set localstorage "AIChatUsername" key to ${username}`)
    }

    socket.onclose = function (event) {
        disconnectWebSocket()
    };

    //handle disconnect and reconnect
    $("#reconnectButton").off('click').on('click', function () {
        connectWebSocket()
    })
    $("#disconnectButton").off('click').on('click', function () {
        disconnectWebSocket()
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
        var markdownContent = `${username}: ${messageInput.val()}`;
        var htmlContent = converter.makeHtml(markdownContent);
        var messageObj = {
            chatID: "UserChat",
            username: username,
            content: htmlContent
        };
        messageObj = JSON.stringify(messageObj)
        localStorage.setItem('username', username);
        socket.send(messageObj);
        messageInput.val('');
        messageInput.focus();
    });


    $("#characters").on('change', function () {
        if (!isHost) {
            return
        }
        else {
            let newChar = String($("#characters").val())
            let changeCharacterMessage = {
                type: 'changeCharacter',
                newChar: newChar
            }
            socket.send(JSON.stringify(changeCharacterMessage));
        }
    })

    $("#usernameInput").on('blur', function () {
        //$("#usernameInput").trigger('change')
        updateUserName()
    })

    $("#AIUsernameInput").on('blur', function () {
        //$("#usernameInput").trigger('change')
        updateAIChatUserName()
    })

    $("#AISendButton").off('click').on('click', function () {
        //hordeAPICallParams.params.stop_sequence = stoppingStrings;

        if ($("#AIUsernameInput").val().trim() === '') {
            alert("Can't send chat message with no username!");
            return;
        }

        var messageInput = $("#AIMessageInput");
        if (messageInput.val().trim() === '') {
            alert("Can't send empty message!");
            return;
        }
        username = $("#AIUsernameInput").val()
        console.log(username)
        let charDisplayName = $('#characters option:selected').text();
        //API_PARAMS_FOR_TABBY
        //uncomment the code below to send Tabby-compliant API parameters
        var APICallParams = {
            "prompt": "",
            "max_new_tokens": 200,
            "do_sample": true,
            "temperature": 2,
            "top_p": 1,
            "typical_p": 1,
            "min_p": 0.2,
            "repetition_penalty": 1,
            "repetition_penalty_range": 0,
            "encoder_repetition_penalty": 1,
            "top_k": 0,
            "min_length": 0,
            "no_repeat_ngram_size": 0,
            "num_beams": 1,
            "penalty_alpha": 0,
            "length_penalty": 1,
            "early_stopping": false,
            "guidance_scale": 1,
            "negative_prompt": "",
            "seed": -1,
            "add_bos_token": true,
            "stop": [`${username}:`,
            `\n${username}:`,
            ` ${username}:`,
            `\n ${username}:`,
            `${charDisplayName}:`,
            `\n${charDisplayName}:`,
            ` ${charDisplayName}:`,
            `\n ${charDisplayName}:`],
            "truncation_length": 4096,
            "ban_eos_token": false,
            "skip_special_tokens": true,
            "top_a": 0,
            "tfs": 1,
            "epsilon_cutoff": 0,
            "eta_cutoff": 0,
            "mirostat_mode": 0,
            "mirostat_tau": 5,
            "mirostat_eta": 0.1,
            "grammar_string": "",
            "custom_token_bans": "",
            "stream": false
        }
        //END_OF_TABBY_PARAMETERS

        //API_PARAMS_FOR_HORDE
        //uncomment the code below to enable API for Horde
        /* var APICallParams = {
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
        } */
        //END_OF_HORDE_PAREMETERS

        var markdownContent = `${username}: ${messageInput.val()}`;
        var htmlContent = converter.makeHtml(markdownContent);
        var char = $('#characters').val();
        console.log(char)
        var stringToSend = markdownContent
        APICallParams.prompt = stringToSend;
        var websocketRequest = {
            chatID: 'AIChat',
            username: username,
            content: APICallParams,
            rawContent: htmlContent,
            char: char
        }
        localStorage.setItem('AIChatUsername', username);
        socket.send(JSON.stringify(websocketRequest));
        messageInput.val('');
        messageInput.trigger('focus');
    })

    $("#clearUserChat").off('click').on('click', function () {
        console.log('Clearing OOC Chat')
        const clearMessage = {
            type: 'clearChat'
        };
        socket.send(JSON.stringify(clearMessage));

    })

    // Handle incoming messages from the server
    socket.addEventListener('message', function (event) {
        var message = event.data;
        //console.log('Received message:', message);
        let parsedMessage = JSON.parse(message)
        const userList = parsedMessage.userList;
        //console.log(userList)
        if (parsedMessage?.type === 'clearChat') {
            clearChatDiv();
        }
        else if (parsedMessage.type === 'cardList') {
            let JSONCardData = parsedMessage.cards
            populateCardSelector(JSONCardData)
        }
        else if (parsedMessage.type === 'userList') {
            updateUIUserList(userList);
        }
        else if (parsedMessage?.type === 'userConnect') {
            updateUIUserList(userList);
        }
        else if (parsedMessage?.type === 'userDisconnect') {
            updateUIUserList(userList);
        }
        else if (parsedMessage?.type === 'forceDisconnect') {
            disconnectWebSocket()
        }
        else if (parsedMessage?.type === 'connectionConfirmed') {
            const chatHistoryString = parsedMessage.chatHistory
            //trim whitespace to make it parseable
            const trimmedChatHistoryString = chatHistoryString.trim();
            //parse teh trimmed string into JSON
            const chatHistory = JSON.parse(trimmedChatHistoryString);
            $("#chat").empty()
            //add each message object as div into the chat display
            chatHistory.forEach((obj) => {
                let message = obj.content
                let newDiv = $(`<div></div>`)
                newDiv.html(`${message}`).append('<hr>')
                $("#chat").append(newDiv)
            })
            //scroll to the bottom of chat after it's all loaded up
            $("#chat").scrollTop($("#chat").prop("scrollHeight"));
        }

        else if (parsedMessage.type === 'userChangedName') {
            console.log('saw notification of user name change')
            var { type, content } = JSON.parse(message)
            const HTMLizedMessage = converter.makeHtml(content);
            const sanitizedMessage = DOMPurify.sanitize(HTMLizedMessage);
            console.log(sanitizedMessage)
            let newChatItem = $('<div>');
            newChatItem.html(`<i>${sanitizedMessage}</i>`);
            newChatItem.append('<hr>');
            $("#chat").append(newChatItem).scrollTop($(`div[data-chat-id="${chatID}"]`).prop("scrollHeight"));
        }

        else if (parsedMessage?.type === 'changeCharacter') {
            if (isHost) {
                return
            }
            updateSelectedChar(parsedMessage.newChar, 'forced')
        }
        else {
            // Parse the message into username and content
            var { chatID, username, content, workerName, hordeModel, kudosCost } = JSON.parse(message);
            // Add the message to the message list
            const HTMLizedMessage = converter.makeHtml(content);
            const sanitizedMessage = DOMPurify.sanitize(HTMLizedMessage);
            let newChatItem = $('<div>');
            newChatItem.html(sanitizedMessage);
            newChatItem.append('<hr>');
            if (workerName !== undefined && hordeModel !== undefined && kudosCost !== undefined) {
                $(newChatItem).prop('title', `${workerName} - ${hordeModel} (Kudos: ${kudosCost})`)
            }
            $(`div[data-chat-id="${chatID}"]`).append(newChatItem).scrollTop($(`div[data-chat-id="${chatID}"]`).prop("scrollHeight"));
        }
    });

    async function queryCardList() {
        let cardQueryMessage = {
            type: "cardListQuery"
        }
        socket.send(JSON.stringify(cardQueryMessage))
    }

    async function populateCardSelector(cardList) {
        //console.log(cardList)
        let cardSelectElement = $("#characters");
        cardSelectElement.empty()
        for (const card of cardList) {
            let newElem = $('<option>');
            newElem.val(card.filename);
            newElem.text(card.name);
            cardSelectElement.append(newElem);
        }
        if (!isHost) {
            $("#characters").prop('disabled', true);
        }
    }

    let isDisconnecting = false;
    window.addEventListener('beforeunload', () => {
        if (!isDisconnecting) {
            // Send a disconnect message to the server before unloading the page
            disconnectWebSocket()
            isDisconnecting = true;
        }
    });
}

$(document).ready(async function () {

    var isPhone = /Mobile/.test(navigator.userAgent);

    $("#userRole").text(userRole)
    console.log(`Host? ${isHost}`)
    if (!isHost) {
        $(".hostControls").remove()
    }

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
            $("#AISendButton").click();
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

    connectWebSocket();
});
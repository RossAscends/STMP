import util from './utils.js'
import { isUserScrollingAIChat, isUserScrollingUserChat, myUUID } from '../script.js'

function updateSelectedChar(myUUID, char, displayName, type) {
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
        util.messageServer(changeCharacterRequest);
    }
    util.flashElement('characters', 'good')
}

function updateSelectedSamplerPreset(myUUID, preset, type) {
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
        util.messageServer(changeSamplerPresetMessage);
    }
    util.flashElement('samplerPreset', 'good')
}

function updateSelectedModel(model) {
    console.debug(`[updateSelectedModel()] Changing model from server command to ${model}.`)
    $("#modelList").find(`option[value="${model}"]`).prop('selected', true).trigger('change')
    util.flashElement('modelList', 'good')
}

function updateInstructFormat(myUUID, format, type) {
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
        util.messageServer(changeInstructFormatMessage);
    }
    util.flashElement('instructStyle', 'good')
}

function updateD1JBInput(myUUID, jb, type) {
    console.debug(jb, type)
    if (type === 'forced') {
        console.debug('changing D1JB from server command')
        $("#D1JBInput").val(jb)
    } else {
        console.debug('I manually changed D1JB, and updating to server')
        let changeD1JBMessage = {
            type: 'changeD1JB',
            UUID: myUUID,
            newD1JB: jb
        }
        util.messageServer(changeD1JBMessage);
    }
    util.flashElement('D1JBInput', 'good')
}

function updateD4ANInput(myUUID, D4AN, type) {
    console.debug(D4AN, type)
    if (type === 'forced') {
        console.debug('changing D1JB from server command')
        $("#D4ANInput").val(D4AN)
    } else {
        console.debug('I manually changed D4AN, and updating to server')
        let changeD4ANMessage = {
            type: 'changeD4AN',
            UUID: myUUID,
            newD4AN: D4AN
        }
        util.messageServer(changeD4ANMessage);
    }
    util.flashElement('D4ANInput', 'good')
}

function updateSystemPromptInput(myUUID, systemPrompt, type) {
    console.debug(systemPrompt, type)
    if (type === 'forced') {
        console.debug('changing D1JB from server command')
        $("#systemPromptInput").val(systemPrompt)
    } else {
        console.debug('I manually changed system Prompt, and updating to server')
        let changeSystemPromptMessage = {
            type: 'changeSystemPrompt',
            UUID: myUUID,
            newSystemPrompt: systemPrompt
        }
        util.messageServer(changeSystemPromptMessage);
    }
    util.flashElement('systemPromptInput', 'good')
}

function updateUserName(myUUID, username) {
    let nameChangeMessage = {
        type: 'usernameChange',
        UUID: myUUID,
        newName: $("#usernameInput").val(),
        oldName: username
    }
    //let setUsername = $("#usernameInput").val()
    localStorage.setItem('username', username)
    console.debug(`Set localstorage "username" key to ${username}`)
    util.messageServer(nameChangeMessage)
    util.flashElement('usernameInput', 'good')
}

function updateAPI(myUUID, api) {
    let apiChangeMessage = {
        type: 'apiChange',
        UUID: myUUID,
        newAPI: api
    }
    util.messageServer(apiChangeMessage)
    util.flashElement('apiList', 'good')
}


//Just update Localstorage, no need to send anything to server for this.
//but possibly add it in the future if we want to let users track which user is speaking as which entity in AI Chat.
function updateAIChatUserName() {
    let oldUsername = localStorage.getItem('AIChatUsername');
    let currentUsername = $("#usernameInput").val()
    if (oldUsername !== currentUsername) {
        localStorage.setItem('AIChatUsername', currentUsername)
        console.debug(`Set localstorage "AIChatUsername" to ${currentUsername}`)
        util.flashElement('AIUsernameInput', 'good')
    }
}

function submitKey(myUUID) {
    let key = $("#roleKeyInput").val()
    let keyMessage = {
        type: 'submitKey',
        UUID: myUUID,
        key: key
    }
    util.messageServer(keyMessage)
}

async function populateSelector(list, elementId) {
    console.debug(list);
    const selectElement = $(`#${elementId}`);
    selectElement.empty();

    for (const item of list) {
        const newElem = $('<option>');
        newElem.val(item.filename);
        newElem.text(item.name);
        selectElement.append(newElem);
    }
}

async function populateModelsList(list) {
    console.debug('[populateModelList()] >> GO')
    const $selector = $('#modelList');
    $selector.empty()

    await new Promise((resolve) => {
        $.each(list, function (index, item) {
            $selector.append($('<option>', {
                value: item.id,
                text: item.id
            }));
        });
        resolve();
    });
    console.debug('selecting the second entry of #apilist..should be "Default"')
    $("#modelList option:eq(1)").prop('selected', true).trigger('input')
}

async function populateAPISelector(API, selectedAPI) {

    console.debug('[populateAPISelector()] >> GO')
    let APISelectElement = $("#apiList");
    APISelectElement.empty()
    APISelectElement.append($('<option>').val('addNewAPI').text('Add New API'));
    for (const api of API) {
        let newElem = $('<option>');
        newElem.val(api.name);
        newElem.text(api.name);
        APISelectElement.append(newElem);
    }
    if (selectedAPI) {
        console.debug(`selectedAPI = ${selectedAPI}..selecting it.`)
        $("#apiList").find(`option[value="${selectedAPI}"]`).prop('selected', true)
    }
}

function showAddNewAPIDiv() {
    //console.debug('showing div for adding new API')
    $("#addNewAPI").show()
    $("#addNewAPIButton").show()
    $("#editAPIButton").hide()
    $("#newAPIName").val('')
    $("#newAPIEndpoint").val('')
    $("#newAPIKey").val('')
    $("#newAPIEndpointType").val('TC')
    $("#newAPIEndpointType").prop('disabled', false)
    $("#newAPIName").prop('readonly', false)
    $("#newAPIEndpoint").prop('readonly', false)
    $("#newAPIKey").prop('readonly', false)
    $("#apiTitle").text('New API Info')
    $("#saveAPIButton").show()
}

function hideAddNewAPIDiv() {
    console.debug('[hideAddNewAPIDiv()] >> GO')
    $("#addNewAPIButton").hide()
    $("#editAPIButton").show()
    //$("#newAPIName").prop('readonly', true)
    //$("#newAPIEndpoint").prop('readonly', true)
    //$("#newAPIKey").prop('readonly', true)
    //$("#newAPIEndpointType").prop('disabled', true)
    $("#addNewAPI").hide()
    $("#saveAPIButton").hide()
}

function enableAPIEdit() {
    console.debug('[enableAPIEdit()] >> GO')
    $("#newAPIName").prop('readonly', false)
    $("#newAPIEndpoint").prop('readonly', false)
    $("#newAPIKey").prop('readonly', false)
    $("#newAPIEndpointType").prop('disabled', false)
    $("#saveAPIButton").show()
    //Set the title 
    $("#apiTitle").text('Edit API Info')
}

function disableAPIEdit() {
    console.debug('[disableAPIEdit()] >> GO')
    $("#newAPIName").prop('readonly', true)
    $("#newAPIEndpoint").prop('readonly', true)
    $("#newAPIKey").prop('readonly', true)
    $("#newAPIEndpointType").prop('disabled', true)
    $("#saveAPIButton").hide()
    //Set the title 
    $("#apiTitle").text('')
}

async function populateAPIValues(api) {
    console.debug(api)
    $("#newAPIName").val(api.name)
    $("#newAPIKey").val(api.key)
    $("#newAPIEndpoint").val(api.endpoint)
    $("#newAPIEndpointType").find(`option[value="${api.endpointType}"]`).prop('selected', true)
    $("#isClaudeCheckbox").prop('checked', api.claude)
    // hide the add button, only do it through the selector
    // can change this later if we need to, if a button is more intuitive.
    $("#addNewAPIButton").hide()
    $("#editAPIButton").show()
    $("#apiTitle").text('API Info')
    $("#modelLoadButton").trigger('click')
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
        await util.flashElement('newAPIName', 'bad')
        return
    }
    if (endpoint === '') {
        await util.flashElement('newAPIEndpoint', 'bad')
        return
    }

    util.messageServer({
        type: 'addNewAPI',
        name: name,
        endpoint: endpoint,
        key: key,
        endpointType: type,
        claude: claude,
        UUID: myUUID
    })
    await util.delay(250)
    //hide edit panel after save is done
    util.betterSlideToggle($("#addNewAPI"), 250, 'height')
    disableAPIEdit()

}

function testNewAPI() {
    let name = $("#newAPIName").val()
    let endpoint = $("#newAPIEndpoint").val()
    let key = $("#newAPIKey").val()
    let type = $("#newAPIEndpointType").val()
    let claude = $("#isClaudeCheckbox").prop('checked')

    util.messageServer({
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
    util.messageServer(modelListRequestMessage)
}

function showPastChats(chatList) {
    const $pastChatsList = $("#pastChatsList");
    $pastChatsList.empty();

    const chatArray = Object.values(chatList);
    chatArray.sort((a, b) => b.session_id - a.session_id); // Sort in descending order

    if (chatArray.length === 0) {
        $pastChatsList.html('<span class="flexbox Hcentered" style="margin-left: -15px;">No past chats yet!</span>');
        return;
    }

    for (let i = 0; i < chatArray.length; i++) {
        const item = chatArray[i];
        const divElement = $(`<div class="pastChatItem flexbox transition250" data-session_id="${item.session_id}">`);
        if (item.is_active) {
            divElement.addClass('activeChat');
        }
        const formattedTimestamp = util.formatSQLTimestamp(item.latestTimestamp);
        const sessionText = $(`<span>${item.aiName} (${item.messageCount})</span>`);
        const nameAndTimestampDiv = $(`<div data-session_id="${item.session_id}" class="pastChatInfo flexbox flexFlowCol flex1">`);
        const timestampText = $(`<small>${formattedTimestamp}</small>`);
        const delButton = $(`<button data-session_id="${item.session_id}" class="pastChatDelButton opacityHalf bgTransparent">🗑️</button>`);
        divElement.append(nameAndTimestampDiv).append(delButton);
        nameAndTimestampDiv.append(sessionText).append(timestampText);
        $pastChatsList.append(divElement);
    }

    $pastChatsList.off('click', '.pastChatDelButton').on('click', '.pastChatDelButton', async function (e) {
        const $parent = $(this).parent();
        $parent.animate({ opacity: 0, height: 0 }, {
            duration: 250,
            complete: async function () {
                await util.delay(250);
                $parent.hide();
                e.preventDefault();
                const sessionID = $parent.data('session_id');
                console.debug(`Loading Chat ${sessionID}`);
                const pastChatDelMessage = {
                    type: 'pastChatDelete',
                    UUID: myUUID,
                    sessionID: sessionID
                };
                util.messageServer(pastChatDelMessage);
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
        util.messageServer(pastChatListRequest);
    });
}

export default {
    populateAPISelector,
    populateSelector,
    submitKey,
    updateUserName,
    updateD1JBInput,
    updateInstructFormat,
    updateSelectedSamplerPreset,
    updateSelectedChar,
    updateAIChatUserName,
    updateAPI,
    populateAPIValues,
    showAddNewAPIDiv,
    hideAddNewAPIDiv,
    addNewAPI,
    testNewAPI,
    getModelList,
    enableAPIEdit,
    disableAPIEdit,
    populateModelsList,
    updateSelectedModel,
    updateD4ANInput,
    updateSystemPromptInput,
    showPastChats,

}
import { flashElement, messageServer } from "../script.js"

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
        messageServer(changeCharacterRequest);
    }
    flashElement('characters', 'good')
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
        messageServer(changeSamplerPresetMessage);
    }
    flashElement('samplerPreset', 'good')
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
        messageServer(changeInstructFormatMessage);
    }
    flashElement('instructStyle', 'good')
}

function updateD1JB(myUUID, jb, type) {
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
    flashElement('finalInstruction', 'good')
}

function updateUserName(myUUID, username) {
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
    flashElement('usernameInput', 'good')
}

function updateAPI(myUUID, api) {
    let apiChangeMessage = {
        type: 'apiChange',
        UUID: myUUID,
        newAPI: api
    }
    messageServer(apiChangeMessage)
    flashElement('apiList', 'good')
}


//Just update Localstorage, no need to send anything to server for this.
//but possibly add it in the future if we want to let users track which user is speaking as which entity in AI Chat.
function updateAIChatUserName() {
    username = $("#AIUsernameInput").val()
    localStorage.setItem('AIChatUsername', username)
    console.log(`Set localstorage "AIChatUsername" key to ${username}`)
    flashElement('AIUsernameInput', 'good')
}

function submitKey(myUUID) {
    let key = $("#roleKeyInput").val()
    let keyMessage = {
        type: 'submitKey',
        UUID: myUUID,
        key: key
    }
    messageServer(keyMessage)
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

async function populateAPISelector(API) {
    let APISelectElement = $("#apiList");
    APISelectElement.empty()
    APISelectElement.append($('<option>').val('addNewAPI').text('Add New API'));
    for (const api of API) {
        let newElem = $('<option>');
        newElem.val(api.name);
        newElem.text(api.name);
        APISelectElement.append(newElem);
    }
}

function showAddNewAPIDiv() {
    //console.log('showing div for adding new API')
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
    //console.log('hiding div for adding new API')
    $("#addNewAPIButton").hide()
    $("#editAPIButton").show()
    $("#newAPIName").prop('readonly', true)
    $("#newAPIEndpoint").prop('readonly', true)
    $("#newAPIKey").prop('readonly', true)
    $("#newAPIEndpointType").prop('disabled', true)
    $("#addNewAPI").hide()
    $("#saveAPIButton").hide()
}

function enableAPIEdit() {
    //console.log('enable API input edits')
    $("#addNewAPI").show()
    $("#newAPIName").prop('readonly', false)
    $("#newAPIEndpoint").prop('readonly', false)
    $("#newAPIKey").prop('readonly', false)
    $("#newAPIEndpointType").prop('disabled', false)
    $("#saveAPIButton").show()
    $("#editAPIButton").hide()
    //Set the title 
    $("#apiTitle").text('Edit API Info')
}

function disableAPIEdit() {
    //console.log('disabling API input edits')
    $("#newAPIName").prop('readonly', true)
    $("#newAPIEndpoint").prop('readonly', true)
    $("#newAPIKey").prop('readonly', true)
    $("#newAPIEndpointType").prop('disabled', true)
    $("#saveAPIButton").hide()
    //Set the title 
    $("#apiTitle").text('')
}

async function populateAPIValues(api) {
    console.log(api)
    $("#newAPIName").val(api.name)
    $("#newAPIKey").val(api.key)
    $("#newAPIEndpoint").val(api.endpoint)
    $("#newAPIEndpointType").find(`option[value="${api.endpointType}"]`).prop('selected', true)
    // hide the add button 
    $("#addNewAPIButton").hide()
    $("#editAPIButton").show()
    $("#apiTitle").text('API Info')
}

// set the engine mode to either horde or Text Completions based on a value from the websocket
function setEngineMode(mode) {
    const toggleModeElement = $("#toggleMode");
    const isHordeMode = (mode === 'horde');
    toggleModeElement.toggleClass('TCMode', !isHordeMode)
        .toggleClass('hordeMode', isHordeMode)
        .text(isHordeMode ? '🧟' : '📑')
        .attr('title', isHordeMode ? 'Click to switch to Text Completions Mode' : 'Click to switch to Horde Mode');
    console.log(`Switching to ${isHordeMode ? 'Horde' : 'Text Completions'} Mode`);
    flashElement('toggleMode', 'good');
    if (isHordeMode) {
        $("#TCCCAPIBlock").hide()
    } else {
        $("#TCCCAPIBlock").show()
    }
}

export default {
    setEngineMode: setEngineMode,
    populateAPISelector: populateAPISelector,
    populateSelector: populateSelector,
    submitKey: submitKey,
    updateUserName: updateUserName,
    updateD1JB: updateD1JB,
    updateInstructFormat: updateInstructFormat,
    updateSelectedSamplerPreset: updateSelectedSamplerPreset,
    updateSelectedChar: updateSelectedChar,
    updateAIChatUserName: updateAIChatUserName,
    updateAPI: updateAPI,
    populateAPIValues: populateAPIValues,
    showAddNewAPIDiv: showAddNewAPIDiv,
    hideAddNewAPIDiv: hideAddNewAPIDiv,
    enableAPIEdit: enableAPIEdit,
    disableAPIEdit: disableAPIEdit,
}
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
    console.log(instructSelectElement)
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

async function populateAPISelector(API) {
    console.debug(API);
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

// set the engine mode to either horde or Text Completions based on a value from the websocket
function setEngineMode(mode) {
    if (mode === 'horde') {
        $("#toggleMode").removeClass('TCMode').addClass('hordeMode').text('🧟');
        $("#toggleMode").attr('title', 'Click to switch to Text Completions Mode');
        console.log('Switching to Horde Mode')
    } else {
        $("#toggleMode").removeClass('hordeMode').addClass('TCMode').text('📑');
        $("#toggleMode").attr('title', 'Click to switch to Horde Mode');
        console.debug('Switching to Text Completions Mode')
    }
    flashElement('toggleMode', 'good')
}

export default {


    setEngineMode: setEngineMode,
    populateSamplerSelector: populateSamplerSelector,
    populateAPISelector: populateAPISelector,
    populateInstructSelector: populateInstructSelector,
    populateCardSelector: populateCardSelector,
    submitKey: submitKey,
    updateUserName: updateUserName,
    updateD1JB: updateD1JB,
    updateInstructFormat: updateInstructFormat,
    updateSelectedSamplerPreset: updateSelectedSamplerPreset,
    updateSelectedChar: updateSelectedChar,
    updateAIChatUserName: updateAIChatUserName,
    updateAPI: updateAPI
}
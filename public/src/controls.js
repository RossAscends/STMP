import util from './utils.js'
import { isUserScrollingAIChat, isUserScrollingUserChat, myUUID } from '../script.js'


function updateSelectedModel(model) {
    console.debug(`[updateSelectedModel()] Changing model from server command to ${model}.`)
    $("#modelList").find(`option[value="${model}"]`).prop('selected', true)
    util.flashElement('modelList', 'good')
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

function showAddNewAPIDiv() {
    //console.debug('showing div for adding new API')
    $("#APIConfig").show()
    $("#addNewAPIButton").show()
    $("#editAPIButton").hide()
    $("#selectedAPI").val('')
    $("#endpoint").val('')
    $("#key").val('')
    $("#type").val('TC')
    $("#type").prop('disabled', false)
    $("#selectedAPI").prop('readonly', false)
    $("#endpoint").prop('readonly', false)
    $("#key").prop('readonly', false)
    $("#apiTitle").text('New API Info')
    $("#saveAPIButton").show()
}

function hideAddNewAPIDiv() {
    console.debug('[hideAddNewAPIDiv()] >> GO')
    $("#addNewAPIButton").hide()
    $("#editAPIButton").show()
    $("#APIConfig").hide()
    $("#saveAPIButton").hide()
}

function enableAPIEdit() {
    console.debug('[enableAPIEdit()] >> GO')
    $("#selectedAPI").prop('readonly', false)
    $("#endpoint").prop('readonly', false)
    $("#key").prop('readonly', false)
    $("#type").prop('disabled', false)
    $("#saveAPIButton").show()
    //Set the title 
    $("#apiTitle").text('Edit API Info')
}

function disableAPIEdit() {
    console.debug('[disableAPIEdit()] >> GO')
    $("#selectedAPI").prop('readonly', true)
    $("#endpoint").prop('readonly', true)
    $("#key").prop('readonly', true)
    $("#type").prop('disabled', true)
    $("#saveAPIButton").hide()
    //Set the title 
    $("#apiTitle").text('')
}

async function testNewAPI() {
    let name = $("#selectedAPI").val()
    let endpoint = $("#endpoint").val()
    let key = $("#key").val()
    let type = $("#type").val()
    let claude = $("#claude").prop('checked')
    let model = $("#modelList").val()

    if (endpoint.includes('localhost:')) {
        await util.flashElement('endpoint', 'bad')
        alert('For local connections use 127.0.0.1, not localhost')
        return
    }
    let testRequestMesage = {
        type: 'testNewAPI',
        UUID: myUUID,
        api: {
            name: name,
            endpoint: endpoint,
            key: key,
            type: type,
            claude: claude,
            model: model
        }
    }
    console.debug(testRequestMesage)
    util.messageServer(testRequestMesage)
}

async function getModelList() { //this gets back a hostStateChange message from server with the modellist for the selected API
    let name = $("#selectedAPI").val()
    let endpoint = $("#endpoint").val()
    let key = $("#key").val()
    let type = $("#type").val()
    let claude = $("#claude").prop('checked')
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
    submitKey,
    updateUserName,
    updateAIChatUserName,
    showAddNewAPIDiv,
    hideAddNewAPIDiv,
    testNewAPI,
    getModelList,
    enableAPIEdit,
    disableAPIEdit,
    updateSelectedModel,
    showPastChats,
}
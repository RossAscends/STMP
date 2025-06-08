
/*TODO: 
    condense anything that is related to user state into a single message type: 
        userList, AIChatUserlist, userconnect, userDisconnect, username change

 *condense both clearchats into a single type with a 'chatID' property

 */

import control from "./src/controls.js";
import util from "./src/utils.js";
import handleconfig from './src/handleconfig.js'
import { streamUpdater } from "./src/streamUpdater.js";
import hostToast from "./src/hostToast.js";
import disableGuestInput from "./src/disableGuestInput.js";

export var username,
  isAutoResponse,
  isStreaming, //defined by the 'streaming' toggle
  isClaude,
  contextSize,
  responseLength,
  isPhone, isTouchDevice, isMobileViewport, isLandscape;

export var currentlyStreaming = false; //set true when streamed response is incoming, and false when not.
export var myUUID
export var myUsername
export var myAIChatUsername
export var myUserColor
export var socket = null;
export var isUserScrollingAIChat = false;
export var isUserScrollingUserChat = false;
let userChatScrollTimeout, AIChatScrollTimeout;

export var isHost;
var AIChatDelay, userChatDelay, guestInputPermissionState, allowImages;

//this prevents selectors from firing off when being initially populated
var initialLoad = true;
//MARK: startupUserName
async function startupUsernames() {
  //console.debug(`[startupUsernames]>> GO`);

  async function initializeUsername() {
    //console.debug(`[initializeUsername]>> GO`);
    // Prevent duplicate dialogs
    if ($(".ui-dialog").length) {
      console.debug('Dialog already exists, removing');
      $(".ui-dialog").dialog("destroy").remove();
    }

    return new Promise(resolve => {
      const $dialogContent = $(`
        <div>
          <form id="usernameForm">
            <p>Enter your username (3+ letters, max 12 chars, A-Z, 0-9, _, -):</p>
            <input type="text" id="modalUsernameInput" required minlength="1">
          </form>
        </div>
      `);

      $dialogContent.dialog({
        draggable: false,
        resizable: false,
        modal: true,
        position: { my: "center", at: "center top+25%", of: window },
        title: "Enter Username",
        buttons: {
          Submit: function () {
            const $input = $dialogContent.find('#modalUsernameInput');
            const input = $input.val().trim();
            console.debug('modal username Dialog input:', input, 'Length:', input.length, 'Raw val:', $input.val());
            const result = validateUserName(input);
            console.debug('modal username Validation result:', result);
            if (result.success) {
              // Save to localStorage only on Submit
              if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem("username", result.username);
                console.debug(`Set localStorage 'username' to ${result.username}`);
              }
              $dialogContent.dialog("destroy").remove();
              resolve(result.username);
            }
            // Invalid input: Do nothing, user sees red background
          },
          Cancel: function () {
            $dialogContent.dialog("destroy").remove();
            resolve('Guest');
          }
        },
        open: function () {
          $(".ui-button").trigger("blur");
          $dialogContent.find('#modalUsernameInput').focus();
        },
        close: function () {
          $dialogContent.dialog("destroy").remove();
        }
      });

      const $input = $dialogContent.find('#modalUsernameInput');
      // Real-time validation on keyup
      $input.on('keyup', () => {
        const input = $input.val().trim();
        const result = validateUserName(input);
        $input.css('background-color', result.success ? '#2f7334' : '#781e2d');
      });

      // Form submission triggers Submit button
      $dialogContent.find('#usernameForm').on('submit', (e) => {
        e.preventDefault();
        $dialogContent.dialog("widget").find(".ui-dialog-buttonpane button:contains('Submit')").trigger('click');
      });
    });
  }

  const storedUsername = localStorage.getItem("username");
  var storedAIChatUsername = localStorage.getItem("AIChatUsername");
  var username =
    storedUsername && storedUsername !== ""
      ? storedUsername
      : await initializeUsername();
  const myUUID = localStorage.getItem("UUID") || "";
  var AIChatUsername =
    storedAIChatUsername && storedAIChatUsername !== ""
      ? storedAIChatUsername
      : username;

  //console.debug(`[localStorage] username:${username}, AIChatUsername:${AIChatUsername}`);

  return { username, AIChatUsername };
}

//MARK:validateUserName
export function validateUserName(username) {
  //console.debug('validateUserName input:', username, 'Type:', typeof username);
  if (!username || username.trim().length === 0) {
    return { success: false, error: 'Username cannot be empty.' };
  }
  if (username.length > 12) {
    return { success: false, error: 'Username cannot exceed 12 characters.' };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(username)) {
    return {
      success: false,
      error: 'Username can only contain letters (A-Z, a-z), numbers (0-9), underscores, and hyphens.'
    };
  }
  const letterCount = (username.match(/[A-Za-z]/g) || []).length;
  if (letterCount < 3) {
    return {
      success: false,
      error: 'Username must contain at least 3 letters (A-Z, a-z).'
    };
  }
  return { success: true, username };
}

//routine to check if we are on an iOS device or not
var dummyElement = $("<div>").css("-webkit-touch-callout", "none");
var isIOS = dummyElement.css("-webkit-touch-callout") === "none";
dummyElement.remove();

var hostname = window.location.hostname;
var port = window.location?.port;
//var wsType = window.location.hostname === (`localhost` || `127.0.0.1`) ? 'ws' : 'wss'

//disclaimer: this works, but i can't speak for the robustness of this check.
var wsType =
  /[a-zA-Z]/.test(window.location.hostname) &&
    window.location.hostname !== "localhost"
    ? "wss"
    : "ws";
//console.debug(`We will connect to "${wsType}" server..`);
var serverUrl = `${wsType}://${hostname}:${port}`;


//MARK: updateUserList
function updateUserList(listType, userList) {


  if (!userList || userList.length === 0) {
    console.warn('saw no userlist for ', listType);
    return;
  }

  if (typeof userList === "string") {
    console.warn(`saw userList as string, parsing JSON for ${listType}`);
    try {
      userList = JSON.parse(userList);
    } catch (e) {
      console.error("Failed to parse userList JSON string:", e);
      return;
    }
  }

  if (!Array.isArray(userList)) {
    console.warn('userList is not a real array — converting:', userList);
    userList = Object.values(userList); // fallback for array-like objects
  }

  const listElement = $(`#${listType} ul`);
  listElement.empty(); // Clear the existing user list

  userList.sort((a, b) => {
    const usernameA = a.username.toLowerCase();
    const usernameB = b.username.toLowerCase();
    if (usernameA < usernameB) { return -1; }
    if (usernameA > usernameB) { return 1; }
    return 0;
  });

  //console.debug('userList: ', userList)
  userList.forEach(({ username, role, color, entity }) => {
    let isAI = entity === "AI" ? true : false;
    const usernameDecorator = listType === "AIChatUserList" && isAI ? ` 🤖` : role === "host" ? `👑` : null;
    const usernameColor = listType === "AIChatUserList" && isAI ? "white" : color;
    const usernameHTML = usernameDecorator === null ? username : `${username}<span class="usernameDecorator">${usernameDecorator}</span>`;
    //console.warn(usernameText);
    const listItem = `<li data-foruser="${username}" title="${username}" style="color: ${usernameColor};">${usernameHTML}</li>`;
    //console.log(listItem);
    listElement.append(listItem);
  });
}


//MARK: processConnection
async function processConfirmedConnection(parsedMessage) {
  console.debug("[processConfirmedConnection()]>> GO");

  //process universal stuff for guests
  const {
    clientUUID, role, selectedCharacterDisplayName,
    chatHistory, AIChatHistory, userList, sessionID, AIChatSessionID, crowdControl, color
  } = parsedMessage;

  console.debug(crowdControl)

  //these need to be set as globals here in script.js
  AIChatDelay = crowdControl.AIChatDelay * 1000;
  userChatDelay = crowdControl.userChatDelay * 1000;
  guestInputPermissionState = crowdControl.guestInputPermissionState;
  //console.warn('guestInputPermissionState: ', guestInputPermissionState)


  myUUID = myUUID === "" ? clientUUID : myUUID;
  myUserColor = color || "#ffffff"; //default to white if no color is provided, this signals a problem
  $("#AIChatUserNameHolder").css('color', myUserColor).text(myAIChatUsername);
  $("#userChatUserNameHolder").css('color', myUserColor).text(myUsername);
  localStorage.setItem("UUID", myUUID);
  isHost = role === "host" ? true : false;
  //console.debug(`my UUID is: ${myUUID}`);
  var userRole = isHost ? "Host" : "Guest";
  disableGuestInput.toggleState(guestInputPermissionState);
  $("#userRole").text(userRole);
  $("#charName").text(selectedCharacterDisplayName);
  $("#charName").parent().prop('title', `Powered by ${parsedMessage.selectedModelForGuestDisplay}`);

  if (isHost) {
    //process all control and selector values for hosts
    await handleconfig.processLiveConfig(parsedMessage)

    $("#charName").hide();
    $("#leftSpanner").remove()
    $(".hostControls").removeClass('hostControls'); //stop them from being hidden by CSS
    $(".guestSpacing").remove();
    if (isPhone || isMobileViewport) {
      //handle initial loads for phones, 
      //hide the control panel and user lists
      //$("#universalControls").css('height', 'unset');
      $("#roleKeyInputDiv")
        .removeClass("positionAbsolute")
        .css({ width: '95%', height: 'unset' })


      if ($("#controlPanel").hasClass("initialState")) {
        $("#controlPanel").removeClass("initialState").addClass('opacityZero').addClass('hidden');
      }

      $("#userListsWrap").addClass('hidden').addClass('opacityZero')

    } else //handle first load for PC, shows the panel
      if ($("#controlPanel").hasClass("initialState")) {
        $("#controlPanel").addClass('opacityZero').show()
        $("#userListsWrap").addClass('opacityZero').show()
        await util.delay(250);
        $("#controlPanel").removeClass('opacityZero')
        $("#userListsWrap").removeClass('opacityZero')
        $("#controlPanel").removeClass("initialState");
      }

    if (!$("#promptConfigTextFields").hasClass('heightHasbeenSet') && $("#controlPanel").css('display') !== 'none') {
      // $("#promptConfigTextFields").css("height", util.calculatePromptsBlockheight())
      $("#promptConfigTextFields").addClass('heightHasbeenSet')
    }

    $("#showPastChats").trigger("click");
  } else { // is Guest
    //hide control panel and host controls for guests
    $(".guestSpacing").css('display', 'block')
    $(".hostControls").remove();


    control.disableAPIEdit();
    if (isPhone || isMobileViewport) {
      // $("#universalControls").css('height', 'unset');
      $("#userListsWrap").addClass('hidden').addClass('opacityZero')
      $("#roleKeyInputDiv")
        .removeClass("positionAbsolute")
        .css('width', '95%')
    } else {
      $("#leftSpanner").show()
      $("#userListsWrap").removeClass('opacityZero')//.addClass('opacityZero').show()
    }
  }

  updateUserList("userList", userList);

  if (chatHistory) {
    console.debug(`[updateChatHistory(#userChat)]>> GO`);
    $("#userChat").empty()
    appendMessages(chatHistory, "#userChat", sessionID);
  }

  if (AIChatHistory) {
    console.debug("[updateAIChatHistory(#AIChat)]>> GO");
    $("#AIChat").empty()
    appendMessages(AIChatHistory, "#AIChat", AIChatSessionID);
  }

  //we always want to auto scroll the chats on first load
  $("#userChat").scrollTop($("#userChat").prop("scrollHeight"));
  $("#AIChat").scrollTop($("#AIChat").prop("scrollHeight"));

  initialLoad = false;
}
//MARK:appendMessages

//elementSelector (string): is #AIChat" or "#userChat" for 
//messages (array of objs): [{username:"user", userColor:"#color", content:"message text", messageID:"id", entity:"user or AI"}]
function appendMessages(messages, elementSelector, sessionID) {

  messages.forEach(({ username, userColor, content, messageID, entity, role, timestamp }) => {

    let dataEntityTypeString = "";
    let isAI = entity === "AI" ? true : false;
    let usernameToShow = username;
    const usernameDecorator = isAI ? ` 🤖` : role === "host" ? ` 👑` : null;
    //usernameHTML = role === "host" ? `${usernameToShow} 👑` : usernameToShow;
    const usernameHTML = usernameDecorator === null ? usernameToShow : `<span>${usernameToShow}<span class="usernameDecorator">${usernameDecorator}</span></span>`;
    userColor = isAI ? "white" : userColor;
    let inferredEntity = elementSelector === "#AIChat" ? entity : "user";
    elementSelector === "#AIChat" ? dataEntityTypeString = `data-entityType="${entity}"` : dataEntityTypeString = `data-entityType="user"`;
    let containerTypeClass = elementSelector === "#AIChat" ? "forAIChat" : "forUserChat"; //this is used as an identifier for message deletion/editing
    let entityAndNameVal = `${usernameToShow}-${inferredEntity}`;
    let entityAndNameString = `data-name-and-entity="${entityAndNameVal}"`;

    let formattedTimestamp = new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + " " + new Date(timestamp).toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit' });

    let newDiv = $(`
    <div class="transition250" data-sessionid="${sessionID}" data-messageid="${messageID}" ${dataEntityTypeString} ${entityAndNameString}>
      <div class="messageHeader flexbox justifySpaceBetween width100p">
        <span style="color:${userColor}" class="msgUserName flexbox alignItemsCenter chatUserName">${usernameHTML}</span>
        <span class="flexbox msgControlsAndTimeBlock">
          <div class="messageControls transition250">
              <i data-messageid="${messageID}" data-sessionid="${sessionID}" ${dataEntityTypeString} class="messageEdit ${containerTypeClass} messageButton fa-solid fa-edit bgTransparent greyscale textshadow textBrightUp transition250"></i>
              <i data-messageid="${messageID}" data-sessionid="${sessionID}" ${dataEntityTypeString} class="messageDelete ${containerTypeClass} messageButton fa-solid fa-trash bgTransparent greyscale textshadow textBrightUp transition250"></i>
          </div>
          <small class="messageTime">${formattedTimestamp}</small>
        </span>
      </div>
      <div class="messageContent">
      ${content}
      </div>
    </div>
    `);

    //console.warn(newDiv.find('.messageHeader').html())
    if (!isHost) newDiv.find('.messageControls').remove();
    if (elementSelector == "#userChat") newDiv.find('.messageEdit').remove();
    //console.debug('newDiv content: ', content, 'elementSelector: ', elementSelector);

    //check if the last message in the relevant chat contains the same header information for name and entity
    const lastMessageNameandEntityString = $(elementSelector).children().last().data('name-and-entity');
    const same = lastMessageNameandEntityString === entityAndNameVal;
    //console.warn(`same: ${same}, prev: "${lastMessageNameandEntityString}", inc: "${usernameToShow}-${inferredEntity}"`);

    if (same) {
      const newControlsAndTime = newDiv.find('.msgControlsAndTimeBlock');
      newDiv.find('.messageContent').parent().append(newControlsAndTime);

      newDiv.find('.messageHeader').remove();
      $(elementSelector).children().last().addClass('marginBot0 paddingBot0');
      $(elementSelector).append(newDiv);
      $(elementSelector).children().last().addClass('justifySpaceBetween flexbox marginTop0 paddingTop0');

    } else {

      $(elementSelector).append(newDiv);

    }

    addMessageEditListeners(newDiv);

  });

}

function addMessageEditListeners(newDiv) {

  const $newdiv = $(newDiv);
  $newdiv.find(`.messageEdit`).off('click').on('click', async function () {

    if (currentlyStreaming) {
      alert('Can not Edit messages while streaming.');
      console.warn('Can not Edit messages while streaming.');
      return;
    }
    const mesID = $(this).data('messageid')
    const sessionID = $(this).data('sessionid')

    //first we get the message content from server as it's saved in the database
    let currentMessageData = await getMessageContent(mesID)

    await editMessage(currentMessageData.content)

    async function getMessageContent(mesID) {
      //this outgoing message type receives a response
      //from server under type 'messageContentResponse', 
      // which our main switch does not handle
      const messageContentRequest = {
        type: 'messageContentRequest',
        UUID: myUUID,
        mesID: mesID,
        sessionID: sessionID
      };
      console.debug('outgoing messsage content request', messageContentRequest)
      return new Promise((resolve, reject) => {

        const messageContentHandler = (response) => {
          //parse the response, extract the mesage contents
          console.debug(response)
          let responseDataJSON = JSON.parse(response.data)
          console.debug('messageContentResponse: ', responseDataJSON)
          //and remove listener once we have it
          socket.removeEventListener('message', messageContentHandler);
          resolve(responseDataJSON);
        };
        //we create a one-time listener to handle the next response that will go past our main switch
        socket.addEventListener('message', messageContentHandler);
        socket.send(JSON.stringify(messageContentRequest));
      });
    }


    async function editMessage(message) {
      //create a popup window to handle editing of hte content
      const widthToUse = isPhone ? ($(window).width() - 10) : $(window).width() / 3
      const heightToUse = isPhone ? ($(window).height() - 10) : $(window).height() / 2

      $(`<div id="mesEditPopup"></div>`)
        .html(
          `<textarea id="mesEditText"></textarea>`
        )
        .dialog({
          width: widthToUse,
          height: heightToUse,
          draggable: false,
          resizable: false,
          modal: true,
          position: { my: "center", at: "center", of: window },
          title: "Edit Message",
          buttons: {
            Ok: function () {
              console.debug('new content for edited message: ', $("#mesEditText").val())
              $(this).dialog("close");
              const newMessageContent = $("#mesEditText").val()
              $(this).remove()

              const mesEditRequest = {
                type: 'messageEdit',
                UUID: myUUID,
                mesID: mesID,
                sessionID: sessionID,
                newMessageContent: newMessageContent
              }
              //send a 'mesasgeEdit' outgoing message to server
              //this resolves with a 'pastChatToLoad' response, which the main switch will handle.
              console.debug('mesEditRequest', mesEditRequest)
              util.messageServer(mesEditRequest)
            },
            Cancel: function () {
              $(this).dialog("close");
              $(this).remove()
            },
          },
          open: function () {
            console.log(message)
            $("#mesEditText").val(message)
            $(".ui-button").trigger("blur");
          },
          close: function () { },
        })

    }
  });

  $newdiv.find(`.messageDelete`).off('click').on('click', async function () {
    if ($(this).parent().parent().parent().parent().children().length === 1) { //check how many messages are inside the userChat/AIChat container
      alert('Can not delete the only message in this chat. \nIf you want to delete an AI Chat, use the Past Chats list.\nFor User Chats, just empty it with the trash can.')
      return
    }

    if (currentlyStreaming) {
      alert('Can not delete messages while streaming.');
      console.warn('Can not delete messages while streaming.');
      return;
    }

    let deletionType = $(this).hasClass('forAIChat') ? "AIChat" : "userChat";

    const mesID = $(this).data('messageid')
    const sessionID = $(this).data('sessionid')
    const mesDelRequest = {
      type: 'messageDelete',
      deleteType: deletionType,
      UUID: myUUID,
      mesID: mesID,
      sessionID: sessionID
    }
    util.messageServer(mesDelRequest)
  })
}


//MARK: connectWebSocket
async function connectWebSocket(username) {
  var username, AIChatUsername;

  myUsername = localStorage.getItem("username") !== null ? localStorage.getItem("username") : ({ username, AIChatUsername } = await startupUsernames());
  myAIChatUsername = localStorage.getItem("AIChatUsername") !== null ? localStorage.getItem("AIChatUsername") : ({ username, AIChatUsername } = await startupUsernames());
  myUUID = localStorage.getItem("UUID") !== null ? localStorage.getItem("UUID") : "";
  console.log(`trying to connect to ${serverUrl} with ${myUUID}, ${myUsername} or ${username}`);
  socket = new WebSocket(serverUrl + "?uuid=" + myUUID + "&username=" + encodeURIComponent(username));
  //console.log("socket connected!");

  socket.onopen = function () { handleSocketOpening(socket); }
  socket.onclose = disconnectWebSocket;
  // Handle incoming messages from the server
  socket.addEventListener("message", async function (event) {
    var message = event.data;
    let parsedMessage = JSON.parse(message);

    //dont send spammy server messages to the console
    if (
      parsedMessage.type == "streamedAIResponse" ||
      parsedMessage.type == "pastChatsList" ||
      parsedMessage.type == "pastChatToLoad" ||
      parsedMessage.type == "heartbeatResponse" ||
      parsedMessage.type == "chatUpdate" ||
      parsedMessage.type == "connectionConfirmed"
    ) {
      if (parsedMessage.type !== "streamedAIResponse") {
        console.info('Received parsedMessage type:', parsedMessage.type)
      }
    } else {
      console.info('Received parsedMessage type:', parsedMessage.type, 'message:', message)
      //console.info(parsedMessage.liveConfig)
    }


    //MARK: parsedMessage switch
    switch (parsedMessage?.type) {
      case "modelLoadResponse":
        if (parsedMessage.result === 200) {
          await util.flashElement("modelLoadButton", "good");
        } else {
          await util.flashElement("modelLoadButton", "bad");
        }
        break;
      case "toggleGuestInputState":
        disableGuestInput.toggleState(parsedMessage.allowed);
        break;
      case 'inputDisabledWarning':
        hostToast.showHostToast(parsedMessage.message, 'System', 500);
        break;
      case "fileUploadSuccess":
        console.warn("Uploaded successfully:", parsedMessage.message);
        util.showUploadSuccessOverlay(parsedMessage.message);
        await util.delay(500);
        $("#charListRefresh").trigger('click');
        break;
      case "fileUploadError":
        console.warn("Upload failed:", parsedMessage.message);
        alert(parsedMessage.message);
        break;
      case 'cardListResponse':
        handleconfig.refreshCardList(parsedMessage.cardList);
        break;
      case 'heartbeatResponse':
        break
      case "clearChat":
        console.debug("Clearing User Chat");
        $("#userChat").empty();
        break;
      case "clearAIChat":
        console.debug("Clearing AI Chat");
        $("#AIChat").empty();
        break;
      case "startClearTimerResponse":
        util.clearChatWithCountdown('induced', 'start', parsedMessage.target, isHost);
        break;

      case "cancelClearTimerResponse":
        util.clearChatWithCountdown('induced', 'cancel', parsedMessage.target, isHost);
        break;
      case "chatUpdate": //when last message in AI char is deleted
        console.debug("saw AI chat update instruction");
        $("#AIChat").empty();
        let resetChatHistory = parsedMessage.chatHistory;
        appendMessages(resetChatHistory, "#AIChat", resetChatHistory[0].sessionID,)
        break;
      case "userChatUpdate": //when last message in user char is deleted
        console.debug("saw user chat update instruction");
        $("#userChat").empty();
        let resetUserChatHistory = parsedMessage.chatHistory;
        appendMessages(resetUserChatHistory, "#userChat", resetUserChatHistory[0].sessionID,)
        break;

      case "modeChange":
        handleconfig.setEngineMode(parsedMessage.engineMode, parsedMessage.hordeWorkerList);
        break;

      case "userList":
      case "userConnect":
      case "userDisconnect":
        const userList = parsedMessage.userList;
        updateUserList('userList', userList);
        break;
      case "forceDisconnect":
        disconnectWebSocket();
        break;
      case "guestConnectionConfirmed":
      case "connectionConfirmed":
        //console.info(parsedMessage.liveConfig)
        allowImages = handleconfig.allowImages() || parsedMessage.crowdControl.allowImages
        //console.warn('allowImages upon connection: ', allowImages)
        processConfirmedConnection(parsedMessage);
        break;
      case "hostStateChange":
        handleconfig.processLiveConfig(parsedMessage);
        break;
      case "guestStateChange":
        let state = parsedMessage.state
        let selectedCharacter
        ({ selectedCharacter, AIChatDelay, userChatDelay } = state)
        userChatDelay = userChatDelay * 1000
        AIChatDelay = AIChatDelay * 1000
        $("#charName").text(selectedCharacter);
        break
      case "modelChangeForGuests":
        let selectedModel = parsedMessage.selectedModelForGuestDisplay;
        $("#charName").parent().prop('title', `Powered by ${selectedModel}`);
        break
      case "userChangedName":
        console.debug("saw notification of user name change");
        var { type, content } = JSON.parse(message);
        /*         const HTMLizedUsernameChangeMessage = converter.makeHtml(content);
                const sanitizedUsernameChangeMessage = DOMPurify.sanitize(
                  HTMLizedUsernameChangeMessage
                ); */
        let newUsernameChatItem = $("<div>");
        newUsernameChatItem.html(`<i>${content}</i>`);
        $("#userChat").append(newUsernameChatItem);
        //util.kindlyScrollDivToBottom($("#userChat"));
        break;
      case "changeCharacter":
        let currentChar = $("#characters").val();
        let newChar = parsedMessage.char;
        if (currentChar !== newChar) {
          control.updateSelectedChar(
            myUUID,
            newChar,
            parsedMessage.charDisplayName,
            "forced"
          );
        }
        break;
      case "changeCharacterDisplayName":
        let newCharDisplayName = parsedMessage.charDisplayName;
        $("#charName").text(newCharDisplayName);
        break;
      case "keyAccepted":
        //refresh page to get new info, could be done differently in the future
        await util.flashElement("roleKeyInput", "good");
        console.debug("key accepted, refreshing page...");
        location.reload();
        break;
      case "keyRejected":
        console.log("key rejected");
        $("#roleKeyInput").val("");
        await util.flashElement("roleKeyInput", "bad");
        break;
      case 'modelListError':
        await util.flashElement($("#modelList"), 'bad')
        alert('Could not get a model list')
        break;
      case "pastChatsList":
        let chatList = parsedMessage.pastChats;
        control.showPastChats(chatList);
        break;
      case "pastChatToLoad": //when selecting to load past chat, or edit/deleting a non-last AI chat message
        console.debug("loading past AI chat session");
        $("#AIChat").empty();
        $("#AIChatUserList ul").empty();
        let pastChatHistory = parsedMessage.pastChatHistory;
        $("#pastChatsList .activeChat").removeClass("activeChat");
        $("#pastChatsList")
          .find(`div[data-session_id="${parsedMessage.sessionID}"]`)
          .addClass("activeChat");
        console.debug('about to append messages: ', pastChatHistory, "#AIChat", parsedMessage.sessionID)
        appendMessages(pastChatHistory, "#AIChat", parsedMessage.sessionID)
        util.unkindlyScrollDivToBottom($("#AIChat"))
        break;
      case "pastChatDeleted":
        let wasActive = parsedMessage?.wasActive;
        if (wasActive) {
          $("#AIChat").empty();
          $("#AIChatUserList ul").empty();
        }
        $("#showPastChats").trigger("click");
        break;
      case "testAPIResult":
        let result = parsedMessage.result;
        console.debug(result);
        if (result.status === 200) {
          util.flashElement("APIEditDiv", "good");
        } else {
          let alertMessage
          if (!result.status || !result.statusText) {
            let reason = JSON.stringify(result)
            alertMessage = `Error ${reason}`
          } else {
            alertMessage = `Error [${result.status}]: ${result.statusText}`
          }

          await util.flashElement("APIEditDiv", "bad", 150, 3);
          alert(alertMessage);
        }
        break;
      //MARK: streamedAIResponse
      case "streamedAIResponse":
        $("body").addClass("currentlyStreaming");
        currentlyStreaming = true;
        disableButtons()
        let isContinue = parsedMessage.isContinue;
        accumulatedContent += parsedMessage.content;
        let $incomingDiv = $("#AIChat .incomingStreamDiv");
        if (isContinue) {
          //console.warn('saw shouldContinue');
          if (!$incomingDiv.length) {
            //console.warn('no incomingStreamDiv, so finding the last one and making it continue');
            $incomingDiv = $("#AIChat").find("div[data-entitytype='AI']").last()
            $incomingDiv.addClass("incomingStreamDiv")
            $incomingDiv.find(".messageContent p:last-child").append('<span></span>');
            //console.warn($incomingDiv)
          } else {
            //console.warn('found an incomingStreamDiv, so continuing it');
            //console.warn($incomingDiv)
          }
        } else {
          //console.warn('not a continue, so add a new message div')
          if (!$incomingDiv.length) {
            const newStreamDivSpan = $(`
            <div class="incomingStreamDiv transition250" data-sessionid="${parsedMessage.sessionID}" data-messageid="${parsedMessage.messageID}" data-entityType="AI">
                <div class="messageHeader flexbox justifySpaceBetween">
                    <span style="color:white" class="chatUserName">${parsedMessage.username} 🤖</span>
                    <div class="messageControls transition250">
                        <i data-messageid="${parsedMessage.messageID}" data-sessionid="${parsedMessage.sessionID}" class="fromStreamedResponse messageEdit messageButton fa-solid fa-edit bgTransparent greyscale textshadow textBrightUp transition250"></i>
                        <i data-messageid="${parsedMessage.messageID}" data-sessionid="${parsedMessage.sessionID}" class="fromStreamedResponse messageDelete messageButton fa-solid fa-trash bgTransparent greyscale textshadow textBrightUp transition250"></i>
                    </div>
                </div>
                <div class="messageContent"><span></span></div>
            </div>
        `);
            if (!isHost) newStreamDivSpan.find('.messageControls').remove();
            $("#AIChat").append(newStreamDivSpan);
          }
        }



        pendingHTML = mendHTML(parsedMessage.content);
        streamUpdater.go(pendingHTML, isContinue);
        //requestAnimationFrame(updateStreamedMessageHTML);

        break;

      case "streamedAIResponseEnd":
        console.debug("saw stream end");
        const newDivElement = $("<p>").html(parsedMessage.content);
        const elementsToRemove = $(".incomingStreamDiv .messageContent").children();
        elementsToRemove.remove();
        if (isHost) addMessageEditListeners('.incomingStreamDiv');
        $(".incomingStreamDiv .messageContent").html(newDivElement.html());
        accumulatedContent = "";
        $(".incomingStreamDiv").removeClass("incomingStreamDiv");
        updateUserList("AIChatUserList", parsedMessage.AIChatUserList);
        $("body").removeClass("currentlyStreaming");
        currentlyStreaming = false;
        console.debug('Re-enabling buttons');
        enableButtons();
        break;
      //MARK: chatMessage
      case "AIResponse":
      case "chatMessage":
        let isAIResponse = false;
        if (parsedMessage.type === "AIResponse") { isAIResponse = true; }

        var {
          chatID, username, content,
          userColor, color, workerName,
          hordeModel, kudosCost, AIChatUserList, messageID, entity, role, timestamp
        } = JSON.parse(message);
        //console.warn(entity, isAIResponse)
        let sessionID = parsedMessage.sessionID
        let entityTypeString = entity === undefined ? isAIResponse === true ? "AI" : "user" : entity;
        //console.warn(entityTypeString)
        let chatMessageObj =
        {
          username: username,
          userColor: userColor,
          content: content,
          messageID: messageID,
          entity: entityTypeString,
          role: role,
          timestamp: timestamp
        }
        appendMessages([chatMessageObj], "#" + chatID, sessionID)
        util.kindlyScrollDivToBottom($(`div[data-chat-id="${chatID}"]`));

        if (chatID === "AIChat") {
          $("#showPastChats").trigger("click"); //autoupdate the past chat list with each AI chat message
        }
        let targetList = isAIResponse ? "AIChatUserList" : "userList";
        if (isAIResponse && AIChatUserList && AIChatUserList.length > 0) {
          updateUserList(targetList, AIChatUserList);
        }
        else if (isAIResponse && AIChatUserList && AIChatUserList.length === 0) {
          console.warn("saw empty AIChatUserList from an AI Response, so not updating it");
        }

        isAIResponse = false;
        break;
      case 'hostToastResponse':
        hostToast.showHostToast(parsedMessage.content, parsedMessage.username);
        break;
      default:
        console.warn(`UNKNOWN MESSAGE TYPE "${parsedMessage.type}": Main Switch ignoring, perhaps it's a special response for a different function`);
        console.debug(parsedMessage);
        break;
    }
  });
}



function mendHTML(html) {
  const openTags = getOpenTags(html);
  const closing = openTags.slice().reverse().map(tag => `</${tag}>`).join('');
  //console.warn(html + closing)
  return html + closing;

  function getOpenTags(html) {
    const tagStack = [];
    const tagRegex = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g;
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      // Skip self-closing
      if (/\/>$/.test(fullTag) || ['br', 'img', 'hr', 'meta', 'input', 'link'].includes(tagName)) continue;

      if (fullTag.startsWith('</')) {
        const idx = tagStack.lastIndexOf(tagName);
        if (idx !== -1) tagStack.splice(idx, 1);
      } else {
        tagStack.push(tagName);
      }
    }
    //console.warn(tagStack)
    return tagStack;
  }
}

let pendingHTML = null;
let accumulatedContent = ""; // variable to store tokens for the currently streaming paragraph

function handleSocketOpening(socket) {
  console.log("WebSocket opened to server:", serverUrl);
  $("#reconnectButton").hide();
  $("#disconnectButton").show();
  const username = $("#usernameInput").val();
  //console.debug(`connected as ${username}`);
  $("#messageInput")
    .prop("disabled", false)
    .prop("placeholder", "Message the User Chat")
    .removeClass("disconnected");
  $("#AIMessageInput")
    .prop("disabled", false)
    .prop("placeholder", "Message the AI Chat")
    .removeClass("disconnected");
  util.heartbeat(socket);
}

function disconnectWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log("WebSocket disconnected from server:", serverUrl);
    $("#reconnectButton").show();
    $("#disconnectButton").hide();
    $("#userList ul").empty();
    $("#messageInput")
      .prop("disabled", true)
      .prop("placeholder", "DISCONNECTED")
      .addClass("disconnected");
    $("#AIMessageInput")
      .prop("disabled", true)
      .prop("placeholder", "DISCONNECTED")
      .addClass("disconnected");
    socket.close();
  }
}

//MARK:AIRetry/sendToAIChat
function doAIRetry() {
  if (currentlyStreaming) {
    console.debug("currentlyStreaming = true, canceling retry attempt.");
    return;
  }
  const isLastMesFromAI = $("#AIChat").children("div").last().attr("data-entityType") === "AI";
  console.debug($("#AIChat").children().last());
  console.debug("isLastMesFromAI: ", isLastMesFromAI);

  if (!isLastMesFromAI) {
    console.warn("last message not from AI, canceling retry attempt.");
    alert("Last message not from AI, canceling retry attempt.");
    return
  }

  let char = $("#cardList").val();
  let username = $("#AIUsernameInput").val()
  let retryMessage = {
    type: "AIRetry",
    chatID: "AIChat",
    UUID: myUUID,
    username: username,
    char: char,
    mesID: $("#AIChat").children("div").last().attr("data-messageID"),
    sessionID: $("#AIChat").children("div").last().attr("data-sessionID"),
  };

  util.messageServer(retryMessage);
}

async function sendMessageToAIChat(type) {

  var messageInput = $("#AIMessageInput");
  /*   if (messageInput.val().trim() === "" && type !== "forced") {
      alert("Can't send empty message!");
      return;
    } */

  username = $("#AIUsernameInput").val();
  var content = `${messageInput.val()}`;
  var websocketRequest = {
    type: "chatMessage",
    chatID: "AIChat",
    UUID: myUUID,
    username: username,
    userInput: content,
  };
  localStorage.setItem("AIChatUsername", username);
  util.messageServer(websocketRequest);
  messageInput.val("").trigger("focus");
}

let isDisconnecting = false;
// Send a disconnect message to the server before unloading the page
window.addEventListener("beforeunload", () => {
  if (!isDisconnecting) {
    disconnectWebSocket();
    isDisconnecting = true;
  }
});

async function callCharDefPopup() {
  const whichChar = $("#cardList").val()
  let charDefs = await getCharDefs(whichChar)
  await showCharDefs(charDefs, whichChar)

  async function getCharDefs(whichChar) {

    const charDefRequestMessage = {
      type: 'displayCharDefs',
      UUID: myUUID,
      value: whichChar
    }

    return new Promise((resolve, reject) => {
      const messageContentHandler = (response) => {
        let responseDataJSON = JSON.parse(response.data)
        console.log(responseDataJSON)
        socket.removeEventListener('message', messageContentHandler);
        resolve(responseDataJSON.content);
      };

      socket.addEventListener('message', messageContentHandler);
      socket.send(JSON.stringify(charDefRequestMessage));
    });
  }

  //MARK: showCharDefs
  async function showCharDefs(charDefs, whichChar) {
    const width = isPhone ? $(window).width() - 10 : $("#contentWrap").width();
    const height = isPhone ? $(window).height() - 10 : $("#contentWrap").height();
    const layoutClass = isPhone ? 'flexFlowCol' : '';
    const firstMesDynamicDimension = isPhone ? 'height' : 'width';
    const parsedDefs = JSON.parse(charDefs);

    console.log(parsedDefs);

    const $popup = $(`
    <div id="charDefPopup" class="flexbox flexFlowCol">
      <div class="flexbox flexFlowCol">
        <small>
        Best practice is to only put immutable traits in the description field.<br>
        Information that might change over the course of a chat should be put in the Control Panel's D4 or D1 'Insertions' boxes.<br>
        Legacy data shown for awareness only. If you want to use that info, copy it into the Description box.<br>
        
        </small>        
        <span id="rightSideHint"><span class="bgTransparent square1p5em fontSize1p25em greyscale bgBrightUp textshadow transition250 nonButtonButton">👁️</span> Show legacy defs</span>
      </div>

      <div class="flexbox flex1 marginTop5 ${layoutClass} overflowYHidden">

        <div id="leftSide" class="flexbox flexFlowCol flex1 transition250 ">

          <div class="flexbox flexFlowCol ">
            Name
            <textarea id="charDefsName" class="JQUIPopupInput" rows="1"></textarea>
          </div>

          <div class="flexbox flexFlowCol flex2 ">
            Description
            <textarea id="charDefsDesc" class="JQUIPopupInput flex1"></textarea>
          </div>

          <div class="flexbox flexFlowCol flex1p5 ">
            First Message
            <textarea id="charDefsFirstMessage" class="JQUIPopupInput flex1"></textarea>
          </div>

          <div class="legacyDef flexbox flexFlowCol flex1 "> 
            Personality <small>(read-only legacy value, not used by STMP)</small>
            <textarea id="charDefsPersonality" class="JQUIPopupInput flex1 greyText"></textarea>
          </div>

          <div class="legacyDef flexbox flexFlowCol flex1 " >
            Scenario <small>(read-only legacy value, not used by STMP)</small>
            <textarea id="charDefsScenario" class="JQUIPopupInput flex1 greyText"></textarea>
          </div>

        </div>

        <div id="rightSide" class="flexbox flexFlowCol flex1 transition250">

          <div class="flexbox flexFlowCol flex1 ">
            Embedded Lorebook <small>(read-only, not used by STMP)</small>
            <textarea id="foundWorldInfo" class="JQUIPopupInput flex1 greyText"></textarea>
          </div>

          <div class="legacyDef flexFlowCol flexbox flex1 " >
            Example Messages <small>(read-only legacy value, not used by STMP)</small>
            <textarea id="charDefsMesExamples" class="JQUIPopupInput flex1 greyText"></textarea>
          </div>
          
        </div>
      </div>
    </div>
  `);

    $popup.dialog({
      show: { effect: 'fade', duration: 250 },
      hide: false, // we handle fade out ourselves
      width,
      height,
      draggable: false,
      resizable: false,
      modal: true,
      title: `${parsedDefs.name}'s Character Definitions`,
      position: { my: "center", at: "center", of: window },
      buttons: {
        Save() {
          parsedDefs.name = $("#charDefsName").val();
          parsedDefs.description = $("#charDefsDesc").val();
          parsedDefs.first_mes = $("#charDefsFirstMessage").val();

          util.messageServer({
            type: 'charEditRequest',
            UUID: myUUID,
            char: whichChar,
            newCharDefs: parsedDefs
          });

          $(this).dialog("close");
        },
        Cancel() {
          $(this).dialog("close");
        }
      },
      open() {
        $('.ui-widget-overlay').hide().fadeIn(250);

        /*
        $("#charDefsName").val(parsedDefs?.data?.name || parsedDefs.name || 'No name found??');
        $("#charDefsDesc").val(parsedDefs?.data?.description || parsedDefs.description || '');
        $("#charDefsFirstMessage").val(parsedDefs?.data?.first_mes || parsedDefs.first_mes || '');
        */


        //this is not a fix. We are only writing to the base level of tExt, so we must read from it as well
        //need to figure out how to write into the data level
        $("#charDefsName").val(parsedDefs?.data?.name || 'No name found??');
        $("#charDefsDesc").val(parsedDefs?.data?.description || '');
        $("#charDefsFirstMessage").val(parsedDefs.data?.first_mes || '');
        $("#charDefsPersonality").val(parsedDefs?.data?.personality || '');
        $("#charDefsScenario").val(parsedDefs?.data?.scenario || '');

        let mesExamples = parsedDefs?.data?.mes_example || '';
        $("#charDefsMesExamples").html(mesExamples || '');


        const foundWorldInfo = parsedDefs?.data?.character_book?.entries;
        let combinedEntries = '';
        if (foundWorldInfo) {
          for (const numberedKey in foundWorldInfo) {
            console.warn('foundWorldInfo[numberedKey]', foundWorldInfo[numberedKey]);
            let id = foundWorldInfo[numberedKey].id;
            let key = foundWorldInfo[numberedKey].keywords;
            let content = foundWorldInfo[numberedKey].content;
            let comment = foundWorldInfo[numberedKey].comment;
            if (!content) {
              continue;
            }
            if (!comment) {
              comment = 'No Name';
            }
            if (!key) {
              key = 'No Keywords';
            }
            combinedEntries += `#${id} ${comment} (${key}) : ${content}\n\n`;
          }
          $("#foundWorldInfo").val(combinedEntries);
        }

        //$("#rightSide").hide();
        $(".legacyDef").hide();

        $("#rightSideHint").off('click').on('click', async function () {
          util.betterSlideToggle($(".legacyDef"), 250, "height", true);

        });

        $(".ui-button").trigger("blur");
      },
      beforeClose(event, ui) {
        const $content = $(this); // #charDefPopup
        const $dialogWrapper = $content.closest('.ui-dialog'); // includes title bar, buttons
        const $overlay = $('.ui-widget-overlay');

        if ($dialogWrapper.is(':visible')) {
          event.preventDefault(); // prevent jQuery UI from closing immediately

          // Run both fadeOuts in parallel, then destroy dialog after both finish
          $.when(
            $dialogWrapper.fadeOut(250),
            $overlay.fadeOut(250)
          ).done(() => {
            $content.dialog("destroy").remove();
          });

          return false; // still required to block default close
        }
      },
      close() { } // Required to avoid default behavior interfering
    });
  }

}

//MARK: disableButtons

const disableableButtons = [
  "#AISendButton",
  "#deleteLastMessageButton",
  "#triggerAIResponse",
  "#AIRetry",
  "#toggleMode",
  ".messageEdit",
  ".messageDelete",
  "#clearAIChat",
  "#clearUserChat"

];

function disableButtons() {

  disableableButtons.forEach(selector => {
    const $element = $(selector);
    if ($element.length) {
      $element.prop("disabled", true).addClass("disabled");
      //console.warn(`Disabled ${selector}: ${$element.prop("disabled")}`);
    } else {
      console.warn(`Element ${selector} not found in DOM`);
    }
  });
}

function enableButtons() {

  disableableButtons.forEach(selector => {
    const $element = $(selector);
    if ($element.length) {
      /*       console.debug(`Enabled ${selector}:`, {
              disabledProp: $element.prop('disabled'),
              disabledAttr: $element.attr('disabled'),
              hasDisabledClass: $element.hasClass('disabled'),
              isCheckbox: $element.is('input[type="checkbox"]'),
              html: $element[0]?.outerHTML || 'Not found'
            }); */

      if ($element.prop('disabled') == true) $element.prop('disabled', false);
      if ($element.attr('disabled') == true) $element.removeAttr('disabled')
      if ($element.hasClass('disabled')) $element.removeClass('disabled')

      /*       console.debug(`Enabled ${selector}:`, {
              disabledProp: $element.prop('disabled'),
              disabledAttr: $element.attr('disabled'),
              hasDisabledClass: $element.hasClass('disabled'),
              isCheckbox: $element.is('input[type="checkbox"]'),
              html: $element[0]?.outerHTML || 'Not found'
            }); */
    } else {
      console.warn(`Element ${selector} not found in DOM`);
    }
  });

  console.debug('Re-enabled buttons');

  /*   setTimeout(() => {
      console.debug('Checking button states after delay:', {
        isStreaming: {
          disabledProp: $("#isStreaming").prop('disabled'),
          disabledAttr: $("#isStreaming").attr('disabled'),
          html: $("#isStreaming")[0]?.outerHTML || 'Not found'
        },
        isAutoResponse: {
          disabledProp: $("#isAutoResponse").prop('disabled'),
          disabledAttr: $("#isAutoResponse").attr('disabled'),
          html: $("#isAutoResponse")[0]?.outerHTML || 'Not found'
        },
        D4CharDefs: {
          disabledProp: $("#D4CharDefs").prop('disabled'),
          disabledAttr: $("#D4CharDefs").attr('disabled'),
          html: $("#D4CharDefs")[0]?.outerHTML || 'Not found'
        }
      });
    }, 100); */
}

function verifyCheckboxStates() {
  const checkboxes = ['#isStreaming', '#isAutoResponse', '#D4CharDefs'];
  //console.debug('Checking checkbox states at page load:');
  checkboxes.forEach(selector => {
    const $element = $(selector);
    if ($element.length) {
      /*       console.debug(`State for ${selector}:`, {
              readonlyProp: $element.prop('readonly'),
              readonlyAttr: $element.attr('readonly'),
              disabledProp: $element.prop('disabled'),
              disabledAttr: $element.attr('disabled'),
              classes: $element.attr('class'),
              html: $element[0]?.outerHTML || 'Not found'
            }); */
    } else {
      console.warn(`Checkbox ${selector} not found in DOM at page load`);
    }
  });

  // Monitor changes to readonly
  checkboxes.forEach(selector => {
    $(selector).on('change readonlyModified', function () {
      console.debug(`Checkbox ${selector} modified:`, {
        readonlyProp: $(this).prop('readonly'),
        readonlyAttr: $(this).attr('readonly'),
        disabledProp: $(this).prop('disabled'),
        when: new Date().toISOString()
      });
    });
  });
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Listeners
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//MARK:listeners
$(async function () {

  console.debug('Document ready');
  verifyCheckboxStates();

  isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  isMobileViewport = window.matchMedia('(max-width: 999px)').matches;
  isPhone = util.isPhone();

  console.debug(`Is this a phone? ${isPhone} : ${navigator.userAgent}`);
  console.debug(`Is this a touch device? ${isTouchDevice} : onTouchStart? ${'ontouchstart' in window} maxTouchPoints? ${navigator.maxTouchPoints > 0}`)
  console.debug(`Is this a mobile viewport? ${isMobileViewport} : ${$(document).innerWidth()}`);


  const $chatWrap = $("#chatWrap")
  const $AIChatInputButtons = $("#AIChatInputButtons");
  const $userChatInputButtons = $("#userChatInputButtons");

  let { username, AIChatUsername } = await startupUsernames();
  //console.log("Startup Usernames:", username, AIChatUsername);
  $("#usernameInput").val(username);
  $("#AIUsernameInput").val(AIChatUsername);

  if (!util.isPhone()) {
    $("#userChat").css('min-width', ($("#OOCChatWrapper").width() / 2) - 10);
    $("#AIChat").css('min-width', ($("#LLMChatWrapper").width() / 2) - 10);
  }

  connectWebSocket(username);

  $("#reconnectButton")
    .off("click")
    .on("click", function () {
      connectWebSocket();
    });
  $("#disconnectButton")
    .off("click")
    .on("click", function () {
      disconnectWebSocket();
    });

  $("#submitkey")
    .off("click")
    .on("click", async function () {
      $(".universalCentralControls").css('opacity', '0');
      await util.delay(125);
      $("#roleKeyInputDiv").css("height", "unset");
      util.betterSlideToggle($("#roleKeyInputDiv"), 250, "height", true);
      //$("#roleKeyInput").trigger("focus");
    });

  $('#refreshBtn')
    .off('click')
    .on('click', function () {
      location.reload(true);
    });

  $("#roleKeyInput").on("input", function () {
    if ($(this).val().length === 32) {
      control.submitKey();
    }
  });

  // Send a message to the user chat
  $("#sendButton").off("click").on("click", function () {
    console.debug("sendButton clicked");


    if ($(this).hasClass("disabledButton")) {
      console.warn("sendButton is disabled");
      return;
    }

    if ($("#usernameInput").val().trim() === "") {
      alert("Can't send chat message with no username!");
      return;
    }
    var messageInput = $("#messageInput");
    if (messageInput.val().trim() === "") {
      //alert("Can't send empty message!");
      messageInput.trigger("focus");
      console.warn("Can't send empty message to User Chat!");
      return;
    }

    $(this).addClass("disabledButton").text("🚫");
    setTimeout(() => {
      $(this).removeClass("disabledButton").text("✏️");
    }, userChatDelay);

    username = $("#usernameInput").val();
    var content = `${messageInput.val()}`;
    //var htmlContent = converter.makeHtml(markdownContent);
    var messageObj = {
      type: "chatMessage",
      chatID: "userChat",
      UUID: myUUID,
      username: username,
      content: content,
    };
    localStorage.setItem("username", username);
    util.messageServer(messageObj);
    messageInput.val("");
    messageInput.trigger("focus").trigger("input");
  });

  $("#triggerAIResponse").off("click").on("click", function () {
    console.debug('saw force trigger for AI response click')
    sendMessageToAIChat("forced");

  });

  $("#AIRetry").off("click").on("click", function () {
    console.debug('saw AI retry click')

    doAIRetry();
  });

  //A clickable icon that toggles between Text Completions and horde mode, 
  //swaps the API parameters, and updates the UI and server to reflect the change.
  $("#toggleMode").off("click").on("click", async function () {
    let newMode = $("#toggleMode").hasClass("hordeMode") ? "TC" : "horde";
    await handleconfig.setEngineMode(newMode)

    let modeChangeMessage = {
      type: "modeChange",
      UUID: myUUID,
      newMode: newMode,
    };
    util.messageServer(modeChangeMessage);
  });

  $("#usernameInput, #AIUsernameInput").on("keyup", function () {
    const $input = $(this);
    const input = $input.val().trim();
    const result = validateUserName(input);
    $input.css('background-color', result.success ? '#2f7334' : '#781e2d');
  });

  $("#usernameInput, #AIUsernameInput").on("blur", function () {
    console.warn("Saw username input blur:", this.id);
    const oldUsername = localStorage.getItem("username") || "";
    const oldAIChatUsername = localStorage.getItem("AIChatUsername") || "";
    const currentUsernameResult = validateUserName($("#usernameInput").val().trim());
    const AIChatUsernameResult = validateUserName($("#AIUsernameInput").val().trim());

    // Save and notify server if both are valid and at least one has changed
    if (
      currentUsernameResult.success &&
      AIChatUsernameResult.success &&
      (oldUsername !== currentUsernameResult.username || oldAIChatUsername !== AIChatUsernameResult.username)
    ) {
      console.debug("Notifying server of username change...");
      localStorage.setItem("username", currentUsernameResult.username);
      localStorage.setItem("AIChatUsername", AIChatUsernameResult.username);
      control.updateUserName(
        myUUID,
        currentUsernameResult.username,
        oldUsername,
        AIChatUsernameResult.username,
        oldAIChatUsername
      );
      util.flashElement("usernameInput", "good");
      // Reset both inputs' backgrounds to default after successful update
      $("#usernameInput, #AIUsernameInput").css('background-color', '');
      myUsername = currentUsernameResult.username;
      myAIChatUsername = AIChatUsernameResult.username;
      $("#AIChatUserNameHolder").text(myAIChatUsername);
      $("#userChatUserNameHolder").text(myUsername);
    } else {
      console.warn("Username update skipped:", {
        currentUsernameValid: currentUsernameResult.success,
        AIChatUsernameValid: AIChatUsernameResult.success,
        usernameChanged: oldUsername !== currentUsernameResult.username,
        AIChatUsernameChanged: oldAIChatUsername !== AIChatUsernameResult.username
      });
      // Keep current colors (no reset)
    }
  });

  $("#AISendButton").off("click").on("click", async function () {
    if ($(this).hasClass("disabledButton") || currentlyStreaming) {
      console.warn('Cannot send message while AI is generating response. "disabledButton"?: ', $(this).hasClass("disabledButton"), "currentlyStreaming?: ", currentlyStreaming);
      alert("AI is currently generating a response, please wait.");
      return;
    }

    if ($("#AIUsernameInput").val().trim() === "") {
      console.warn(`Can't send empty message to AI Chat!`)
      return
    }

    if ($("#AIUsernameInput").val().trim() === "") {
      alert("Can't send chat message with no username!");
      return;
    }

    await sendMessageToAIChat();
    $("#AIMessageInput").trigger("input"); //this resets the input height

    $(this).addClass("disabledButton").text("🚫");
    setTimeout(() => {
      $(this).removeClass("disabledButton").text("✏️");
    }, AIChatDelay);
  });


  $("#clearUserChat").off("click").on("click", function () {
    console.warn('saw clear chat click');

    util.clearChatWithCountdown('manual', 'start', "#userChat", isHost, () => {
      //console.warn("userChat Clear Timer Completed");
    });
  });

  $("#clearAIChat").off("click").on("click", function () {
    if (currentlyStreaming) {
      console.warn(`can't clear chat while AI is generating response`);
    }
    util.clearChatWithCountdown('manual', 'start', "#AIChat", isHost, () => {
      //console.warn("AI Clear Chat Timer Completed");
    });
  });

  $("#deleteLastMessageButton").off("click").on("click", function () {
    console.debug("deleting last AI Chat message");
    const delLastMessage = {
      type: "deleteLast",
      UUID: myUUID,
    };
    util.messageServer(delLastMessage);
  });

  $("#clearLocalStorage").on("click", function () {
    $("<div></div>")
      .dialog({
        draggable: false,
        resizable: false,
        modal: true,
        position: { my: "center", at: "center top+25%", of: window },
        title: "Delete user data?",
        buttons: {
          Ok: function () {
            $("#usernameInput").val("");
            $("#AIUsernameInput").val("");
            localStorage.clear();
            alert("Deleted saved usernames!");
            $(this).dialog("close");
          },
          Cancel: function () {
            $(this).dialog("close");
          },
        },
        open: function () {
          $(".ui-button").trigger("blur");
        },
        close: function () { },
      })
      .html(
        "This will clear your saved usernames and unique ID.<br><br><b style='color: #cd334d;'>!! You will lose any roles you had !!"
      );
  });

  /*   if (
      window.matchMedia("(orientation: landscape)").matches &&
      /Mobile/.test(navigator.userAgent)
    ) {
      if (isIOS) {
        $("body").css({
          "padding-left": "0px",
          "padding-right": "0px",
          width: "100sfw",
          height: "calc(100svh - 5px)",
        });
        $(".bodyWrap").css({
          gap: "5px",
        });
        $(".fontSize1p5em")
          .addClass("fontSize1p25em")
          .removeClass("fontSize1p5em");
        $(".fontSize1p25em")
          .css("width", "2em")
          .css("height", "2em")
          .css("line-height", "2em")
          .css("padding", "0");
      }
    }
  
    if (util.isPhone() && isIOS) {
      $("body").css({
        "padding-left": "0px",
        "padding-right": "0px",
        width: "100sfw",
        height: "calc(100svh - 15px)",
      });
    } */


  $("#messageInput").on("keypress", function (event) {
    util.enterToSendChat(event, "#sendButton");
  });
  $("#AIMessageInput").on("keypress", function (event) {
    util.enterToSendChat(event, "#AISendButton");
  });

  $("#showPastChats").on("click", function () {
    console.debug("requesting past chat list");
    const pastChatListRequest = {
      UUID: myUUID,
      type: "pastChatsRequest",
    };
    util.messageServer(pastChatListRequest);
  });

  $(document).on("mouseup", async function (e) {
    var $target = $(e.target);
    if (!$target.is("#roleKeyInput") && $("#roleKeyInputDiv").hasClass("needsReset")) {
      util.betterSlideToggle($("#roleKeyInputDiv"), 250, "height", true);
      $(".universalCentralControls").css('opacity', '1');
    }
    if (!$target.is('#hostToast') && isPhone) $("#hostToast").trigger('mouseleave');
  });

  $("#controlPanelToggle, #userListsToggle").off("click").on("click", async function () {
    const $controlPanel = $("#controlPanel");
    const $userListsWrap = $("#userListsWrap");

    if (util.isPhone() || isMobileViewport) {
      const isControlPanelToggle = $(this).is("#controlPanelToggle");
      const $show = isControlPanelToggle ? $controlPanel : $userListsWrap;
      const $hide = isControlPanelToggle ? $userListsWrap : $controlPanel;

      const isCurrentlyVisible = (!$show.hasClass("hidden") && !$show.hasClass("opacityZero")) || $show.is(":visible");

      // If the target is already visible, just hide it
      if (isCurrentlyVisible) {
        await util.fadeSwap({ hide: $show });
      } else {
        await util.fadeSwap({ show: $show, hide: $hide });
      }
    } else {
      const $target = $(this).is("#controlPanelToggle") ? $controlPanel : $userListsWrap;
      $target.toggleClass("opacityZero");
    }
  });

  var chatsToggleState = 0;
  const $LLMChatWrapper = $("#LLMChatWrapper");
  const $OOCChatWrapper = $("#OOCChatWrapper");
  const $contentWrapBodyWrap = $("#contentWrap, #bodyWrap");
  const $body = $("body");
  //MARK: chatsToggle
  $("#chatsToggle").off("click").on("click", async function () {

    let isDesktop = !util.isPhone() && !isMobileViewport;
    chatsToggleState = (chatsToggleState + 1) % 3;

    if (chatsToggleState === 0) {
      // Dual chat view
      if (isDesktop) $("#controlPanel, #userListsWrap").removeClass("width25vw");
      $LLMChatWrapper.removeClass("hidden");
      await util.delay(1);
      $LLMChatWrapper.css({ flex: "1" });
      await util.delay(251);
      if (isDesktop) $contentWrapBodyWrap.css('width', '70vw')

      $LLMChatWrapper.css({ opacity: "1" });
    } else if (chatsToggleState === 1) {
      // AI chat only
      if (isDesktop) $contentWrapBodyWrap.css('width', '50vw')
      $OOCChatWrapper.css({ flex: "0", opacity: "0" });
      $LLMChatWrapper.css({ flex: "1", opacity: "1" });

      await util.delay(251);
      if (isDesktop) $("#controlPanel, #userListsWrap").addClass("width25vw");
      $OOCChatWrapper.addClass("hidden").css({ flex: "1" }); //preload flex for next switch

    } else if (chatsToggleState === 2) {
      // OOC chat only
      $LLMChatWrapper.css({ opacity: "0" });
      await util.delay(251);
      $OOCChatWrapper.removeClass("hidden");
      await util.delay(1);
      $LLMChatWrapper.addClass("hidden").css({ flex: "0" });
      $OOCChatWrapper.css({ opacity: "1" });
    }
  });

  //this auto resizes the chat input box as the input gets longer
  $("#AIMessageInput, #messageInput").on("input", function () {
    const activeInputboxID = this.id;
    const isAIMessageInput = activeInputboxID === "AIMessageInput";
    const chatBlock = isAIMessageInput ? $LLMChatWrapper : $OOCChatWrapper;
    const inputButtons = isAIMessageInput
      ? $AIChatInputButtons
      : $userChatInputButtons;

    const paddingRight = inputButtons.outerWidth() + 5 + "px";
    const maxHeight = chatBlock.outerHeight() / 2 + "px";

    $(this).css({
      "max-height": maxHeight,
      "padding-right": paddingRight,
    });

    this.style.height = ""; // Reset height to default value
    this.style.height = this.scrollHeight + "px"; // Set height based on content

    if (navigator.userAgent.toLowerCase().indexOf("firefox") === -1) {
      const scrollHeight = chatBlock.prop("scrollHeight");
      const scrollTop = chatBlock.prop("scrollTop");
      const outerHeight = chatBlock.outerHeight();
      const originalScrollBottom = scrollHeight - (scrollTop + outerHeight);
      const newScrollTop = Math.max(
        scrollHeight - (outerHeight + originalScrollBottom),
        0
      );
      chatBlock.prop("scrollTop", newScrollTop);
    }
  });

  AIChatDelay = $("#AIChatInputDelay").val() * 1000;
  userChatDelay = $("#userChatInputDelay").val() * 1000;

  $("#editAPIButton").on("click", function () {
    control.enableAPIEdit();
    util.betterSlideToggle($("#promptConfig"), 250, "height");
    util.betterSlideToggle($("#APIConfig"), 250, "height");
  });

  $("#deleteAPIButton").on("click", function () {
    handleconfig.deleteAPI();
  });

  $("#saveAPIButton").on("click", async function () {
    await handleconfig.addNewAPI();
  });
  $("#testAPIButton").on("click", function () {
    control.testNewAPI();
  });

  $("#cancelAPIEditButton").on("click", function () {
    util.betterSlideToggle($("#promptConfig"), 250, "height");
    util.betterSlideToggle($("#APIConfig"), 250, "height");
    //select the second option if we cancel out of making a new API
    //this is not ideal and shuld really select whatever was selected previous before 'add new api' was selected.
    if ($("#apiList").val() === "APIConfig") {
      $("#apiList option:eq(1)").prop("selected", "width");
    }
  });

  $("#modelListRefreshButton").on("click", async function () {
    await control.getModelList();
  });

  $("#modelLoadButton").on("click", async function () {
    await control.tryForceModelLoad();
  });

  $("#modelList").on("input", function () {

    let selectedModel = $(this).find(`option:selected`).val();
    const modelSelectMessage = {
      type: "modelSelect",
      UUID: myUUID,
      value: selectedModel,
    };
    if (initialLoad === true) { return } else {
      util.messageServer(modelSelectMessage);
    }

    util.flashElement("modelList", "good");
  });

  $("#charListRefresh").on("click", async function () {
    await control.getCharList();
  });

  /*   $("#controlPanel > div > div > .isControlPanelToggle").on("click", function () {
      util.toggleControlPanelBlocks($(this), "all");
    }); */

  $(`.isControlPanelToggle i,
    #crowdControlToggle i`).on("click", function () {
    util.toggleControlPanelBlocks($(this), "single");
  });

  $("#AIChat").on(
    "scroll",
    util.debounce(function () {
      if (!$("#AIChat").not(":focus")) {
        return;
      }
      isUserScrollingAIChat = true;
      clearTimeout(AIChatScrollTimeout);
      //timer to reset the scrolling variable, effectively detecting the scroll is done.
      AIChatScrollTimeout = setTimeout(function () {
        isUserScrollingAIChat = false;
      }, 250);
    }, 100)
  );

  $("#userChat").on(
    "scroll",
    util.debounce(function () {
      if (!$("#userChat").not(":focus")) {
        return;
      }
      isUserScrollingUserChat = true;
      clearTimeout(userChatScrollTimeout);
      //timer to reset the scrolling variable, effectively detecting the scroll is done.
      userChatScrollTimeout = setTimeout(function () {
        isUserScrollingUserChat = false;
      }, 250);
    }, 100)
  );

  $('.chatSweep').off('click').on('click', async function () {
    //clears the display of a chat window for the user
    //but has no effect on the server or other users.
    //intended to prevent users from suffering slowdown from a large number of messages.
    const $button = $(this);
    const $targetChat = $button.parent().parent().find('.chatWindow');
    $targetChat.addClass('transition250 opacityZero');
    await util.delay(250);
    $targetChat.empty()
    $targetChat.removeClass('opacityZero');
    //await util.delay(250);
    await util.flashElement($targetChat.prop('id'), 'good')
  });

  //listener for mobile users that detects change in visiible of the app.
  //it checks the websocket's readyState when the app becomes visible again
  //and provides immediate feedback on whether the websocket is still open or if
  //they have been disconnected while the app was invisible.
  document.addEventListener("visibilitychange", async function () {
    // Check WebSocket status immediately when the app becomes visible
    if (socket && socket.readyState !== WebSocket.OPEN) {
      console.log("App became visible, and the socket is disconnected");
      $("#reconnectButton").show();
      $("#disconnectButton").hide();
      $("#userList ul").empty();
      $("#messageInput")
        .prop("disabled", true)
        .prop("placeholder", "DISCONNECTED")
        .addClass("disconnected");
      $("#AIMessageInput")
        .prop("disabled", true)
        .prop("placeholder", "DISCONNECTED")
        .addClass("disconnected");
    }
  });

  $(window).on("resize", async function () {
    // util.correctSizeBody(util.isPhone(), isIOS);
  });

  if (util.isPhone() || isMobileViewport) {
    isLandscape = util.checkIsLandscape();
    await util.delay(10)
    // await util.correctSizeBody(isPhone, isIOS);
  }

  //close the past chats on page load
  //util.toggleControlPanelBlocks($("#pastChatsToggle"), "single");
  $(".unavailable-overlay").attr("title", "This feature is not yet available.");
  $("#charDefsPopupButton").on('click', function () { callCharDefPopup() })

  const $aiChatDropZone = $("#AIChat");

  const $llmChatWrapper = $("#LLMChatWrapper");
  const $aiChat = $("#AIChat");

  $aiChat.on("dragover", function (e) {
    e.preventDefault();
    e.stopPropagation();

    const visibleHeight = $aiChat.outerHeight(); // or use a fixed height if preferred
    //$("#AIChatDropOverlay").css("height", visibleHeight);
    $llmChatWrapper.addClass("dragover");
  });

  $aiChat.on("dragleave drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
    $llmChatWrapper.removeClass("dragover");
  });

  $aiChatDropZone.on("dragleave", function (e) {
    e.preventDefault();
    e.stopPropagation();
    //$("#AIChatDropOverlay").css('opacity', '0');
  });

  // Declare lastUploadTime outside the event listener to persist across events
  let lastUploadTime = null;
  const COOLDOWN_MS = 60 * 1000; // 1 minute in milliseconds

  $aiChatDropZone.on("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();

    const $overlay = $("#AIChatDropOverlay");
    //$overlay.css('opacity', '0');
    //setTimeout(() => $overlay.remove(), 250);

    // Cooldown check
    if (lastUploadTime && Date.now() - lastUploadTime < COOLDOWN_MS) {
      hostToast.showHostToast("Please wait a minute before uploading again.", 'System');
      return;
    }

    const files = e.originalEvent.dataTransfer.files;
    if (files.length > 1) {
      hostToast.showHostToast("Upload one card at a time please!", 'System');
      return;
    }

    for (let file of files) {
      if (file.type !== "image/png") {
        hostToast.showHostToast(`${file.name} failed: Only PNG files allowed.`, 'System');
        continue;
      }
      if (file.size > 1024 * 1024) {
        hostToast.showHostToast(`${file.name} failed: File too large (max 1MB).`, 'System');
        continue;
      }

      const reader = new FileReader();
      reader.onload = function (event) {
        const uploadMessage = {
          type: "fileUpload",
          UUID: myUUID,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          content: event.target.result.split(',')[1]
        };
        socket.send(JSON.stringify(uploadMessage));
        // Update last upload time after successful processing
        lastUploadTime = Date.now();
      };
      reader.readAsDataURL(file);
    }
  });
});

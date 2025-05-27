import control from "./src/controls.js";
import util from "./src/utils.js";
import handleconfig from './src/handleconfig.js'

export var username,
  isAutoResponse,
  isStreaming, //defined by the 'streaming' toggle
  isClaude,
  contextSize,
  responseLength,
  isPhone,
  isLandscape;
export var currentlyStreaming = false; //set true when streamed response is incomine, and false when not.
export var myUUID, myUsername;
export var socket = null;
export var isUserScrollingAIChat = false;
export var isUserScrollingUserChat = false;
let UserChatScrollTimeout, AIChatScrollTimeout;

var doKeepAliveAudio = false;
var isKeepAliveAudioPlaying = false;
var keepAliveAudio = new Audio("silence.mp3");

export var isHost;
var AIChatDelay, userChatDelay, allowImages;

//this prevents selectors from firing off when being initially populated
var initialLoad = true;
//MARK: startupUserName
async function startupUsernames() {
  console.debug(`[startupUsernames]>> GO`);

  async function initializeUsername() {
    console.debug(`[initializeUsername]>> GO`);
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
  const storedAIChatUsername = localStorage.getItem("AIChatUsername");
  const username =
    storedUsername && storedUsername !== ""
      ? storedUsername
      : await initializeUsername();
  const myUUID = localStorage.getItem("UUID") || "";
  const AIChatUsername =
    storedAIChatUsername && storedAIChatUsername !== ""
      ? storedAIChatUsername
      : username;

  console.debug(
    `[localStorage] username:${username}, AIChatUsername:${AIChatUsername}`
  );

  return { username, AIChatUsername };
}

//MARK:validateUserName
export function validateUserName(username) {
  console.debug('validateUserName input:', username, 'Type:', typeof username);
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


/* var sanitizeExtension = {
  type: "output",
  filter: function (text) {

    let forbiddenTags = ["style", "audio", "script", "iframe", "object", "embed", "form", "input", "select",
      "button", "marquee", "blink", "font"];
    console.warn('allowImages sanitize init: ', allowImages)
    if (allowImages === false) {
      console.warn('checking for images...')
      const imageRegex = /<img\b[^>]*>/gi;
      const hasImage = imageRegex.test(text);
      console.warn('text: ', text)
      console.warn('hasImage: ', hasImage)

      if (hasImage) {
        console.warn('removing images..')
        text = text.replace(imageRegex, '>>haha embed fail, laugh at this user<<');
      }
      console.warn('After text: ', text)
      forbiddenTags.push("img");
    } else {
      forbiddenTags = forbiddenTags.filter(tag => tag !== "img");

    }

    const sanitizedHTML = DOMPurify.sanitize(text, {
      FORBID_TAGS: forbiddenTags,
      FORBID_ATTR: ["onload", "onclick", "onmouseover", "srcdoc", "data-*", "style", "color", "bgcolor"]
    });

    return sanitizedHTML;
  },
};


var quotesExtension = function () {
  var regexes = [
    { regex: /â|â/g, replace: '"' },
    { regex: /â¦/g, replace: "..." },
    { regex: /Ã¢ÂÂ¦/g, replace: "..." },
    { regex: /â/g, replace: "'" },
    { regex: /ÃÂ¢ÃÂÃÂ/g, replace: "'" },
    { regex: /Ã¢ÂÂ/g, replace: "'" },
    { regex: /(?<!<[^>]+)"([^"]*)"(?![^<]*>)/g, replace: "<q>$1</q>" }, //double quotes, but not those within <tags like="these">
    { regex: /“([^“”]*)”/g, replace: '<q class="invisible-quotation">"$1"</q>', },
    { regex: /‘([^‘’]*)’/g, replace: "<q class=\"invisible-quotation\">'$1'</q>", },
    { regex: /â([^(ââ]*)â/g, replace: "<q class=\"invisible-quotation\">'$1'</q>", },
    { regex: /«([^«»]*)»/g, replace: '<q class="invisible-quotation">«$1»</q>', },
    { regex: /「([^「」]*)」/g, replace: '<q class="invisible-quotation">「$1」</q>', },
    { regex: /『([^『』]*)』/g, replace: '<q class="invisible-quotation">『$1』</q>', },
    { regex: /【([^【】]*)】/g, replace: '<q class="invisible-quotation">【$1】</q>', },
    { regex: /《([^《》]*)》/g, replace: '<q class="invisible-quotation">《$1》</q>', },
  ];

  return regexes.map(function (rule) {
    return {
      type: "output",
      regex: rule.regex,
      replace: rule.replace,
    };
  });
};

var BRTagsToParagraphTags = function () {
  var regexes = [{ regex: /<br>/g, replace: "</p><p>" }];

  return regexes.map(function (rule) {
    return {
      type: "output",
      regex: rule.regex,
      replace: rule.replace,
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
  extensions: [sanitizeExtension, quotesExtension, BRTagsToParagraphTags],
}); */

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
console.debug(`We will connect to "${wsType}" server..`);
var serverUrl = `${wsType}://${hostname}:${port}`;


function updateUserList(listType, userList) {
  //console.warn(`updating ${listType} list`);
  //console.warn(userList);

  if (!userList || userList.length === 0) {
    console.warn('saw no userlist for ', listType, '..returning!');
    return;
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

  console.warn(userList)
  userList.forEach(({ username, role, color, entity }) => {
    let isAI = entity === "AI" ? true : false;
    const usernameText = listType === "AIChatUserList" && isAI ? `${username} 🤖` : role === "host" ? `${username} 🔑` : username;
    const usernameColor = listType === "AIChatUserList" && isAI ? "white" : color;
    console.warn(usernameText);
    const listItem = `<li data-foruser="${username}" title="${username}" style="color: ${usernameColor};">${usernameText}</li>`;
    console.log(listItem);
    listElement.append(listItem);
  });
}


//MARK: processConnection
async function processConfirmedConnection(parsedMessage) {
  console.debug("[processConfirmedConnection()]>> GO");

  //process universal stuff for guests
  const {
    clientUUID, role, selectedCharacterDisplayName,
    chatHistory, AIChatHistory, userList, sessionID
  } = parsedMessage;

  //console.warn(chatHistory)

  //these two need to be set as globals here in script.js
  AIChatDelay = parsedMessage.liveConfig.crowdControl.AIChatDelay * 1000;
  userChatDelay = parsedMessage.liveConfig.crowdControl.userChatDelay * 1000;
  //allowImages = parsedMessage.liveConfig.crowdControl.allowImages

  myUUID = myUUID === "" ? clientUUID : myUUID;
  localStorage.setItem("UUID", myUUID);
  isHost = role === "host" ? true : false;
  console.debug(`my UUID is: ${myUUID}`);
  var userRole = isHost ? "Host" : "Guest";
  $("#userRole").text(userRole);
  $("#charName").text(selectedCharacterDisplayName);
  $("#charName").parent().prop('title', `Powered by  ${parsedMessage.selectedModelForGuestDisplay}`);

  if (isHost) {
    //process all control and selector values for hosts
    await handleconfig.processLiveConfig(parsedMessage)

    $("#charName").hide();
    $(".hostControls").removeClass('hostControls'); //stop them from being hidden
    if (isPhone) {
      //handle initial loads for phones, hide the control panel
      $("#leftSpanner").css('display', 'block').remove()
      $("#universalControls").css('height', 'unset');
      $("#roleKeyInputDiv").removeClass("positionAbsolute");
      if ($("#controlPanel").hasClass("initialState")) {
        $("#controlPanel").removeClass("initialState").addClass('opacityZero').addClass('hidden');
      }
      $("#userListsWrap").addClass('hidden').addClass('opacityZero')
      $("#roleKeyInputDiv")
        .css('width', '95%')
        .css('height', 'unset');
    } else if ($("#controlPanel").hasClass("initialState")) {
      //handle first load for PC, shows the panel
      $("#controlPanel").addClass('opacityZero').show()
      $("#controlPanel").removeClass('opacityZero')
      $("#leftSpanner").css('display', 'block').remove()
      $("#controlPanel").removeClass("initialState");
      $("#keepAliveAudio").hide(); //TODO: figure the logic for this out. It can be helpful perhaps for non localhost Hosts on PC
    }

    if (!$("#promptConfigTextFields").hasClass('heightHasbeenSet') && $("#controlPanel").css('display') !== 'none') {
      // $("#promptConfigTextFields").css("height", util.calculatePromptsBlockheight())
      $("#promptConfigTextFields").addClass('heightHasbeenSet')
    }

    $("#showPastChats").trigger("click");
  } else { // is Guest
    //hide control panel and host controls for guests
    $("#controlPanel, .hostControls").remove();
    $(".chatHeader").removeClass('justifySpaceBetween')
    control.disableAPIEdit();
    if (isPhone) {
      $("#universalControls").css('height', 'unset');
      $("#leftSpanner").css('display', 'block').remove()
      $("#userListsWrap").addClass('hidden').addClass('opacityZero')
      $("#roleKeyInputDiv")
        .removeClass("positionAbsolute")
        .css('width', '95%')
    }
  }

  updateUserList("userList", userList);

  if (chatHistory) {
    console.debug(`[updateChatHistory(#userChat)]>> GO`);
    $("#userChat").empty()
    const trimmedChatHistoryString = chatHistory.trim();
    const parsedChatHistory = JSON.parse(trimmedChatHistoryString);
    appendMessagesWithConverter(parsedChatHistory, "#userChat", sessionID);
  }

  if (AIChatHistory) {
    console.debug("[updateAIChatHistory(#AIChat)]>> GO");
    $("#AIChat").empty()
    const trimmedAIChatHistoryString = AIChatHistory.trim();
    const parsedAIChatHistory = JSON.parse(trimmedAIChatHistoryString);
    appendMessagesWithConverter(parsedAIChatHistory, "#AIChat", sessionID);
  }

  //we always want to auto scroll the chats on first load
  $("#userChat").scrollTop($("#userChat").prop("scrollHeight"));
  $("#AIChat").scrollTop($("#AIChat").prop("scrollHeight"));

  initialLoad = false;
}
//MARK:appendMessages

//elementSelector (string): is #AIChat" or "#userChat" for 
//messages (array of objs): [{username:"user", userColor:"#color", content:"message text", messageID:"id", entity:"user or AI"}]
function appendMessagesWithConverter(messages, elementSelector, sessionID) {

  messages.forEach(({ username, userColor, content, messageID, entity }) => {

    let dataEntityTypeString = "";
    let isAI = entity === "AI" ? true : false;
    let usernameToShow = isAI ? `${username} 🤖` : username;
    userColor = isAI ? "white" : userColor;
    elementSelector === "#AIChat" ? dataEntityTypeString = `data-entityType="${entity}"` : dataEntityTypeString = "";

    let timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + " " + new Date().toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit' });

    let newDiv = $(`
    <div class="transition250" data-sessionid="${sessionID}" data-messageid="${messageID}" ${dataEntityTypeString}>
      <div class="messageHeader flexbox justifySpaceBetween">
        <span style="color:${userColor}" class="flexbox alignItemsCenter chatUserName">${usernameToShow}
        <small class="messageTime">${timestamp}</small>
        </span>
        <div class="messageControls transition250">
            <i data-messageid="${messageID}" data-sessionid="${sessionID}" data-entity-type="${entity}" class="messageEdit messageButton fa-solid fa-edit bgTransparent greyscale textshadow textBrightUp transition250"></i>
            <i data-messageid="${messageID}" data-sessionid="${sessionID}" data-entity-type="${entity}" class="messageDelete messageButton fa-solid fa-trash bgTransparent greyscale textshadow textBrightUp transition250"></i>
        </div>
      </div>
      <div class="messageContent">
      ${content}
      </div>
    </div>
    `);

    if (!isHost) newDiv.find('.messageControls').remove();
    if (elementSelector == "#userChat") newDiv.find('.messageEdit').remove();
    console.warn('newDiv: ', newDiv, 'elementSelector: ', elementSelector);
    $(elementSelector).append(newDiv);
    addMessageEditListeners(newDiv);

    if (currentlyStreaming) disableButtons();

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
    console.debug(currentMessageData.message)

    await editMessage(currentMessageData.message)

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

      return new Promise((resolve, reject) => {

        const messageContentHandler = (response) => {
          //parse the response, extract the mesage contents
          let responseDataJSON = JSON.parse(response.data)
          //console.log(responseDataJSON)
          //and remove listener once we have it
          socket.removeEventListener('message', messageContentHandler);
          resolve(responseDataJSON.content);
        };
        //we create a one-time listener to handle the next response that will go past our main switch
        socket.addEventListener('message', messageContentHandler);
        socket.send(JSON.stringify(messageContentRequest));
      });
    }


    async function editMessage(message) {
      //create a popup window to handle editing of hte content
      const widthToUse = isPhone ? ($(window).width() - 10) : $("#AIChat").width()

      $(`<div id="mesEditPopup"></div>`)
        .html(
          `<textarea id="mesEditText"></textarea>`
        )
        .dialog({
          width: widthToUse,
          height: widthToUse,
          draggable: false,
          resizable: false,
          modal: true,
          position: { my: "center", at: "center", of: window },
          title: "Edit Message",
          buttons: {
            Ok: function () {
              console.log($("#mesEditText").val())
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
  //MARK: Line 500
  $newdiv.find(`.messageDelete`).off('click').on('click', async function () {
    if ($(this).parent().parent().parent().parent().children().length === 1) { //check how many messages are inside the userChat/AIChat container
      alert('Can not delete the only message in this chat. If you want to delete this chat, use the Past Chats list.')
      return
    }

    if (currentlyStreaming) {
      alert('Can not delete messages while streaming.');
      console.warn('Can not delete messages while streaming.');
      return;
    }

    let chatContainer = $(this).parent().parent().parent().parent().prop('id');
    let deletionType;
    if (chatContainer === "AIChat") { deletionType = "AI" }
    if (chatContainer === "userChat") { deletionType = "user" }



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


async function connectWebSocket(username) {
  var username, AIChatUsername;

  myUsername = localStorage.getItem("username") !== null ? localStorage.getItem("username") : ({ username, AIChatUsername } = await startupUsernames());
  myUUID = localStorage.getItem("UUID") !== null ? localStorage.getItem("UUID") : "";
  console.log(`trying to connect to ${serverUrl} with ${myUUID}, ${myUsername} or ${username}`);
  socket = new WebSocket(serverUrl + "?uuid=" + myUUID + "&username=" + encodeURIComponent(username));
  console.log("socket connected!");

  socket.onopen = function () { handleSocketOpening(socket); }
  socket.onclose = disconnectWebSocket;
  // Handle incoming messages from the server
  socket.addEventListener("message", async function (event) {
    var message = event.data;
    let parsedMessage = JSON.parse(message);

    //dont send spammy server messages to the console
    if (
      parsedMessage.type !== "streamedAIResponse" &&
      parsedMessage.type !== "pastChatsList" &&
      parsedMessage.type !== "pastChatToLoad"
    ) {
      console.debug("Received server message:", message);
    }

    /*TODO: 
        condense anything that is related to user state into a single message type: 
            userList, AIChatUserlist, userconnect, userDisconnect, username change

     *condense both clearchats into a single type with a 'chatID' property

     */

    //MARK: parsedMessage switch
    switch (parsedMessage?.type) {
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

      case "chatUpdate": //when last message in AI char is deleted
        console.debug("saw AI chat update instruction");
        $("#AIChat").empty();
        let resetChatHistory = parsedMessage.chatHistory;
        appendMessagesWithConverter(resetChatHistory, "#AIChat", resetChatHistory[0].sessionID,)
        break;
      case "userChatUpdate": //when last message in user char is deleted
        console.debug("saw user chat update instruction");
        $("#userChat").empty();
        let resetUserChatHistory = parsedMessage.chatHistory;
        appendMessagesWithConverter(resetUserChatHistory, "#userChat", resetUserChatHistory[0].sessionID,)
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
        console.debug(parsedMessage)
        allowImages = handleconfig.allowImages() || parsedMessage.liveConfig.crowdControl.allowImages
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
        $("#charName").parent().prop('title', `Powered by  ${selectedModel}`);
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
        util.kindlyScrollDivToBottom($("#userChat"));
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
        //TODO: this feels like a duplicate of the appendWithConverter function...merge?
        appendMessagesWithConverter(pastChatHistory, "#AIChat", parsedMessage.sessionID)
        util.kindlyScrollDivToBottom($("#AIChat"))
        break;
      case "pastChatDeleted":
        let wasActive = parsedMessage?.wasActive;
        if (wasActive) {
          $("#clearAIChat").trigger("click");
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
        //TODO: merge this into appendWithConverter (and add a flag to it to indicate it's a streamed response?)
        //console.warn(parsedMessage.color)
        $("body").addClass("currentlyStreaming");
        currentlyStreaming = true;
        let newStreamDivSpan;
        let streamedMessageEditDeleteHTML = "";
        if (isHost) {
          streamedMessageEditDeleteHTML = `
            <div class="messageControls transition250">
              <i data-messageid="${parsedMessage.messageID}" data-sessionid="${parsedMessage.sessionID}" class="fromStreamedResponse messageEdit messageButton fa-solid fa-edit bgTransparent greyscale textshadow textBrightUp transition250"></i>
              <i data-messageid="${parsedMessage.messageID}" data-sessionid="${parsedMessage.sessionID}" class="fromStreamedResponse messageDelete messageButton fa-solid fa-trash bgTransparent greyscale textshadow textBrightUp transition250"></i>
            </div>`
        }
        if (!$("#AIChat .incomingStreamDiv").length) {
          newStreamDivSpan = $(`<div class="incomingStreamDiv transition250" data-sessionid="${parsedMessage.sessionID}" data-messageid="${parsedMessage.messageID}" data-entityType="AI"></div>`).html(`
          <div class="messageHeader flexbox justifySpaceBetween">
            <span style="color:white" class="chatUserName">${parsedMessage.username} 🤖</span>
            ${streamedMessageEditDeleteHTML}
          </div>
          <div class="messageContent">
            <span></span>
          </div>`);
          $("#AIChat").append(newStreamDivSpan);
          util.kindlyScrollDivToBottom($("#AIChat"));
        }
        await displayStreamedResponse(message);
        break;

      case "streamedAIResponseEnd":
        console.debug("saw stream end");
        //const HTMLizedContent = converter.makeHtml(accumulatedContent);
        const newDivElement = $("<p>").html(accumulatedContent);
        const elementsToRemove = $(".incomingStreamDiv .messageContent").children("span");
        elementsToRemove.remove();
        if (isHost) addMessageEditListeners('.incomingStreamDiv');
        $(".incomingStreamDiv").append(newDivElement.html());
        accumulatedContent = "";
        fullRawAccumulatedContent = "";
        $(".incomingStreamDiv").removeClass("incomingStreamDiv");
        currentlyStreaming = false;
        console.debug('currentlyStreaming: ', currentlyStreaming);
        console.debug('Re-enabling buttons');
        $("body").removeClass("currentlyStreaming");
        enableButtons();
        updateUserList("AIChatUserList", parsedMessage.AIChatUserList);
        break;
      case "AIResponse":
      case "chatMessage":
        let isAIResponse = false;
        if (parsedMessage.type === "AIResponse") { isAIResponse = true; }

        var {
          chatID, username, content,
          userColor, color, workerName,
          hordeModel, kudosCost, AIChatUserList, messageID
        } = JSON.parse(message);
        let sessionID = parsedMessage.sessionID
        let entityTypeString = isAIResponse ? "AI" : "user";
        let chatMessageObj =
        {
          username: username,
          userColor: userColor,
          content: content,
          messageID: messageID,
          entity: entityTypeString
        }
        appendMessagesWithConverter([chatMessageObj], "#" + chatID, sessionID)
        util.kindlyScrollDivToBottom($(`div[data-chat-id="${chatID}"]`));

        if (chatID === "AIChat") {
          $("#showPastChats").trigger("click"); //autoupdate the past chat list with each AI chat message
        }
        let targetList = isAIResponse ? "AIChatUserList" : "userList";
        updateUserList(targetList, parsedMessage.AIChatUserList);
        isAIResponse = false;
        break;
      default:
        console.warn(`UNKNOWN MESSAGE TYPE "${parsedMessage.type}": Main Switch ignoring, perhaps it's a special response for a different function`);
        console.warn(parsedMessage);
        break;
    }
  });
}

let fullRawAccumulatedContent = ""; //store the whole message
let accumulatedContent = ""; // variable to store tokens for the currently streaming paragraph
async function displayStreamedResponse(message) {
  await util.delay(0);
  var content = JSON.parse(message).content;
  let newStreamDivSpan = $("#AIChat .incomingStreamDiv .messageContent span:last");
  let newStreamDiv = $("#AIChat .incomingStreamDiv .messageContent");

  //content = DOMPurify.sanitize(content);

  let spanElement, contentLeftover;
  if (content.includes("\nabcxyz1234567890zyxabc")) { //that oddly lone and specific string is simply to disable this check for now, since parsing \n is broken
    //preprocess individual paragraphs.
    //sometimes AI produces new lines with the start of the next sentence together.
    //we want to remove the newlines, but keep the first word of the next paragraph.

    contentLeftover = content.replaceAll("\n", "");

    if (!contentLeftover) {
      contentLeftover === "";
    } //if there was nothing else, set it to blank.
    let trimmedParagraph = util.trimIncompleteSentences(accumulatedContent); //trim what we accumulated so far.

    //let markdownParagraph = converter.makeHtml(trimmedParagraph); //make it markdown
    $(newStreamDiv).children("span").remove(); //remove all the token spans that went into producing it.
    $(newStreamDiv).append(trimmedParagraph); //add the markdown paragraph inplace of the token spans.
    accumulatedContent = contentLeftover; //set accumulated content the leftovers after the newline cut (first character/word of next sentence)
    newStreamDiv.append($("<span>")); //add a new span for the new paragraph's tokens to come into.
  } else {
    //if we are still doing the same paragraph, just add tokens into spans
    accumulatedContent += content;
    spanElement = $("<span>").html(content);
    newStreamDivSpan.append(spanElement);
  }

  // Find and preserve existing username span within .incomingStreamDiv
  //const existingUsernameSpan = newStreamDivSpan.find('.chatUserName');

  util.kindlyScrollDivToBottom($("#AIChat"));

  // Scroll to the bottom of the div to view incoming tokens
  //not sure this is working
}

function handleSocketOpening(socket) {
  console.log("WebSocket opened to server:", serverUrl);
  $("#reconnectButton").hide();
  $("#disconnectButton").show();
  const username = $("#usernameInput").val();
  console.debug(`connected as ${username}`);
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

//MARK:doAIRetry
function doAIRetry() {
  if (currentlyStreaming) {
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
  };
  disableButtons()
  util.messageServer(retryMessage);
}

async function sendMessageToAIChat(type) {
  if (currentlyStreaming) {
    return;
  }

  if ($("#AIUsernameInput").val().trim() === "") {
    alert("Can't send chat message with no username!");
    return;
  }

  var messageInput = $("#AIMessageInput");
  if (messageInput.val().trim() === "" && type !== "forced") {
    alert("Can't send empty message!");
    return;
  }
  username = $("#AIUsernameInput").val();
  var markdownContent = `${messageInput.val()}`;
  var websocketRequest = {
    type: "chatMessage",
    chatID: "AIChat",
    UUID: myUUID,
    username: username,
    userInput: markdownContent,
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

  //MARK: chardefPopup (LN:1k)
  async function showCharDefs(charDefs, whichChar) {
    const widthToUse = isPhone ? ($(window).width() - 10) : $("#contentWrap").width()
    const heightToUse = isPhone ? ($(window).height() - 10) : $("#contentWrap").height()
    const columnOrNot = isPhone ? 'flexFlowCol' : ''
    charDefs = JSON.parse(charDefs)
    console.log(charDefs)

    $(`<div id="charDefPopup" class="flexbox ${columnOrNot}"></div>`)
      .html(
        `<div class="flexbox flexFlowCol flex1">
          Name
          <textarea id="charDefsName" class="JQUIPopupInput" rows="1"></textarea>
          Description
          <textarea id="charDefsDesc" class="JQUIPopupInput flex1"></textarea>
          <!--
          Personality
          <textarea id="charDefsPersonality" class="JQUIPopupInput flex1"></textarea>
          -->
        </div>

        <div class="flexbox flexFlowCol flex1">
          <!--  
          Scenario
          <textarea id="charDefsScenario" class="JQUIPopupInput flex1"></textarea>
          -->
          First Message
          <textarea id="charDefsFirstMessage" class="JQUIPopupInput flex1"></textarea>
          <!--
          Example Messages
          <textarea id="charDefsExampleMessages" class="JQUIPopupInput flex1"></textarea>
          -->
        </div>`
      )
      .dialog({
        width: widthToUse,
        height: heightToUse,
        draggable: false,
        resizable: false,
        modal: true,
        position: { my: "center", at: "center", of: window },
        title: `Character Definitions - ${charDefs.name}`,
        buttons: {
          Save: function () {
            //replace old card data with new STMP data, leaving old data otherwise untouched.
            charDefs.name = $("#charDefsName").val()
            charDefs.description = $("#charDefsDesc").val()
            charDefs.first_mes = $("#charDefsFirstMessage").val()

            const charEditRequest = {
              type: 'charEditRequest',
              UUID: myUUID,
              char: whichChar,
              newCharDefs: charDefs
            }
            $(this).dialog("close");
            $(this).remove()
            console.warn(charEditRequest)
            util.messageServer(charEditRequest)
          },
          Cancel: function () {
            $(this).dialog("close");
            $(this).remove()
          },
        },
        open: function () {
          $("#charDefsName").val(charDefs?.data?.name || charDefs.name || 'no name found??')
          $("#charDefsDesc").val(charDefs?.data?.description || charDefs.description || '')
          //$("#charDefsPersonality").val(charDefs?.data?.personality || charDefs?.personality || '')
          //$("#charDefsScenario").val(charDefs?.data?.scenario || charDefs?.scenario || '')
          $("#charDefsFirstMessage").val(charDefs?.data?.first_mes || charDefs.first_mes || '')
          //$("#charDefsExampleMessages").val(charDefs?.data?.mes_example || charDefs?.mes_example || '')
          //$("#charDefsLoreBook").val(charDefs?.data?.character_book || 'No Embedded LoreBook')

          $(".ui-button").trigger("blur");
        },
        close: function () { },
      })
  }
}

//MARK: disableButtons
function disableButtons() {
  const buttonsToDisable = [
    "#AISendButton",
    "#deleteLastMessageButton",
    "#triggerAIResponse",
    "#AIRetry",
    "#cardList",
    "#APIList",
    "#D4CharDefs",
    "#toggleMode",
    ".messageEdit",
    ".messageDelete"
  ];

  buttonsToDisable.forEach(selector => {
    const $element = $(selector);
    if ($element.length) {
      $element.prop("disabled", true).addClass("disabled");
      console.debug(`Disabled ${selector}: ${$element.prop("disabled")}`);
    } else {
      console.warn(`Element ${selector} not found in DOM`);
    }
  });
}

function enableButtons() {
  console.debug('Re-enabling buttons');
  const buttonsToEnable = [
    "#AISendButton", "#deleteLastMessageButton", "#triggerAIResponse", "#AIRetry",
    "#cardList", "#APIList", "#D4CharDefs", "#isStreaming", "#isAutoResponse", "#toggleMode",
    ".messageEdit", ".messageDelete"
  ];

  buttonsToEnable.forEach(selector => {
    const $element = $(selector);
    if ($element.length) {
      $element
        .prop('disabled', false)
        .removeAttr('disabled')
        .removeClass('disabled')
        .prop('readonly', false)
        .removeAttr('readonly');
      console.debug(`Enabled ${selector}:`, {
        disabledProp: $element.prop('disabled'),
        disabledAttr: $element.attr('disabled'),
        hasDisabledClass: $element.hasClass('disabled'),
        readonlyProp: $element.prop('readonly'),
        readonlyAttr: $element.attr('readonly'),
        isCheckbox: $element.is('input[type="checkbox"]'),
        html: $element[0]?.outerHTML || 'Not found'
      });
    } else {
      console.warn(`Element ${selector} not found in DOM`);
    }
  });

  // Explicitly clear readonly for all checkboxes
  $('input[type="checkbox"]').prop('readonly', false).removeAttr('readonly');
  console.debug('Cleared readonly for all checkboxes');

  console.debug('Re-enabled buttons');

  setTimeout(() => {
    console.debug('Checking button states after delay:', {
      isStreaming: {
        disabledProp: $("#isStreaming").prop('disabled'),
        disabledAttr: $("#isStreaming").attr('disabled'),
        readonlyProp: $("#isStreaming").prop('readonly'),
        readonlyAttr: $("#isStreaming").attr('readonly'),
        html: $("#isStreaming")[0]?.outerHTML || 'Not found'
      },
      isAutoResponse: {
        disabledProp: $("#isAutoResponse").prop('disabled'),
        disabledAttr: $("#isAutoResponse").attr('disabled'),
        readonlyProp: $("#isAutoResponse").prop('readonly'),
        readonlyAttr: $("#isAutoResponse").attr('readonly'),
        html: $("#isAutoResponse")[0]?.outerHTML || 'Not found'
      },
      D4CharDefs: {
        disabledProp: $("#D4CharDefs").prop('disabled'),
        disabledAttr: $("#D4CharDefs").attr('disabled'),
        readonlyProp: $("#D4CharDefs").prop('readonly'),
        readonlyAttr: $("#D4CharDefs").attr('readonly'),
        html: $("#D4CharDefs")[0]?.outerHTML || 'Not found'
      }
    });
  }, 100);
}

function verifyCheckboxStates() {
  const checkboxes = ['#isStreaming', '#isAutoResponse', '#D4CharDefs'];
  console.debug('Checking checkbox states at page load:');
  checkboxes.forEach(selector => {
    const $element = $(selector);
    if ($element.length) {
      console.debug(`State for ${selector}:`, {
        readonlyProp: $element.prop('readonly'),
        readonlyAttr: $element.attr('readonly'),
        disabledProp: $element.prop('disabled'),
        disabledAttr: $element.attr('disabled'),
        classes: $element.attr('class'),
        html: $element[0]?.outerHTML || 'Not found'
      });
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

  isPhone = /Mobile/.test(navigator.userAgent);
  console.debug(`Is this a phone? ${isPhone}`);

  const $controlPanel = $("#controlPanel");
  const $chatWrap = $("#chatWrap")
  const $innerChatWrap = $("#innerChatWrap")
  const $LLMChatWrapper = $("#LLMChatWrapper");
  const $OOCChatWrapper = $("#OOCChatWrapper");
  const $AIChatInputButtons = $("#AIChatInputButtons");
  const $userChatInputButtons = $("#userChatInputButtons");

  let { username, AIChatUsername } = await startupUsernames();
  console.log("Startup Usernames:", username, AIChatUsername);
  $("#usernameInput").val(username);
  $("#AIUsernameInput").val(AIChatUsername);

  if (!isPhone) {
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
    .on("click", function () {
      if (isPhone) {
        util.betterSlideToggle($("#profileManagementMenu"), 250, "width");
      }
      $("#roleKeyInputDiv")
        .css("height", "unset")
        .toggleClass("needsReset")
        .fadeToggle();
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
      console.debug("sendButton is disabled");
      return;
    }

    if ($("#usernameInput").val().trim() === "") {
      alert("Can't send chat message with no username!");
      return;
    }
    var messageInput = $("#messageInput");
    if (messageInput.val().trim() === "") {
      alert("Can't send empty message!");
      return;
    }

    $(this).addClass("disabledButton").text("🚫");
    setTimeout(() => {
      $(this).removeClass("disabledButton").text("✏️");
    }, userChatDelay);

    username = $("#usernameInput").val();
    var markdownContent = `${messageInput.val()}`;
    //var htmlContent = converter.makeHtml(markdownContent);
    var messageObj = {
      type: "chatMessage",
      chatID: "userChat",
      UUID: myUUID,
      username: username,
      content: markdownContent,
    };
    localStorage.setItem("username", username);
    util.messageServer(messageObj);
    messageInput.val("");
    messageInput.trigger("focus").trigger("input");
  });

  $("#triggerAIResponse").off("click").on("click", function () {
    console.debug('saw force trigger for AI response click')
    disableButtons()
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

  $("#AISendButton").off("click").on("click", function () {
    if ($(this).hasClass("disabledButton") || currentlyStreaming) {
      alert("AI is currently generating a response, please wait.");
      console.warn('Cannot send message while AI is generating response.');
      return;
    }
    sendMessageToAIChat();
    $("#AIMessageInput").trigger("input");
    disableButtons()
    $(this).addClass("disabledButton").text("🚫");
    setTimeout(() => {
      $(this).removeClass("disabledButton").text("✏️");
    }, AIChatDelay);
  });


  $("#clearUserChat").off("click").on("click", function () {

    console.debug("Requesting OOC Chat clear");
    const clearMessage = {
      type: "clearChat",
      UUID: myUUID,
    };
    util.messageServer(clearMessage);
  });

  $("#clearAIChat").off("click").on("click", function () {
    console.debug("Requesting AI Chat clear");
    const clearMessage = {
      type: "clearAIChat",
      UUID: myUUID,
    };
    util.messageServer(clearMessage);
  });

  $("#deleteLastMessageButton").off("click").on("click", function () {
    console.debug("deleting last AI Chat message");
    const delLastMessage = {
      type: "deleteLast",
      UUID: myUUID,
    };
    util.messageServer(delLastMessage);
  });

  $("#profileManagementButton").on("click", function () {
    util.betterSlideToggle($("#profileManagementMenu"), 250, "width");
  });

  $("#clearLocalStorage").on("click", function () {
    util.betterSlideToggle($("#profileManagementMenu"), 250, "width");
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

  if (
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
      $(".bodywrap").css({
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

  if (/Mobile/.test(navigator.userAgent) && isIOS) {
    $("body").css({
      "padding-left": "0px",
      "padding-right": "0px",
      width: "100sfw",
      height: "calc(100svh - 15px)",
    });
  }

  //MARK: Line 1500
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

  $(document).on("click", async function (e) {
    var $target = $(e.target);
    if (
      !$target.is("#profileManagementButton") &&
      !$target.parents("#profileManagementMenu").length &&
      !$target.is("#roleKeyInput")
    ) {
      if ($("#profileManagementMenu").hasClass("needsReset")) {
        util.betterSlideToggle($("#profileManagementMenu"), 250, "width");
      }
      if ($("#roleKeyInputDiv").hasClass("needsReset")) {
        $("#roleKeyInputDiv").fadeToggle().removeClass("needsReset");
      }
    }
  });

  $("#controlPanelToggle").on("click", async function () {
    if (!isPhone && $("#controlPanel").width() !== 0) {
      $("#controlPanelContents").css('width', $("#controlPanel").width());
    }

    if (isPhone && $("#controlPanel").hasClass('opacityZero')) {
      console.log('toggline CP to be visible before fade in')
      $("#controlPanel").toggleClass('hidden')
      if (!$("#promptConfigTextFields").hasClass('heightHasbeenSet') && $("#controlPanel").css('display') !== 'none') {
        //  $("#promptConfigTextFields").css("height", util.calculatePromptsBlockheight())
        $("#promptConfigTextFields").addClass('heightHasbeenSet')
      }
      await util.delay(1)
    }
    //await util.betterSlideToggle($controlPanel, 250, "width");
    $("#controlPanel").toggleClass('opacityZero')
    await util.delay(250)

    console.log($("#controlPanel").css('opacity'))

    if (isPhone && $("#controlPanel").hasClass('opacityZero')) {
      console.log('toggling CP to be invisible after fadeout')
      $("#controlPanel").toggleClass('hidden')
    }
  });

  var chatsToggleState = 0;
  $("#chatsToggle").off("click").on("click", async function () {
    // Increment the state and wrap around to 0 after the third state
    chatsToggleState = (chatsToggleState + 1) % 3;

    if (chatsToggleState === 0) { //going back to dual display
      $LLMChatWrapper.removeClass('hidden')
      $OOCChatWrapper.removeClass('hidden')
      await util.delay(1)
      $LLMChatWrapper.css({ flex: "1", opacity: "1" })
      $OOCChatWrapper.css({ flex: "1", opacity: "1" })

      if (!isPhone) {
        $LLMChatWrapper.css({ maxWidth: '100%' })
        $OOCChatWrapper.css({ maxWidth: '100%' })
      }
      await util.delay(250)

    } else if (chatsToggleState === 1) { // only showing AI chat
      if (!isPhone) {
        $OOCChatWrapper.css({ maxWidth: '50%' })
        $LLMChatWrapper.css({ maxWidth: '50%' })
      }
      await util.delay(1)
      $OOCChatWrapper.css({ flex: "0", opacity: "0" })
      await util.delay(250)
      $OOCChatWrapper.addClass('hidden');

    } else if (chatsToggleState === 2) { //only showing user chat
      $OOCChatWrapper.removeClass('hidden')
      $LLMChatWrapper.css({ flex: "0", opacity: "0" })
      await util.delay(250)
      $LLMChatWrapper.addClass('hidden');
      $OOCChatWrapper.css({ flex: "1", opacity: "1" });
    }
  });

  $("#userListsToggle").off("click").on("click", async function () {

    if (isPhone && !$("#userListsWrap").hasClass('opacityZero')) {
      $("#userListsWrap").toggleClass('opacityZero')
      await util.delay(250)
      $("#userListsWrap").toggleClass('hidden')
    } else if (isPhone && $("#userListsWrap").hasClass('opacityZero')) {
      $("#userListsWrap").toggleClass('hidden')
      await util.delay(1)
      $("#userListsWrap").toggleClass('opacityZero')
    } else {
      $("#userListsWrap").toggleClass('opacityZero')
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

  $("#modelLoadButton").on("click", async function () {
    await control.getModelList();
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

  /*   $("#controlPanel > div > div > .isControlPanelToggle").on("click", function () {
      util.toggleControlPanelBlocks($(this), "all");
    }); */

  $(`.isControlPanelToggle,
    #crowdControlToggle`).on("click", function () {
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

  //listener for mobile users that detects change in visiible of the app.
  //it checks the websocket's readyState when the app becomes visible again
  //and provides immediate feedback on whether the websocket is still open or if
  //they have been disconnected while the app was invisible.
  //also it will pause/play the keepAlive audio if it's enabled.
  document.addEventListener("visibilitychange", function () {
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

    if (isPhone && document.visibilityState === "visible") {
      //pause any playing audio
      if (doKeepAliveAudio && isKeepAliveAudioPlaying) {
        keepAliveAudio.pause();
        isKeepAliveAudioPlaying = false;
      }
    } else if (isPhone && document.visibilityState === "hidden") {
      // play the background audio if it's set to on.
      if (doKeepAliveAudio && !isKeepAliveAudioPlaying) {
        keepAliveAudio.play();
        isKeepAliveAudioPlaying = true;
      }
      //TODO: add automatic class toggling when visibility changes, to dim userlist.
    }
  });

  //simple toggle for whether to play KeepAliveAudio for minimized mobile users
  $("#keepAliveAudio").on("touchstart", function () {
    doKeepAliveAudio = !doKeepAliveAudio;
    $("#keepAliveAudio").toggleClass("greenHighlight");
    //this should never happen due to the auto stop when visible, but just in case.
    if (!keepAliveAudio && isKeepAliveAudioPlaying) {
      keepAliveAudio.pause();
    }
  });

  $(window).on("resize", async function () {
    util.correctSizeBody();
  });

  isLandscape = util.checkIsLandscape();

  util.correctSizeBody();
  util.correctSizeChats();
  //close the past chats on page load
  util.toggleControlPanelBlocks($("#pastChatsToggle"), "single");

  $("#charDefsPopupButton").on('click', function () { callCharDefPopup() }

  )
});

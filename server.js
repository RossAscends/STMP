const http = require('http');
const fs = require('fs');
const fsp = require('fs').promises;
const util = require('util');
const WebSocket = require('ws');
const crypto = require('crypto');

const writeFileAsync = util.promisify(fs.writeFile);
const existsAsync = util.promisify(fs.exists);

const { v4: uuidv4 } = require('uuid');
const path = require('path');

const $ = require('jquery');
const express = require('express');
const { url } = require('inspector');
const localApp = express();
const remoteApp = express();

localApp.use(express.static('public'));
remoteApp.use(express.static('public'));

const characterCardParser = require('./src/character-card-parser.js');
//Import db handler from STMP/scripts/db.js
const db = require('./src/db.js');
const fio = require('./src/file-io.js')
const api = require('./src/api-calls.js')

//for console coloring
const color = {
    byNum: (mess, fgNum) => {
        mess = mess || '';
        fgNum = fgNum === undefined ? 31 : fgNum;
        return '\u001b[' + fgNum + 'm' + mess + '\u001b[39m';
    },
    black: (mess) => color.byNum(mess, 30),
    red: (mess) => color.byNum(mess, 31),
    green: (mess) => color.byNum(mess, 32),
    yellow: (mess) => color.byNum(mess, 33),
    blue: (mess) => color.byNum(mess, 34),
    magenta: (mess) => color.byNum(mess, 35),
    cyan: (mess) => color.byNum(mess, 36),
    white: (mess) => color.byNum(mess, 37),
};

const usernameColors = [
    '#FF5C5C',  // Red
    '#FFB54C',  // Orange
    '#FFED4C',  // Yellow
    '#4CFF69',  // Green
    '#4CCAFF',  // Blue
    '#AD4CFF',  // Purple
    '#FF4CC3',  // Magenta
    '#FF4C86',  // Pink
];

// Create both HTTP servers
const wsPort = 8181; //WS for host
const wssPort = 8182; //WSS for guests

let modKey = ''
let hostKey = ''


//set the engine mode to either 'TC' or 'horde'

fio.releaseLock()
api.getAPIDefaults()

// Configuration
const apiKey = "_YOUR_API_KEY_HERE_";
const authString = "_STUsername_:_STPassword_";
const secretsPath = path.join(__dirname, 'secrets.json');
let engineMode = 'TC'

console.log("");
console.log("")
console.log("")
console.log('===========================')
console.log("SillyTavern MultiPlayer");

// Create directory if it does not exist

localApp.get('/', (req, res) => {
    const filePath = path.join(__dirname, '/public/client.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error loading the client HTML file');
        } else {
            res.status(200).send(data);
        }
    });
});

remoteApp.get('/', (req, res) => {
    const filePath = path.join(__dirname, '/public/client.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error loading the client HTML file');
        } else {
            res.status(200).send(data);
        }
    });
});

// Handle 404 Not Found
localApp.use((req, res) => {
    res.status(404).send('Not found');
});

remoteApp.use((req, res) => {
    res.status(404).send('Not found');
});

const localServer = http.createServer(localApp);
const guestServer = http.createServer(remoteApp);

// Create a WebSocket server
const wsServer = new WebSocket.Server({ server: localServer });
const wssServer = new WebSocket.Server({ server: guestServer });
wsServer.setMaxListeners(0);
wssServer.setMaxListeners(0);

// Arrays to store connected clients of each server
var clientsObject = [];
var connectedUsers = [];
var hostUUID

//default values
var selectedCharacter
var isAutoResponse = true
var responseLength = 200
var contextSize = 4096
var liveConfig

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateAndPrintKeys() {
    // Generate a 16-byte hex string for the host key
    hostKey = crypto.randomBytes(16).toString('hex');

    // Generate a 16-byte hex string for the mod key
    modKey = crypto.randomBytes(16).toString('hex');

    // Print the keys
    console.log(`${color.yellow(`Host Key: ${hostKey}`)}`);
    console.log(`${color.yellow(`Mod Key: ${modKey}`)}`);
}

async function initFiles() {
    const configPath = 'config.json';
    const secretsPath = 'secrets.json';

    // Default values for config.json
    const defaultConfig = {
        engineMode: 'TC',
        selectedCharacter: 'public/characters/CodingSensei.png',
        responseLength: 200,
        contextSize: 2048,
        isAutoResponse: true,
        selectedPreset: "public/api-presets/TC-Temp-2_MinP-0.2.json",
        instructFormat: "public/instructFormats/ChatML.json",
        D1JB: ''
    };

    const instructSequences = await fio.readFile(defaultConfig.instructFormat)
    defaultConfig.instructSequences = instructSequences

    const samplerData = await fio.readFile(defaultConfig.selectedPreset)
    defaultConfig.samplers = samplerData

    defaultConfig.selectedCharDisplayName = "Coding Sensei"

    // Default values for secrets.json
    const defaultSecrets = {
        api_key: 'YourAPIKey',
        authString: 'YourAuthString'
    };

    // Check and create config.json if it doesn't exist
    if (!await existsAsync(configPath)) {
        console.log('Creating config.json with default values...');
        await writeFileAsync(configPath, JSON.stringify(defaultConfig, null, 2));
        console.log('config.json created.');
        liveConfig = await fio.readConfig()
    } else {
        console.log('Loading config.json...');
        liveConfig = await fio.readConfig()
        //console.log(liveConfig)

    }

    // Check and create secrets.json if it doesn't exist
    if (!await existsAsync(secretsPath)) {
        console.log('Creating secrets.json with default values...');
        await writeFileAsync(secretsPath, JSON.stringify(defaultSecrets, null, 2));
        console.log('secrets.json created, please update it with real credentials now and restart the server.');
    }
}

// Create directories
fio.createDirectoryIfNotExist("./public/api-presets");

generateAndPrintKeys();

// Call the function to initialize the files
initFiles();

// Handle incoming WebSocket connections for wsServer
wsServer.on('connection', (ws, request) => {
    handleConnections(ws, 'host', request);
});

// Handle incoming WebSocket connections for wssServer
wssServer.on('connection', (ws, request) => {
    handleConnections(ws, 'guest', request);
});

async function broadcast(message) {
    //alter the type check for bug checking purposes, otherwise this is turned off
    if (message.type === "BuggyTypeHere") {
        console.log('broadcasting this:')
        //console.log(message)
    }

    Object.keys(clientsObject).forEach(clientUUID => {
        const client = clientsObject[clientUUID];
        const socket = client.socket;

        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    });
}

async function broadcastToHosts(message) {
    //alter the type check for bug checking purposes, otherwise this is turned off

    console.log('HOST BROADCAST:')
    console.log(message)

    //console.log(clientsObject)

    let hostsObjects = Object.values(clientsObject).filter(obj => obj.role === 'host');
    //console.log(hostsObjects)

    Object.keys(hostsObjects).forEach(clientUUID => {
        const client = hostsObjects[clientUUID];
        const socket = client.socket;

        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    });
}

// Broadcast the updated array of connected usernames to all clients
async function broadcastUserList() {
    const userListMessage = {
        type: 'userList',
        userList: connectedUsers
    };
    //console.log('-----broadcastUserList() is about to send this as a userlist:')
    //console.log(connectedUsers)
    broadcast(userListMessage);
    //console.log(`[UserList BroadCast]:`)
    //console.log(connectedUsers)
}

async function removeLastAIChatMessage() {
    await db.removeLastAIChatMessage()
    let AIChatJSON = await db.readAIChat();
    let jsonArray = JSON.parse(AIChatJSON)
    let chatUpdateMessage = {
        type: 'chatUpdate',
        chatHistory: jsonArray
    }
    console.log('sending AI Chat Update instruction to clients')
    broadcast(chatUpdateMessage);
}

async function saveAndClearChat(type) {
    await db.newSession();
}

async function handleConnections(ws, type, request) {
    // Parse the URL to get the query parameters
    const urlParams = new URLSearchParams(request.url.split('?')[1]);

    //get the username from the encodedURI parameters
    const encodedUsername = urlParams.get('username');

    let thisUserColor, thisUserUsername, thisUserRole, user
    // Retrieve the UUID from the query parameters
    let uuid = urlParams.get('uuid');

    if (uuid === null || uuid === undefined || uuid === '') {
        //console.log('Client connected without UUID...assigning a new one..');
        //assign them a UUID
        uuid = uuidv4()
        //console.log(`uuid assigned as ${uuid}`)
    } else {
        //console.log('Client connected with UUID:', uuid);
    }
    //check if we have them in the DB
    user = await db.getUser(uuid);
    //console.log('initial user check:')
    //console.log(user)
    if (user !== undefined && user !== null) {
        //if we know them, use DB values
        thisUserColor = user.username_color;
        thisUserUsername = user.username
        thisUserRole = user.role
    } else {
        //if we don't know them code a random color
        thisUserColor = usernameColors[Math.floor(Math.random() * usernameColors.length)];
        thisUserRole = type;
        await db.upsertUserRole(uuid, thisUserRole);
        //attempt to decode the username
        thisUserUsername = decodeURIComponent(encodedUsername);
        if (thisUserUsername === null || thisUserUsername === undefined) {
            console.log('COULD NOT FIND USERNAME FOR CLIENT')
            console.log('CONNECTION REJECTED')
            ws.close()
            return
        }
    }

    clientsObject[uuid] = {
        socket: ws,
        color: thisUserColor,
        role: thisUserRole,
        username: thisUserUsername
    };

    user = clientsObject[uuid]

    await db.upsertUser(uuid, thisUserUsername, thisUserColor);
    console.log(`Adding ${thisUserUsername} to connected user list..`)
    updateConnectedUsers()
    //console.log('CONNECTED USERS')
    //console.log(connectedUsers)
    //console.log('CLIENTS OBJECT')
    //console.log(clientsObject)
    //console.log("USER =======")
    //console.log(user)

    const cardList = await fio.getCardList()
    const instructList = await fio.getInstructList()
    const samplerPresetList = await fio.getSamplerPresetList()
    var AIChatJSON = await db.readAIChat();
    var userChatJSON = await db.readUserChat()

    if (!liveConfig.selectedCharacter || liveConfig.selectedCharacter === '') {
        console.log('No selected character found, setting to default character...')
        liveConfig.selectedCharacter = cardList[0].filename;
        liveConfig.selectedCharDisplayName = cardList[0].name;
        await fio.writeConfig(liveConfig, 'selectedCharacter', liveConfig.selectedCharacter)
        await fio.writeConfig(liveConfig, 'selectedCharDisplayName', liveConfig.selectedCharDisplayName)
    }

    //send connection confirmation along with both chat history, card list, selected char, and assigned user color.
    let connectionConfirmedMessage = {
        clientUUID: uuid,
        type: 'connectionConfirmed',
        chatHistory: userChatJSON,
        AIChatHistory: AIChatJSON,
        color: thisUserColor,
        role: thisUserRole,
        selectedCharacterDisplayName: liveConfig.selectedCharDisplayName,
        newUserChatDelay: liveConfig?.userChatDelay,
        newAIChatDelay: liveConfig?.AIChatDelay,
        userList: connectedUsers
    }
    //send control-related metadata to the Host user
    if (thisUserRole === 'host') {
        console.log("including metadata for host")
        hostUUID = uuid
        connectionConfirmedMessage["cardList"] = cardList
        connectionConfirmedMessage["instructList"] = instructList
        connectionConfirmedMessage["samplerPresetList"] = samplerPresetList
        connectionConfirmedMessage["selectedCharacter"] = liveConfig.selectedCharacter
        connectionConfirmedMessage["selectedSamplerPreset"] = liveConfig.selectedPreset
        connectionConfirmedMessage["engineMode"] = liveConfig.engineMode
        connectionConfirmedMessage["isAutoResponse"] = liveConfig.isAutoResponse
        connectionConfirmedMessage["contextSize"] = liveConfig.contextSize
        connectionConfirmedMessage["responseLength"] = liveConfig.responseLength
        connectionConfirmedMessage["D1JB"] = liveConfig.D1JB
        connectionConfirmedMessage["instructFormat"] = liveConfig.instructFormat
    }

    await broadcastUserList()

    ws.send(JSON.stringify(connectionConfirmedMessage))

    function updateConnectedUsers() {
        const userList = Object.values(clientsObject).map(client => ({
            username: client.username,
            color: client.color,
            role: client.role
        }));
        connectedUsers = userList;
    }

    // Handle incoming messages from clients
    ws.on('message', async function (message) {

        console.log(`--- MESSAGE IN`)
        // Parse the incoming message as JSON
        let parsedMessage;

        try {
            parsedMessage = JSON.parse(message);
            const senderUUID = parsedMessage.UUID
            let userColor = await db.getUserColor(senderUUID)
            let thisClientObj = clientsObject[parsedMessage.UUID];

            //If there is no UUID, then this is a new client and we need to add it to the clientsObject
            if (!thisClientObj) {
                thisClientObj = {
                    username: '',
                    color: '',
                    role: '',
                };
                clientsObject[parsedMessage.UUID] = thisClientObj;
            }

            console.log('Received message from client:', parsedMessage);

            //first check if the sender is host, and if so, process possible host commands
            if (user.role === 'host') {
                //console.log(`saw message from host, type (${parsedMessage.type})`)
                if (parsedMessage.type === 'clearChat') {

                    //clear the UserChat.json file
                    await saveAndClearChat('UserChat')
                    const clearUserChatInstruction = {
                        type: 'clearChat'
                    }
                    // Broadcast the clear chat message to all connected clients
                    await broadcast(clearUserChatInstruction);
                    return
                }
                else if (parsedMessage.type === 'toggleAutoResponse') {
                    isAutoResponse = parsedMessage.value
                    liveConfig.isAutoResponse = isAutoResponse
                    await fio.writeConfig(liveConfig, 'isAutoResponse', isAutoResponse)
                    let settingChangeMessage = {
                        type: 'autoAItoggleUpdate',
                        value: liveConfig.isAutoResponse
                    }
                    await broadcastToHosts(settingChangeMessage)
                    return
                }
                else if (parsedMessage.type === 'adjustContextSize') {
                    contextSize = parsedMessage.value
                    liveConfig.contextSize = contextSize
                    await fio.writeConfig(liveConfig, 'contextSize', contextSize)
                    let settingChangeMessage = {
                        type: 'contextSizeChange',
                        value: liveConfig.contextSize
                    }
                    await broadcastToHosts(settingChangeMessage)
                    return

                }
                else if (parsedMessage.type === 'adjustResponseLength') {
                    responseLength = parsedMessage.value
                    liveConfig.responseLength = responseLength
                    await fio.writeConfig(liveConfig, 'responseLength', responseLength)
                    let settingChangeMessage = {
                        type: 'responseLengthChange',
                        value: liveConfig.responseLength
                    }
                    await broadcastToHosts(settingChangeMessage)
                    return

                }
                else if (parsedMessage.type === 'AIChatDelayChange') {
                    AIChatDelay = parsedMessage.value
                    liveConfig.AIChatDelay = AIChatDelay
                    await fio.writeConfig(liveConfig, 'AIChatDelay', AIChatDelay)
                    let settingChangeMessage = {
                        type: 'AIChatDelayChange',
                        value: liveConfig.AIChatDelay
                    }
                    await broadcast(settingChangeMessage)
                    return
                }
                else if (parsedMessage.type === 'userChatDelayChange') {
                    userChatDelay = parsedMessage.value
                    liveConfig.userChatDelay = userChatDelay
                    await fio.writeConfig(liveConfig, 'userChatDelay', userChatDelay)
                    let settingChangeMessage = {
                        type: 'userChatDelayChange',
                        value: liveConfig.userChatDelay
                    }
                    await broadcast(settingChangeMessage)
                    return
                }

                else if (parsedMessage.type === 'clearAIChat') {
                    await saveAndClearChat('AIChat')
                    const clearAIChatInstruction = {
                        type: 'clearAIChat'
                    }
                    await broadcast(clearAIChatInstruction);
                    let charFile = liveConfig.selectedCharacter
                    console.log(`selected character: ${charFile}`)
                    let cardData = await fio.charaRead(charFile, 'png')
                    let cardJSON = JSON.parse(cardData)
                    let firstMes = cardJSON.first_mes
                    let charName = cardJSON.name
                    let charColor = await db.getCharacterColor(charName)
                    firstMes = api.replaceMacros(firstMes, thisUserUsername, charName)
                    const newAIChatFirstMessage = {
                        type: 'chatMessage',
                        chatID: 'AIChat',
                        content: firstMes,
                        username: charName,
                        AIChatUserList: [{ username: charName, color: charColor }]
                    }
                    //console.log('adding the first mesage to the chat file')
                    await db.writeAIChatMessage(charName, charName, firstMes, 'AI');
                    console.log(`Sending ${charName}'s first message to AI Chat..`)
                    await broadcast(newAIChatFirstMessage)
                    return
                }
                else if (parsedMessage.type === 'deleteLast') {
                    await removeLastAIChatMessage()
                    return
                }
                else if (parsedMessage.type === 'changeCharacterRequest') {
                    const changeCharMessage = {
                        type: 'changeCharacter',
                        char: parsedMessage.newChar,
                        charDisplayName: parsedMessage.newCharDisplayName
                    }
                    liveConfig.selectedCharacter = parsedMessage.newChar
                    liveConfig.selectedCharDisplayName = parsedMessage.newCharDisplayName
                    await fio.writeConfig(liveConfig)
                    await broadcast(changeCharMessage);
                    return
                }
                else if (parsedMessage.type === 'changeSamplerPreset') {
                    const changePresetMessage = {
                        type: 'changeSamplerPreset',
                        newPreset: parsedMessage.newPreset
                    }
                    selectedPreset = parsedMessage.newPreset
                    liveConfig.selectedPreset = selectedPreset
                    const samplerData = await fio.readFile(selectedPreset)
                    liveConfig.samplers = samplerData
                    await fio.writeConfig(liveConfig, 'samplers', liveConfig.samplers)
                    await fio.writeConfig(liveConfig, 'selectedPreset', selectedPreset)
                    await broadcast(changePresetMessage);
                    return
                }
                else if (parsedMessage.type === 'changeInstructFormat') {
                    const changeInstructMessage = {
                        type: 'changeInstructFormat',
                        newInstructFormat: parsedMessage.newInstructFormat
                    }
                    liveConfig.instructFormat = parsedMessage.newInstructFormat
                    const instructSequences = await fio.readFile(liveConfig.instructFormat)
                    liveConfig.instructSequences = instructSequences
                    await fio.writeConfig(liveConfig, 'instructSequences', liveConfig.instructSequences)
                    await fio.writeConfig(liveConfig, 'instructFormat', parsedMessage.newInstructFormat)
                    await broadcast(changeInstructMessage);
                    return
                }
                else if (parsedMessage.type === 'changeD1JB') {
                    const changeD1JBMessage = {
                        type: 'changeD1JB',
                        newD1JB: parsedMessage.newD1JB
                    }
                    liveConfig.D1JB = parsedMessage.newD1JB
                    await fio.writeConfig(liveConfig)
                    await broadcast(changeD1JBMessage);
                    return
                }
                else if (parsedMessage.type === 'AIRetry') {
                    // Read the AIChat file
                    try {
                        await removeLastAIChatMessage()
                        userPrompt = {
                            'chatID': parsedMessage.chatID,
                            'username': parsedMessage.username,
                            'content': '',
                        }
                        let [AIResponse, AIChatUserList] = await api.getAIResponse(engineMode, parsedMessage, userPrompt, liveConfig)
                        const AIResponseMessage = {
                            chatID: parsedMessage.chatID,
                            content: AIResponse,
                            username: `${liveConfig.selectedCharDisplayName}`,
                            type: 'AIResponse',
                            userColor: userColor,
                            AIChatUserList: AIChatUserList
                        }
                        broadcast(AIResponseMessage)
                        return
                    } catch (parseError) {
                        console.error('An error occurred while parsing the JSON:', parseError);
                        return;
                    }
                }
                else if (parsedMessage.type === 'modeChange') {
                    engineMode = parsedMessage.newMode
                    const modeChangeMessage = {
                        type: 'modeChange',
                        engineMode: engineMode
                    }
                    liveConfig.engineMode = engineMode
                    await fio.writeConfig(liveConfig, 'engineMode', engineMode)
                    await broadcast(modeChangeMessage);
                    return
                }
                else if (parsedMessage.type === 'pastChatsRequest') {
                    const pastChats = await db.getPastChats()
                    const pastChatsListMessage = {
                        type: 'pastChatsList',
                        pastChats: pastChats
                    }
                    await broadcast(pastChatsListMessage)
                    return
                }
                else if (parsedMessage.type === 'loadPastChat') {
                    const [pastChat, sessionID] = await db.readAIChat(parsedMessage.session)
                    let jsonArray = JSON.parse(pastChat)
                    const pastChatsLoadMessage = {
                        type: 'pastChatToLoad',
                        pastChatHistory: jsonArray,
                        sessionID: sessionID
                    }
                    await broadcast(pastChatsLoadMessage)
                    return
                }
                else if (parsedMessage.type === 'pastChatDelete') {
                    const sessionID = parsedMessage.sessionID
                    let [result, wasActive] = await db.deletePastChat(sessionID)
                    console.log(result, wasActive)
                    if (result === 'ok') {
                        const pastChatsDeleteConfirmation = {
                            type: 'pastChatDeleted',
                            wasActive: wasActive
                        }
                        await broadcast(pastChatsDeleteConfirmation)
                        return
                    } else {
                        return
                    }
                }
            }
            //process universal message types

            if (parsedMessage.type === 'usernameChange') {
                clientsObject[uuid].username = parsedMessage.newName;
                updateConnectedUsers()
                const nameChangeNotification = {
                    type: 'userChangedName',
                    content: `[System]: ${parsedMessage.oldName} >>> ${parsedMessage.newName}`
                }
                //console.log(nameChangeNotification)
                console.log('sending notification of username change')
                await broadcast(nameChangeNotification);
                await broadcastUserList()
            }
            else if (parsedMessage.type === 'submitKey') {
                console.log(hostKey)
                console.log(parsedMessage.key)
                console.log(modKey)
                if (parsedMessage.key === hostKey) {
                    const keyAcceptedMessage = {
                        type: 'keyAccepted',
                        role: 'host'
                    }
                    db.upsertUserRole(uuid, 'host');
                    await ws.send(JSON.stringify(keyAcceptedMessage))
                    //await broadcast(keyAcceptedMessage);
                }
                else if (parsedMessage.key === modKey) {
                    const keyAcceptedMessage = {
                        type: 'keyAccepted',
                        role: 'mod'
                    }
                    db.upsertUserRole(uuid, 'mod');
                    await ws.send(JSON.stringify(keyAcceptedMessage))
                    //await broadcast(keyAcceptedMessage);
                }
                else {
                    const keyRejectedMessage = {
                        type: 'keyRejected'
                    }
                    console.error(`Key rejected: ${parsedMessage.key} from ${senderUUID}`)
                    await ws.send(JSON.stringify(keyRejectedMessage))
                    //await broadcast(keyRejectedMessage);
                }
            }
            else if (parsedMessage.type === 'chatMessage') { //handle normal chat messages
                //having this enable sends the user's colors along with the response message if it uses parsedMessage as the base..
                parsedMessage.userColor = thisUserColor
                const chatID = parsedMessage.chatID;
                const username = parsedMessage.username
                const userColor = thisUserColor
                const userInput = parsedMessage?.userInput
                const hordePrompt = parsedMessage?.userInput
                var userPrompt

                //setup the userPrompt array in order to send the input into the AIChat box
                if (chatID === 'AIChat') {

                    userPrompt = {
                        'chatID': chatID,
                        'username': username,
                        //send the HTML-ized message into the AI chat
                        'content': parsedMessage.userInput,
                        'userColor': userColor
                    }
                    let isEmptyTrigger = userPrompt.content.length == 0 ? true : false
                    //if the message isn't empty (i.e. not a forced AI trigger), then add it to AIChat
                    if (!isEmptyTrigger) {
                        await db.writeAIChatMessage(username, senderUUID, userInput, 'user');
                        await broadcast(userPrompt)
                    }
                    if (liveConfig.isAutoResponse || isEmptyTrigger) {
                        let [AIResponse, AIChatUserList] = await api.getAIResponse(engineMode, parsedMessage, userPrompt, liveConfig)
                        const AIResponseMessage = {
                            chatID: parsedMessage.chatID,
                            content: AIResponse,
                            username: `${liveConfig.selectedCharDisplayName}`,
                            type: 'AIResponse',
                            userColor: parsedMessage.userColor,
                            AIChatUserList: AIChatUserList
                        }
                        broadcast(AIResponseMessage)

                    }
                }
                //read the current userChat file
                if (chatID === 'UserChat') {
                    let data = await db.readUserChat()
                    let jsonArray = JSON.parse(data);
                    // Add the new object to the array
                    jsonArray.push(parsedMessage);
                    const updatedData = JSON.stringify(jsonArray, null, 2);
                    // Write the updated array back to the file
                    await db.writeUserChatMessage(uuid, parsedMessage.content)
                    const newUserChatMessage = {
                        chatID: chatID,
                        username: username,
                        userColor: userColor,
                        content: parsedMessage.content
                    }
                    await broadcast(newUserChatMessage)
                }
            } else {
                console.log(`unknown message type received (${parsedMessage.type})...ignoring...`)
            }


        } catch (error) {
            console.error('Error parsing message:', error);
            return;
        }
    });

    ws.on('close', async () => {
        // Remove the disconnected client from the clientsObject
        console.debug(`Client ${uuid} disconnected..removing from clientsObject`);
        delete clientsObject[uuid];
        updateConnectedUsers()
        await broadcastUserList();
    });

};

// Start the server
localServer.listen(wsPort, '0.0.0.0', () => {
    console.log('===========================')
    console.log(`Host Server is listening on all available network interfaces on port ${wsPort}`);
    console.log(`Typically, the Host should access ${color.yellow(`http://localhost:${wsPort}/`)} in your web browser.`)
    console.log('===========================')
});
guestServer.listen(wssPort, '0.0.0.0', () => {
    console.log(`The Guest Server is listening on port ${wssPort}`);
    console.log(`Run the ${color.yellow('Remote-Link.cmd')} file in the STMP directory`)
    console.log('to setup a Cloudflare tunnel for remote Guest connections.')
    console.log('===========================')
});

// Handle server shutdown via ctrl+c
process.on('SIGINT', () => {
    console.log('Server shutting down...');

    // Send a message to all connected clients
    const serverShutdownMessage = {
        type: 'forceDisconnect',
    };
    broadcast(serverShutdownMessage);

    // Close the WebSocket server
    wsServer.close(() => {
        console.log('Host websocket closed.');
    });
    wssServer.close(() => {
        console.log('Guest websocket closed.');
    });
    process.exit(0);
})
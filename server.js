const http = require('http');
const fs = require('fs');
const util = require('util');
const { v4: uuidv4 } = require('uuid');
const writeFileAsync = util.promisify(fs.writeFile);
const existsAsync = util.promisify(fs.exists);
const fsp = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const $ = require('jquery');
const characterCardParser = require('./character-card-parser.js');
const express = require('express');
const { url } = require('inspector');
const localApp = express();
const remoteApp = express();
localApp.use(express.static('public'));
remoteApp.use(express.static('public'));

//Import db handler from STMP/db.js
const db = require('./db.js');

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

//set the engine mode to either 'tabby' or 'horde'
let engineMode = 'tabby'

// Configuration
const apiKey = "_YOUR_API_KEY_HERE_";
const authString = "_STUsername_:_STPassword_";
const secretsPath = path.join(__dirname, 'secrets.json');

console.log("===========================");
console.log("SillyTavern MultiPlayer");

// Create directory if it does not exist
function createDirectoryIfNotExist(path) {
    if (!fs.existsSync(path)) {
        try {
            fs.mkdirSync(path, { recursive: true });
            console.log(`-- Created '${path}' folder.`);
        } catch (err) {
            console.error(`Failed to create '${path}' folder. Check permissions or path.`);
            process.exit(1);
        }
    }
}

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

const TabbyURL = 'http://127.0.0.1:5000';
const TabbyGenEndpoint = '/v1/completions';

//message templates
var sysMessage = {
    'chatID': 'UserChat',
    'type': '',
    'targetUsername': '',
    'userList': [],
    'username': '[System]',
    'content': ''
}

const secretsObj = JSON.parse(fs.readFileSync('secrets.json', { encoding: 'utf8' }));
const tabbyAPIkey = secretsObj.api_key_tabby
const STBasicAuthCredentials = secretsObj?.sillytavern_basic_auth_string

// Create a WebSocket server
const wsServer = new WebSocket.Server({ server: localServer });
const wssServer = new WebSocket.Server({ server: guestServer });
wsServer.setMaxListeners(0);
wssServer.setMaxListeners(0);

// Arrays to store connected clients of each server
var clientsObject = [];
var connectedUserNames = [];
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

async function initFiles() {
    const configPath = 'config.json';
    const secretsPath = 'secrets.json';

    // Default values for config.json
    const defaultConfig = {
        engineMode: 'tabby',
        selectedCharacter: 'public/characters/CodingSensei.png',
        responseLength: 200,
        contextSize: 2048,
        isAutoResponse: true,
        selectedPreset: "public/api-presets/Tabby-Temp-2_MinP-0.2.json",
        instructFormat: "public/instructFormats/ChatML.json",
        D1JB: ''
    };

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
        liveConfig = await readConfig()
    } else {
        console.log('Loading config.json...');
        liveConfig = await readConfig()
        console.log(liveConfig)

    }

    // Check and create secrets.json if it doesn't exist
    if (!await existsAsync(secretsPath)) {
        console.log('Creating secrets.json with default values...');
        await writeFileAsync(secretsPath, JSON.stringify(defaultSecrets, null, 2));
        console.log('secrets.json created, please update it with real credentials now and restart the server.');
    }
}

// Create directories
createDirectoryIfNotExist("./public/api-presets");

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

async function charaRead(img_url, input_format) {
    return characterCardParser.parse(img_url, input_format);
}

async function getCardList() {
    const path = 'public/characters'
    const files = await fs.promises.readdir(path);
    var cards = []
    var i = 0
    //console.log('Files in directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            const cardData = await charaRead(fullPath);
            var jsonData = JSON.parse(cardData);
            jsonData.filename = `${path}/${file}`
            cards[i] = {
                name: jsonData.name,
                filename: jsonData.filename
            }
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
        }
        i++
    }
    return cards;
}

async function getInstructList() {
    const path = 'public/instructFormats'
    const files = await fs.promises.readdir(path);
    var instructs = []
    var i = 0
    //console.log('Files in directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            const cardData = await readFile(fullPath);
            var jsonData = JSON.parse(cardData);
            jsonData.filename = `${path}/${file}`
            instructs[i] = {
                name: jsonData.name,
                filename: jsonData.filename
            }
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
        }
        i++
    }
    return instructs;
}

async function getSamplerPresetList() {
    const path = 'public/api-presets'
    const files = await fs.promises.readdir(path);
    var presets = []
    var i = 0
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            presets[i] = {
                name: file.replace('.json', ''),
                filename: fullPath,
            }
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
        }
        i++
    }
    return presets;
}

async function broadcast(message) {
    console.log('broadcasting this:')
    console.log(message)
    Object.keys(clientsObject).forEach(clientUUID => {
        const client = clientsObject[clientUUID];
        const socket = client.socket;

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    });
}

// Broadcast the updated array of connected usernames to all clients
async function broadcastUserList() {
    const userListMessage = {
        type: 'userList',
        userList: connectedUserNames.sort()
    };
    broadcast(userListMessage);
    console.log(`[BroadCast]: ${JSON.stringify(userListMessage)}`)
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

    // Retrieve the UUID from the query parameters
    const uuid = urlParams.get('uuid');
    if (uuid !== null && uuid !== undefined) {
        console.log('Client connected with UUID:', uuid);
    } else {
        console.log('Client connected without UUID');
    }
    let thisUserColor = usernameColors[Math.floor(Math.random() * usernameColors.length)];
    // Store the connected client in the appropriate array based on the server
    let user = await db.getUser(uuid);
    if (user) {
        thisUserColor = user.username_color;
    }

    const thisUserUniqueId = uuid || uuidv4();
    clientsObject[thisUserUniqueId] = {
        socket: ws,
        color: thisUserColor,
        role: type
    };

    const cardList = await getCardList()
    const instructList = await getInstructList()
    const samplerPresetList = await getSamplerPresetList()
    var AIChatJSON = await db.readAIChat();
    var userChatJSON = await db.readUserChat()
    console.log(`userChatJSON: ${userChatJSON}`);

    if (!liveConfig.selectedCharacter || liveConfig.selectedCharacter === '') {
        console.log('No selected character found, setting to default character...')
        liveConfig.selectedCharacter = cardList[0].filename;
        liveConfig.selectedCharDisplayName = cardList[0].name;
        await writeConfig(liveConfig, 'selectedCharacter', liveConfig.selectedCharacter)
        await writeConfig(liveConfig, 'selectedCharDisplayName', liveConfig.selectedCharDisplayName)
    }

    //send connection confirmation along with both chat history, card list, selected char, and assigned user color.
    let connectionConfirmedMessage = {
        clientUUID: thisUserUniqueId,
        type: 'connectionConfirmed',
        chatHistory: userChatJSON,
        AIChatHistory: AIChatJSON,
        userList: connectedUserNames,
        engineMode: engineMode,
        isAutoResponse: isAutoResponse,
        contextSize: contextSize,
        responseLength: responseLength,
        color: thisUserColor,
        role: type,
        selectedCharacterDisplayName: liveConfig.selectedCharDisplayName
    }
    if (type === 'host') {
        console.log("HOST CONNECTED")
        hostUUID = thisUserUniqueId
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

    //send connection confirmation along with chat history
    ws.send(JSON.stringify(connectionConfirmedMessage))
    //broadcastUserList()


    // Handle incoming messages from clients
    ws.on('message', async function (message) {
        console.log(`--- MESSAGE IN`)
        // Parse the incoming message as JSON
        let parsedMessage;


        try {
            console.log('')
            parsedMessage = JSON.parse(message);
            const senderUUID = parsedMessage.UUID

            //If there is no UUID, then this is a new client and we need to add it to the clientsObject
            let clientObject = clientsObject[parsedMessage.UUID];
            if (!clientObject) {
                clientObject = {
                    username: '',
                    color: '',
                    role: ''
                };
                clientsObject[parsedMessage.UUID] = clientObject;
            }
            
            //console.log(`==========ALL CLIENTS==========`)
            let allClientUUIDs = Object.keys(clientsObject)

            //console.log(allClientUUIDs)
            //console.log(`connectedUsernames: ${connectedUserNames}`)
            //console.log(`==========INCOMING MESSAGE==========`)
            //console.log(parsedMessage)


            //console.log('==========CLIENT OBJECT==========')
            //console.log(clientObject.username, clientObject.role)
            //stringifiedMessage = JSON.stringify(message)
            console.log('Received message from client:', parsedMessage);

            //first check if the sender is host, and if so, process possible host commands
            if (senderUUID === hostUUID) {
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
                    await writeConfig(liveConfig, 'isAutoResponse', isAutoResponse)
                    return
                }
                else if (parsedMessage.type === 'adjustContextSize') {
                    contextSize = parsedMessage.value
                    liveConfig.contextSize = contextSize
                    await writeConfig(liveConfig, 'contextSize', contextSize)
                    return

                }
                else if (parsedMessage.type === 'adjustResponseLength') {
                    responseLength = parsedMessage.value
                    liveConfig.responseLength = responseLength
                    await writeConfig(liveConfig, 'responseLength', responseLength)
                    return

                }
                else if (parsedMessage.type === 'clearAIChat') {
                    await saveAndClearChat('AIChat')
                    const clearAIChatInstruction = {
                        type: 'clearAIChat'
                    }
                    await broadcast(clearAIChatInstruction);
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
                    await writeConfig(liveConfig)
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
                    const samplerData = await readFile(selectedPreset)
                    liveConfig.samplers = samplerData
                    await writeConfig(liveConfig, 'samplers', liveConfig.samplers)
                    await writeConfig(liveConfig, 'selectedPreset', selectedPreset)
                    await broadcast(changePresetMessage);
                    return
                }
                else if (parsedMessage.type === 'changeInstructFormat') {
                    const changeInstructMessage = {
                        type: 'changeInstructFormat',
                        newInstructFormat: parsedMessage.newInstructFormat
                    }
                    liveConfig.instructFormat = parsedMessage.newInstructFormat
                    const instructSequences = await readFile(liveConfig.instructFormat)
                    liveConfig.instructSequences = instructSequences
                    await writeConfig(liveConfig, 'instructSequences', liveConfig.instructSequences)
                    await writeConfig(liveConfig, 'instructFormat', parsedMessage.newInstructFormat)
                    await broadcast(changeInstructMessage);
                    return
                }
                else if (parsedMessage.type === 'changeD1JB') {
                    const changeD1JBMessage = {
                        type: 'changeD1JB',
                        newD1JB: parsedMessage.newD1JB
                    }
                    liveConfig.D1JB = parsedMessage.newD1JB
                    await writeConfig(liveConfig)
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
                        let AIResponse = await getAIResponse()
                        const AIResponseMessage = {
                            chatID: parsedMessage.chatID,
                            content: AIResponse,
                            username: `${liveConfig.selectedCharDisplayName}`,
                            type: 'AIResponse',
                            userColor: parsedMessage.userColor
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
                    await writeConfig(liveConfig, 'engineMode', engineMode)
                    await broadcast(modeChangeMessage);
                    return
                }
            }
            //process universal message types
            console.log(`processing universal message types...`)

            if (parsedMessage.type === 'connect') {
                console.log('saw connect message from client')
                clientObject.username = parsedMessage.username;
                await db.upsertUser(senderUUID, clientObject.username, thisUserColor);
                console.log(`Adding ${clientObject.username} to connected user list..`)
                //the intent with this IF check is to give special charater to the host name
                //but it causes problems elsewhere (can't filter from the userList, gets sent to AI chat calls)
                if (senderUUID === hostUUID) {
                    connectedUserNames.push(`${clientObject.username}`)
                } else {
                    connectedUserNames.push(clientObject.username)
                }
                await broadcastUserList()

            }
            else if (parsedMessage.type === 'disconnect') {
                const disconnectedUsername = clientObject.username;
                console.log(`Removing ${disconnectedUsername} from the User List...`)
                connectedUserNames = connectedUserNames.filter(username => username !== disconnectedUsername);
                await broadcastUserList()

            }
            else if (parsedMessage.type === 'usernameChange') {
                const oldName = parsedMessage.oldName;
                connectedUserNames = connectedUserNames.filter(username => username !== oldName);
                ws.username = parsedMessage.newName
                connectedUserNames.push(parsedMessage.newName)
                const nameChangeNotification = {
                    type: 'userChangedName',
                    content: `[System]: ${oldName} >>> ${parsedMessage.newName}`
                }
                console.log(nameChangeNotification)
                console.log('sending notification of username change')
                await broadcast(nameChangeNotification);
                await broadcastUserList()
            }
            else if (parsedMessage.type === 'chatMessage') { //handle normal chat messages
                //having this enable sends the user's colors along with the response message if it uses parsedMessage as the base..
                parsedMessage.userColor = thisUserColor
                const chatID = parsedMessage.chatID;
                const username = parsedMessage.username
                const userColor = thisUserColor
                const userInput = parsedMessage.userInput
                const hordePrompt = parsedMessage.content?.prompt
                var userPrompt

                //setup the userPrompt arrayin order to send the input into the AIChat box
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
                        await db.writeAIChatMessage(senderUUID, userInput);
                        await broadcast(userPrompt)
                    }
                    if (liveConfig.isAutoResponse || isEmptyTrigger) {
                        let AIResponse = await getAIResponse()
                        const AIResponseMessage = {
                            chatID: parsedMessage.chatID,
                            content: AIResponse,
                            username: `${liveConfig.selectedCharDisplayName}`,
                            type: 'AIResponse',
                            userColor: parsedMessage.userColor
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


            async function getAIResponse() {
                try {
                    let jsonArray = [];
                    let isEmptyTrigger = userPrompt.content.length == 0 ? true : false
                    console.log(`Is this an empty trigger? ${isEmptyTrigger}`)

                    //if it's not an empty trigger from host
                    //if userInput is empty we can just request the AI directly
                    let charFile = liveConfig.selectedCharacter
                    console.log(`selected character: ${charFile}`)
                    let cardData = await charaRead(charFile, 'png')
                    let cardJSON = JSON.parse(cardData)
                    let charName = cardJSON.name
                    var finalCharName = JSON.stringify(`\n${charName}:`);
                    //strips out HTML tags from last message
                    var fixedFinalCharName = JSON.parse(finalCharName.replace(/<[^>]+>/g, ''));

                    const fullPromptforAI = await addCharDefsToPrompt(charFile, fixedFinalCharName, parsedMessage.username)
                    const samplers = JSON.parse(liveConfig.samplers);
                    //apply the selected preset values to the API call
                    for (const [key, value] of Object.entries(samplers)) {
                        parsedMessage.APICallParams[key] = value;
                    }
                    //add full prompt to API call
                    parsedMessage.APICallParams.prompt = fullPromptforAI;
                    //ctx and response length for Tabby
                    parsedMessage.APICallParams.truncation_length = Number(liveConfig.contextSize)
                    parsedMessage.APICallParams.max_tokens = Number(liveConfig.responseLength)
                    //ctx and response length for Horde
                    parsedMessage.APICallParams.max_context_length = Number(liveConfig.contextSize)
                    parsedMessage.APICallParams.max_length = Number(liveConfig.responseLength)

                    //add stop strings
                    const APICallParams = await setStopStrings(parsedMessage.APICallParams)

                    var AIResponse = '';
                    if (liveConfig.engineMode === 'horde') {
                        const [hordeResponse, workerName, hordeModel, kudosCost] = await requestToHorde(APICallParams);
                        AIResponse = hordeResponse;
                    }
                    else {
                        AIResponse = trimIncompleteSentences(await requestToTabby(APICallParams))
                    }

                    await db.upsertChar(charName, charName, parsedMessage.userColor);
                    await db.writeAIChatMessage(charName, AIResponse);

                    return AIResponse

                } catch (error) {
                    console.log(error);
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            return;
        }
    });

    ws.on('close', () => {
        // Remove the disconnected client from the clientsObject
        console.debug('Client disconnected:', uuid);
        console.log(clientsObject)
        // Pop the client from the clientsObject
        delete clientsObject[uuid];
        console.log(clientsObject)
    });
};


function countTokens(str) {
    let chars = str.length
    let tokens = Math.ceil(chars / 3)
    //console.log(`estimated tokens: ${tokens}`)
    return tokens
}


async function readConfig() {
    await acquireLock()
    //await delay(100)
    //console.log('--- READ CONFIG started')
    return new Promise(async (resolve, reject) => {
        fs.readFile('config.json', 'utf8', async (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log('config.json not found, initializing with default values.');
                    try {
                        //console.log('--- READ CONFIG calling initconfig')
                        //await delay(100)
                        await initConfig();
                        //console.log('----- CREATED NEW CONFIG FILE, RETURNING IT')
                        releaseLock()
                        resolve(liveConfig); // Assuming liveconfig is accessible here
                    } catch (initErr) {
                        console.error('An error occurred while initializing the file:', initErr);
                        releaseLock()
                        reject(initErr);
                    }
                } else {
                    console.error('An error occurred while reading the file:', err);
                    releaseLock()
                    reject(err);
                }
            } else {
                try {
                    //await delay(100)
                    const configData = JSON.parse(data); // Parse the content as JSON
                    releaseLock()
                    resolve(configData);
                } catch (parseErr) {
                    console.error('An error occurred while parsing the JSON:', parseErr);
                    releaseLock()
                    reject(parseErr);
                }
            }
        });
    });
}

async function writeConfig(configObj, key, value) {
    await acquireLock()
    await delay(100)
    //let newObject = await readConfig()
    if (key) {
        configObj[key] = value;
        console.log(`Config updated: ${key}`); // = ${value}`);
    }
    const writableConfig = JSON.stringify(configObj, null, 2); // Serialize the object with indentation
    fs.writeFile('config.json', writableConfig, 'utf8', writeErr => {
        if (writeErr) {
            console.error('An error occurred while writing to the file:', writeErr);
            releaseLock()
            return;
        }
        console.log('config.json updated.');
        releaseLock()
    });
}

async function readFile(file) {
    await acquireLock()
    //console.log(`[readFile()] Reading ${file}...`)
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log(`ERROR: ${file} not found`);
                } else {
                    console.error('An error occurred while reading the file:', err);
                    releaseLock()
                    reject(err);
                }
            } else {
                releaseLock()
                resolve(data);
            }
        });
    });
}

async function acquireLock() {
    const stackTrace = new Error().stack;
    const callingFunctionName = stackTrace.split('\n')[2].trim().split(' ')[1];
    //console.log(`${callingFunctionName} trying to acquiring lock..`)
    let lockfilePath = 'lockfile.lock'
    while (true) {
        try {
            // Attempt to create the lock file exclusively
            await fs.promises.writeFile(lockfilePath, '', { flag: 'wx' });
            //console.log('lock acquired')
            return;
        } catch (error) {
            //console.log('lockfile already exists')
            // File already exists, wait and retry
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

async function releaseLock() {
    const stackTrace = new Error().stack;
    const callingFunctionName = stackTrace.split('\n')[2].trim().split(' ')[1];
    //console.log(`${callingFunctionName} releasing lock..`)
    let lockfilePath = 'lockfile.lock'
    try {
        await fs.promises.unlink(lockfilePath);
    } catch (error) {
        console.log(error)
    }
}

function trimIncompleteSentences(input, include_newline = false) {
    const punctuation = new Set(['.', '!', '?', '*', '"', ')', '}', '`', ']', '$', '。', '！', '？', '”', '）', '】', '】', '’', '」', '】']); // extend this as you see fit
    let last = -1;
    //console.log(`--- BEFORE:`)
    //console.log(input)
    //console.log(`--- AFTER:`)
    for (let i = input.length - 1; i >= 0; i--) {
        const char = input[i];
        if (punctuation.has(char)) {
            last = i;
            break;
        }
        if (include_newline && char === '\n') {
            last = i;
            break;
        }
    }
    if (last === -1) {
        //console.log(input.trimEnd())
        return input.trimEnd();
    }
    let trimmedString = input.substring(0, last + 1).trimEnd();

    //console.log(trimmedString)
    return trimmedString;
}

async function ObjectifyChatHistory() {
    return new Promise(async (resolve, reject) => {
        await delay(100)
        let data = await db.readAIChat();
        try {
            // Parse the existing contents as a JSON array
            let chatHistory = JSON.parse(data);
            resolve(chatHistory);
        } catch (parseError) {
            console.error('An error occurred while parsing the JSON:', parseError);
            reject(parseError);
        }
    });
}

async function setStopStrings(APICallParams) {

    let chatHistory = await ObjectifyChatHistory();
    let usernames = new Set();

    // Iterate over chatHistory and extract unique usernames
    for (const obj of chatHistory) {
        const username = obj.username;
        usernames.add(username);
    }
    let targetObj = []

    // Generate permutations for each unique username
    for (const username of usernames) {
        targetObj.push(
            `${username}:`,
            `\n${username}:`,
            ` ${username}:`,
            `\n ${username}:`
        );
    }

    if (liveConfig.engineMode === 'tabby') {
        APICallParams.stop = targetObj
    } else {
        APICallParams.params.stop_sequence = targetObj
    }

    return APICallParams
}

async function addCharDefsToPrompt(charFile, lastUserMesageAndCharName, username) {
    return new Promise(async function (resolve, reject) {
        try {
            let charData = await charaRead(charFile, 'png')
            let chatHistory = await ObjectifyChatHistory()

            //replace {{user}} and {{char}} for character definitions
            const jsonData = JSON.parse(charData)
            const charName = jsonData.name
            const jsonString = JSON.stringify(jsonData);
            var replacedString = jsonString.replace(/{{user}}/g, username);
            replacedString = replacedString.replace(/{{char}}/g, jsonData.name);
            const replacedData = JSON.parse(replacedString);

            //replace {{user}} and {{char}} for D1JB
            var D1JB = liveConfig.D1JB || ''
            var replacedD1JB = D1JB.replace(/{{user}}/g, username);
            replacedD1JB = replacedD1JB.replace(/{{char}}/g, jsonData.name);

            const instructSequence = JSON.parse(liveConfig.instructSequences)
            const inputSequence = instructSequence.input_sequence
            const outputSequence = instructSequence.output_sequence
            const systemSequence = instructSequence.system_sequence
            const endSequence = instructSequence.end_sequence
            const systemMessage = `You are ${charName}. Write ${charName}'s next response in this roleplay chat with ${username}.`

            //add the char description, personality, scenario, and first message
            var stringToReturn =
                `${systemSequence}${systemMessage}\n${replacedData?.description}\n${replacedData?.personality.trim()}\n${replacedData?.scenario.trim()}${endSequence}${outputSequence}${replacedData.name.trim()}: ${replacedData?.first_mes.trim()}\n${endSequence}`
            //add the chat history
            let promptTokens = countTokens(stringToReturn)
            //console.log(`before adding ChatHIstory, Prompt is: ~${promptTokens}`)
            let insertedItems = []
            for (let i = chatHistory.length - 1; i >= 0; i--) {
                let obj = chatHistory[i];
                let newItem
                if (obj.username === charName) {
                    newItem = `${outputSequence}${obj.username}: ${obj.content}\n${endSequence}`;
                } else {
                    newItem = `${inputSequence}${obj.username}: ${obj.content}\n${endSequence}`;
                }

                let newItemTokens = countTokens(newItem);
                if (promptTokens + newItemTokens < liveConfig.contextSize) {
                    promptTokens += newItemTokens;
                    //console.log(`added new item, prompt tokens: ~${promptTokens}`);
                    insertedItems.push(newItem); // Add new item to the array
                }
            }

            // Reverse the array before appending to insertedChatHistory
            let reversedItems = insertedItems.reverse();
            let insertedChatHistory = reversedItems.join('');
            stringToReturn += insertedChatHistory
            //add the final first mes and userInput        
            stringToReturn += `${systemSequence}${replacedD1JB}\n${endSequence}`
            stringToReturn += `${outputSequence}${lastUserMesageAndCharName.trim()}`;
            stringToReturn = stringToReturn.trim()
            resolve(stringToReturn);
        } catch (error) {
            console.error('Error reading file:', error);
            reject(error)
        }
    })
}

async function requestToHorde(stringToSend, stoppingStrings = '') {
    console.log('Sending Horde request...');
    //the ST server must be running with CSRF turned off in order for this to work.
    var url = 'http://127.0.0.1:8000/api/horde/generate-text';
    //these headers assume there is basicAuth enabled on your ST server
    //replace the btoa('') with your credentials in a user:pass format within the single quotes
    //alternatively remove that line if you are not using AUTH
    var headers = {
        'Content-Type': 'application/json',
        'Cache': 'no-cache',
        'Authorization': 'Basic ' + btoa(STBasicAuthCredentials),
        "Client-Agent": "SillyTavern:UNKNOWN:Cohee#1207"
    };

    var body = JSON.stringify(stringToSend);
    console.log(`--- horde payload:`)
    console.log(stringToSend)

    var timeout = 30000; // Timeout value in milliseconds (30 seconds)

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: body,
        timeout: timeout
    })
    const data = await response.json()

    if (response.ok) {
        var MAX_RETRIES = 240;
        var CHECK_INTERVAL = 5000;
        var task_id = data.id;
        if (task_id === undefined) {
            console.log('no task ID, aborting')
            return 'error requesting Horde'
        }
        console.log(`horde task ID ${task_id}`)

        for (var retryNumber = 0; retryNumber < MAX_RETRIES; retryNumber++) {

            var status_url = "https://horde.koboldai.net/api/v2/generate/text/status/" + task_id;
            var status_headers = {
                "Client-Agent": 'SillyTavern:UNKNOWN:Cohee#1207',
            };

            await new Promise(function (resolve) {
                setTimeout(resolve, CHECK_INTERVAL);
            });

            var statusResponse = await (await fetch(status_url, status_headers)).json()
            //console.log(statusResponse)
            console.log('Horde status check ' + (retryNumber + 1) + ': ' + statusResponse.wait_time + ' secs left');
            if (
                statusResponse.done &&
                Array.isArray(statusResponse.generations) &&
                statusResponse.generations.length > 0
            ) {
                var workerName = statusResponse.generations[0].worker_name;
                var hordeModel = statusResponse.generations[0].model;
                var text = statusResponse.generations[0].text;
                var kudosCost = statusResponse.kudos + 2
                console.log('Raw Horde response: ' + text);
                console.log(`Worker: ${workerName}, Model:${hordeModel}`)
                return [text, workerName, hordeModel, kudosCost]
            }
        }
    } else {
        console.log('Error while requesting ST');
        console.log(response)
    };
}

async function requestToTabby(APICallParamsAndPrompt) {
    //message needs to be the ENTIRE API call, including params and chat history..
    try {
        console.log('Sending Tabby request..');

        const url = TabbyURL + TabbyGenEndpoint;

        const headers = {
            'Content-Type': 'application/json',
            'Cache': 'no-cache',
            'x-api-key': tabbyAPIkey,
            'Authorization': `Bearer ${tabbyAPIkey}`,
        };

        //old code for pulling from an external JSON file to get gen params, currently these are provided by client.html WS messages
        //TODO: revert to external JSON and only pull necessary variables from client.html WS pings.

        //const TabbyAPICallParams = JSON.parse(fs.readFileSync('TabbyAPICall.json', 'utf-8'));
        //TabbyAPICallParams['prompt'] = stringToSend;
        //TabbyAPICallParams['stopping_strings'] = stoppingStrings;

        const body = JSON.stringify(APICallParamsAndPrompt);
        console.log(APICallParamsAndPrompt)

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body,
            timeout: 0,
        })
        let JSONResponse = await response.json()
        console.log(JSONResponse)
        let text = JSONResponse.choices[0].text

        return text;
    } catch (error) {
        console.log('Error while requesting ST-Tabby');
        const line = error.stack.split('\n').pop().split(':').pop();
        console.log(line);
        console.log(error);
    }
}

// Start the server
localServer.listen(wsPort, () => {
    console.log('===========================')
    console.log(color.yellow(`Host Server is listening on http://localhost:${wsPort}`));
    console.log('The Host User (you) should connect to this address.')
    console.log('===========================')
});
guestServer.listen(wssPort, () => {
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

const http = require('http');
const fs = require('fs');
const util = require('util');
const WebSocket = require('ws');
const crypto = require('crypto');
const writeFileAsync = util.promisify(fs.writeFile);
const existsAsync = util.promisify(fs.exists);
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const $ = require('jquery');
const express = require('express');

const { logger } = require('./src/log.js');
const localApp = express();
const remoteApp = express();
localApp.use(express.static('public'));
remoteApp.use(express.static('public'));

//SQL DB
const db = require('./src/db.js');
//flat file manipulation
const fio = require('./src/file-io.js')
const api = require('./src/api-calls.js');

let selectedAPI = 'Default'


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
    '#FF8A8A',  // Light Red
    '#FFC17E',  // Light Orange
    '#FFEC8A',  // Light Yellow
    '#6AFF9E',  // Light Green
    '#6ABEFF',  // Light Blue
    '#C46AFF',  // Light Purple
    '#FF6AE4',  // Light Magenta
    '#FF6A9C',  // Light Pink
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


fio.releaseLock()
api.getAPIDefaults()
//populate array with all cards on server start
//mostly to make SQL recognize them all
//previously we waited for a user to connect to do this

let cardList

// Configuration
const apiKey = "_YOUR_API_KEY_HERE_";
const authString = "_STUsername_:_STPassword_";
const secretsPath = path.join(__dirname, 'secrets.json');
let engineMode = 'TC'

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
var isStreaming = true
var responseLength = 200
var contextSize = 4096
var liveConfig, liveAPI, secretsObj, TCAPIkey, STBasicAuthCredentials

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateServerKeys() {

    // Generate a 16-byte hex string for the host key
    hostKey = crypto.randomBytes(16).toString('hex');

    // Generate a 16-byte hex string for the mod key
    modKey = crypto.randomBytes(16).toString('hex');

    if (fs.existsSync(secretsPath)) {
        secretsObj = JSON.parse(fs.readFileSync(secretsPath, { encoding: 'utf8' }));
        if (secretsObj.hostKey !== undefined && secretsObj.hostKey !== '') {
            hostKey = secretsObj.hostKey
        }
        if (secretsObj.modKey !== undefined && secretsObj.modKey !== '') {
            modKey = secretsObj.modKey
        }
    }

    return [hostKey, modKey]
}

async function initFiles() {
    const configPath = 'config.json';
    const secretsPath = 'secrets.json';

    // Default values for config.json
    const defaultConfig = {
        promptConfig: {
            engineMode: 'TC',
            responseLength: "200",
            contextSize: "2048",
            isAutoResponse: true,
            isStreaming: true,
            cardList: {},
            selectedCharacter: 'public/characters/CodingSensei.png',
            selectedCharacterDisplayName: 'Coding Sensei',
            samplerPresetList: {},
            selectedSamplerPreset: "public/api-presets/TC-Deterministic.json",
            instructList: {},
            selectedInstruct: "public/instructFormats/None.json",
            systemPrompt: '',
            D4AN: '',
            D4CharDefs: false,
            D1JB: '',
            APIList: {},
            selectedAPI: "Default",
        },
        APIConfig: {
            name: "Default",
            endpoint: "localhost:5000",
            key: "",
            type: "TC",
            claude: 0,
            created_at: "",
            last_used_at: ""
        },
        crowdControl: {
            AIChatDelay: "2",
            userChatDelay: "2",
        }
    };

    async function mainInit() {
        const instructSequences = await fio.readFile(defaultConfig.promptConfig.selectedInstruct);
        defaultConfig.instructSequences = instructSequences;

        const samplerData = await fio.readFile(defaultConfig.promptConfig.selectedSamplerPreset);
        defaultConfig.samplers = samplerData;

        defaultConfig.selectedCharacterDisplayName = 'Coding Sensei';

        // Default values for secrets.json
        const defaultSecrets = {
            api_key: 'YourAPIKey',
            authString: 'YourAuthString',
        };

        // Check and create config.json if it doesn't exist
        if (!(await existsAsync(configPath))) {
            logger.warn('Creating config.json with default values...');
            await writeFileAsync(configPath, JSON.stringify(defaultConfig, null, 2));
            logger.debug('config.json created.');
            liveConfig = await fio.readConfig();
        } else {
            logger.debug('Loading config.json...');
            liveConfig = await fio.readConfig();
        }

        // Check and create secrets.json if it doesn't exist
        if (!(await existsAsync(secretsPath))) {
            logger.warn('Creating secrets.json with default values...');
            await writeFileAsync(secretsPath, JSON.stringify(defaultSecrets, null, 2));
            logger.warn('secrets.json created, please update it with real credentials now and restart the server.');
        }

        cardList = await fio.getCardList();
        //logger.debug(cardList);

        if (!liveConfig?.promptConfig?.selectedCharacter || liveConfig?.promptConfig?.selectedCharacter === '') {
            logger.warn('No selected character found, getting the latest...');
            let latestCharacter = await db.getLatestCharacter();
            logger.debug(latestCharacter);
            if (!latestCharacter) {
                // For first runs they will have no character in the DB yet
                logger.info('Database had no character in it! Adding Coding Sensei..');
                await db.upsertChar('Coding Sensei', 'Coding Sensei', 'green');
                latestCharacter = await db.getLatestCharacter();
                logger.debug(latestCharacter);
            }

            liveConfig.promptConfig.selectedCharacter = latestCharacter.char_id;
            liveConfig.promptConfig.selectedCharacterDisplayName = latestCharacter.displayname; // For hosts
            liveConfig.selectedCharacterDisplayName = latestCharacter.displayname; // For guest
            logger.info('Writing character info to liveConfig and config.json');
            await fio.writeConfig(liveConfig, 'promptConfig.selectedCharacter', latestCharacter.char_id);
            await fio.writeConfig(liveConfig, 'promptConfig.selectedCharacterDisplayName', latestCharacter.displayname);
            await fio.writeConfig(liveConfig, 'selectedCharacterDisplayName', latestCharacter.displayname);
        }

        secretsObj = JSON.parse(fs.readFileSync('secrets.json', { encoding: 'utf8' }));
        // TCAPIkey = secretsObj.api_key
        STBasicAuthCredentials = secretsObj?.sillytavern_basic_auth_string;
        logger.info('File initialization complete!');
    }

    await mainInit();
    let [hostKey, modKey] = generateServerKeys();

    console.log('')
    console.log('')
    console.log('')
    logger.info('Starting SillyTavern MultiPlayer...')

    // Start the server
    localServer.listen(wsPort, '0.0.0.0', () => {
        logger.info('===========================');
        logger.info(`Host Server: ${color.yellow(`http://localhost:${wsPort}/`)}`);
        logger.info('===========================');
    });

    guestServer.listen(wssPort, '0.0.0.0', () => {
        logger.info(`Guest Server: ${color.yellow(`http://localhost:${wssPort}/`)}`);
        logger.info(`Run ${color.yellow('Remote-Link.cmd')} to make a Cloudflare tunnel for remote Guests.`);
        logger.info('===========================');
    });

    logger.info(`${color.yellow(`Host Key: ${hostKey}`)}`);
    logger.info(`${color.yellow(`Mod Key: ${modKey}`)}`);
}


// Create directories
fio.createDirectoryIfNotExist("./public/api-presets");

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

async function broadcast(message, role = 'all') {
    return new Promise(async (resolve, reject) => {
        try {

            Object.keys(clientsObject).forEach(async clientUUID => {
                const client = clientsObject[clientUUID];
                const socket = client.socket;
                if (socket?.readyState !== WebSocket.OPEN) {
                    return;
                }
                if (role === 'all') {
                    socket.send(JSON.stringify(message));
                } else {
                    const user = await db.getUser(clientUUID);
                    console.log(user)
                    const clientRole = user.role
                    if (clientRole === role) {
                        socket.send(JSON.stringify(message));
                    }
                }
                //change this to any valid type for logging
                //or change the logic to !== to log all
                if (message.type === "BuggyTypeHere") {
                    logger.debug(`Sent "${message.type}" message to ${client.username}(${role})`);
                    logger.debug(message);
                }
            })
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// Broadcast the updated array of connected usernames to all clients
//gets its own function because sent so often.
//TODO: could probably have 'userListMessage' split into a global and just use broadcast() instead
async function broadcastUserList() {
    const userListMessage = {
        type: 'userList',
        userList: connectedUsers
    };
    broadcast(userListMessage);
    logger.trace(`[UserList BroadCast]:`)
    logger.trace(connectedUsers)
}

async function removeLastAIChatMessage() {
    await db.removeLastAIChatMessage()
    let [AIChatJSON, sessionID] = await db.readAIChat();
    let jsonArray = JSON.parse(AIChatJSON)
    let chatUpdateMessage = {
        type: 'chatUpdate',
        chatHistory: jsonArray
    }
    logger.debug('sending AI Chat Update instruction to clients')
    broadcast(chatUpdateMessage);
}

async function saveAndClearChat(type) {
    if (type === 'AIChat') {
        await db.newSession();
    }
    else if (type === 'UserChat') {
        await db.newUserChatSession();
    }
    else {
        logger.warn('Unknown chat type, not saving chat history...')
    }
}

function duplicateNameToValue(array) {
    return array.map((obj) => ({ ...obj, value: obj.name }));
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
        logger.info('Client connected without UUID...assigning a new one..');
        //assign them a UUID
        uuid = uuidv4()
        logger.debug(`uuid assigned as ${uuid}`)
    } else {
        logger.info('Client connected with UUID:', uuid);
    }
    //check if we have them in the DB
    user = await db.getUser(uuid);
    logger.trace('initial user check:')
    logger.trace(user)
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
            logger.warn('COULD NOT FIND USERNAME FOR CLIENT')
            logger.warn('CONNECTION REJECTED')
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
    logger.debug(`Adding ${thisUserUsername} to connected user list..`)
    updateConnectedUsers()
    logger.trace('CONNECTED USERS')
    logger.trace(connectedUsers)
    logger.trace('CLIENTS OBJECT')
    logger.trace(clientsObject)
    logger.trace("USER =======")
    logger.trace(user)

    const instructList = await fio.getInstructList()
    const samplerPresetList = await fio.getSamplerPresetList()
    var [AIChatJSON, sessionID] = await db.readAIChat();
    var userChatJSON = await db.readUserChat()

    //send connection confirmation along with both chat history, card list, selected char, and assigned user color.
    let connectionConfirmedMessage = {
        clientUUID: uuid,
        type: 'guestConnectionConfirmed',
        chatHistory: userChatJSON,
        sessionID: sessionID,
        AIChatHistory: AIChatJSON,
        color: thisUserColor,
        role: thisUserRole,
        selectedCharacterDisplayName: liveConfig.selectedCharacterDisplayName || liveConfig.promptConfig.selectedCharacterDisplayName,
        userList: connectedUsers,
        crowdControl: {
            userChatDelay: liveConfig?.crowdControl.userChatDelay || "2",
            AIChatDelay: liveConfig?.crowdControl.AIChatDelay || "2",
        },

    }

    //send control-related metadata to the Host user
    if (thisUserRole === 'host') {
        connectionConfirmedMessage.type = 'connectionConfirmed'
        let apis = await db.getAPIs();
        apis = duplicateNameToValue(apis) //duplicate the name property as value property for each object in array. this is for selector population purposes.
        let APIConfig = await db.getAPI(liveConfig.promptConfig.selectedAPI);
        hostUUID = uuid

        //we need it to be inside liveConfig object for hosts
        logger.trace(connectionConfirmedMessage)


        let promptConfig = {
            cardList: cardList,
            selectedCharacter: liveConfig.promptConfig.selectedCharacter,
            selectedCharacterDisplayName: liveConfig.promptConfig.selectedCharacterDisplayName,
            contextSize: liveConfig.promptConfig.contextSize,
            responseLength: liveConfig.promptConfig.responseLength,
            instructList: instructList,
            selectedInstruct: liveConfig.promptConfig.selectedInstruct,
            samplerPresetList: samplerPresetList,
            selectedSamplerPreset: liveConfig.promptConfig.selectedSamplerPreset,
            engineMode: liveConfig.promptConfig.engineMode,
            isAutoResponse: liveConfig.promptConfig.isAutoResponse,
            isStreaming: liveConfig.promptConfig.isStreaming,
            D4CharDefs: liveConfig.promptConfig.D4CharDefs,
            D1JB: liveConfig.promptConfig.D1JB,
            D4AN: liveConfig.promptConfig.D4AN,
            systemPrompt: liveConfig.promptConfig.systemPrompt,
            APIList: apis, //the array of every API and its properties
            selectedAPI: liveConfig.promptConfig.selectedAPI,
        }
        connectionConfirmedMessage.liveConfig = {}

        connectionConfirmedMessage.liveConfig.crowdControl = connectionConfirmedMessage.crowdControl

        connectionConfirmedMessage.liveConfig.promptConfig = promptConfig
        connectionConfirmedMessage.liveConfig.APIConfig = APIConfig

        liveConfig = {}

        liveConfig.promptConfig = connectionConfirmedMessage.liveConfig.promptConfig
        liveConfig.APIConfig = connectionConfirmedMessage.liveConfig.APIConfig
        liveConfig.crowdControl = connectionConfirmedMessage.liveConfig.crowdControl

        await fio.writeConfig(liveConfig)
        liveConfig = await fio.readConfig()
        /*         console.log(`---------------------------LIVE CONFIG-----------------------------------------`)
                console.log(liveConfig)
                console.log(`---------------------------CONNECTION CONFIRM MESSAGE--------------------------`)
                console.log(connectionConfirmedMessage)
                console.log(`--------------------------------------------------------------------`) */
        await broadcastUserList()
        //logger.info(`the connection messsage to new client`,connectionConfirmedMessage)
        ws.send(JSON.stringify(connectionConfirmedMessage))

    } else {
        await broadcastUserList()
        //logger.info(`the connection messsage to new client`,connectionConfirmedMessage)
        ws.send(JSON.stringify(connectionConfirmedMessage))
    }



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

        logger.trace(`--- MESSAGE IN`)
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

            logger.debug('Received message from client:', parsedMessage);

            //first check if the sender is host, and if so, process possible host commands
            if (user.role === 'host') {
                if (parsedMessage.type === 'clientStateChange') {
                    logger.info('Received updated liveConfig from Host client...')

                    logger.info('Checking APIList for changes..')
                    await checkAPIListChanges(liveConfig, parsedMessage)

                    logger.info('writing liveConfig to file')
                    liveConfig = parsedMessage.value
                    await fio.writeConfig(liveConfig)
                    logger.info('broadcasting new liveconfig to all hosts')
                    let hostStateChangeMessage = {
                        type: 'hostStateChange',
                        value: liveConfig
                    }
                    await broadcast(hostStateChangeMessage, 'host');

                    let guestStateMessage = {
                        type: "guestStateChange",
                        state: {
                            selectedCharacter: liveConfig.promptConfig.selectedCharacterDisplayName,
                            userChatDelay: liveConfig.crowdControl.userChatDelay,
                            AIChatDelay: liveConfig.crowdControl.AIChatDelay
                        }

                    }
                    await broadcast(guestStateMessage, 'guest');
                    return
                }
                if (parsedMessage.type === 'clearChat') {
                    //clear the UserChat.json file
                    await saveAndClearChat('UserChat')
                    const clearUserChatInstruction = {
                        type: 'clearChat'
                    }
                    await broadcast(clearUserChatInstruction);
                    return
                }
                else if (parsedMessage.type === 'modelSelect') {
                    const selectedModel = parsedMessage.value;
                    logger.info(`Changing selected model for ${liveConfig.APIConfig.name} to ${selectedModel}..`)
                    liveConfig.APIConfig.selectedModel = selectedModel;
                    await db.upsertAPI(liveConfig.APIConfig);
                    liveConfig.promptConfig.APIList = await db.getAPIs();
                    await fio.writeConfig(liveConfig);
                    const settingChangeMessage = {
                        type: 'hostStateChange',
                        value: liveConfig
                    };
                    await broadcast(settingChangeMessage, 'host');
                    return;
                }
                else if (parsedMessage.type === 'testNewAPI') {
                    let result = await api.testAPI(parsedMessage.api, liveConfig)
                    console.log(result)
                    testAPIResult = {
                        type: 'testAPIResult',
                        result: result
                    }
                    //only send back to the user who is doing the test.
                    await ws.send(JSON.stringify(testAPIResult))
                    return
                }
                if (parsedMessage.type === 'modelListRequest') {
                    let modelList = await api.getModelList(parsedMessage.api);
                    let modelListResult = {};

                    if (typeof modelList === 'object') {
                        liveConfig.APIConfig = {
                            ...parsedMessage.api,
                            modelList: modelList,
                            selectedModel: modelList[0]
                        };

                        await db.upsertAPI(liveConfig.APIConfig);
                        liveConfig.promptConfig.APIList = await db.getAPIs();
                        await fio.writeConfig(liveConfig);

                        modelListResult = {
                            type: 'hostStateChange',
                            value: liveConfig
                        };
                    } else {
                        modelListResult = {
                            type: 'modelListError',
                            value: 'ERROR'
                        };
                    }

                    await ws.send(JSON.stringify(modelListResult));
                    return;
                }
                else if (parsedMessage.type === 'clearAIChat') {
                    await saveAndClearChat('AIChat')
                    const clearAIChatInstruction = {
                        type: 'clearAIChat'
                    }
                    await broadcast(clearAIChatInstruction);
                    let charFile = liveConfig.promptConfig.selectedCharacter
                    logger.debug(`selected character: ${charFile}`)
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
                    logger.trace('adding the first mesage to the chat file')
                    await db.writeAIChatMessage(charName, charName, firstMes, 'AI');
                    logger.trace(`Sending ${charName}'s first message to AI Chat..`)
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

                    liveConfig.promptConfig.selectedCharacter = parsedMessage.newChar
                    liveConfig.promptConfig.selectedCharacterDisplayName = parsedMessage.newCharDisplayName
                    await fio.writeConfig(liveConfig)
                    await db.upsertChar(parsedMessage.newChar, parsedMessage.newCharDisplayName, user.color)
                    await broadcast(changeCharMessage, 'host');

                    //this is necessary even though broadcast is wrapped in a promise..
                    await new Promise((resolve) => setTimeout(resolve, 0));

                    //send reduced message with displayname only to guests
                    delete changeCharMessage.char
                    changeCharMessage.type = 'changeCharacterDisplayName'
                    await broadcast(changeCharMessage, 'guest');
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
                            'color': user.color
                        }
                        handleResponse(
                            parsedMessage, selectedAPI, STBasicAuthCredentials, engineMode, user, liveConfig
                        );
                        return
                    } catch (parseError) {
                        logger.error('An error occurred while parsing the JSON:', parseError);
                        return;
                    }
                }

                //TODO: merge this into clientStateChange
                else if (parsedMessage.type === 'modeChange') {
                    engineMode = parsedMessage.newMode
                    const modeChangeMessage = {
                        type: 'modeChange',
                        engineMode: engineMode
                    }
                    liveConfig.promptConfig.engineMode = engineMode
                    await fio.writeConfig(liveConfig, 'promptConfig.engineMode', engineMode)
                    await broadcast(modeChangeMessage, 'host');
                    return
                }
                else if (parsedMessage.type === 'pastChatsRequest') {
                    const pastChats = await db.getPastChats()
                    const pastChatsListMessage = {
                        type: 'pastChatsList',
                        pastChats: pastChats
                    }
                    await broadcast(pastChatsListMessage, 'host')
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
                    logger.debug(result, wasActive)
                    if (result === 'ok') {
                        const pastChatsDeleteConfirmation = {
                            type: 'pastChatDeleted',
                            wasActive: wasActive
                        }
                        await broadcast(pastChatsDeleteConfirmation, 'host')
                        return
                    } else {
                        return
                    }
                }
                else if (parsedMessage.type === 'messageDelete') {
                    const result = await db.deleteMessage(parsedMessage.mesID)
                    if (result === 'ok') {
                        const [pastChat, sessionID] = await db.readAIChat(parsedMessage.sessionID)
                        let jsonArray = JSON.parse(pastChat)
                        const pastChatsLoadMessage = {
                            type: 'pastChatToLoad',
                            pastChatHistory: jsonArray,
                            sessionID: sessionID
                        }
                        await broadcast(pastChatsLoadMessage)
                        return
                    } else {
                        return
                    }

                }
                else if (parsedMessage.type === 'messageContentRequest') {
                    const messageContent = await db.getMessage(parsedMessage.mesID)
                    logger.warn(messageContent)
                    const messageContentResponse = {
                        type: 'messageContentResponse',
                        content: messageContent
                    }
                    ws.send(JSON.stringify(messageContentResponse))
                    return
                }
                else if (parsedMessage.type === 'messageEdit') {
                    const mesID = parsedMessage.mesID
                    const sessionID = parsedMessage.sessionID
                    const newMessage = parsedMessage.newMessageContent

                    const result = await db.editMessage(sessionID, mesID, newMessage)
                    if (result === 'ok') {
                        const [pastChat, uselessSessionID] = await db.readAIChat(sessionID)
                        let jsonArray = JSON.parse(pastChat)
                        const pastChatsLoadMessage = {
                            type: 'pastChatToLoad',
                            pastChatHistory: jsonArray,
                            sessionID: sessionID
                        }
                        await broadcast(pastChatsLoadMessage)
                        return
                    } else {
                        logger.error('could not update message with new edits')
                        return
                    }


                }
            }
            //process universal message types

            if (parsedMessage.type === 'usernameChange') {
                clientsObject[uuid].username = parsedMessage.newName;
                updateConnectedUsers()
                await db.upsertUser(parsedMessage.UUID, parsedMessage.newName, user.color ? user.color : thisClientObj.color)
                const nameChangeNotification = {
                    type: 'userChangedName',
                    content: `[System]: ${parsedMessage.oldName} >>> ${parsedMessage.newName}`
                }
                logger.debug('sending notification of username change')
                await broadcast(nameChangeNotification);
                await broadcastUserList()
            }
            else if (parsedMessage.type === 'heartbeat') {
                heartbeatResponse = {
                    type: 'heartbeatResponse',
                    value: 'pong!'
                }
                //only send back to the user who is doing the test.
                await ws.send(JSON.stringify(heartbeatResponse))
                return
            }
            else if (parsedMessage.type === 'submitKey') {
                if (parsedMessage.key === hostKey) {
                    const keyAcceptedMessage = {
                        type: 'keyAccepted',
                        role: 'host'
                    }
                    await db.upsertUserRole(uuid, 'host');
                    await ws.send(JSON.stringify(keyAcceptedMessage))
                }
                else if (parsedMessage.key === modKey) {
                    const keyAcceptedMessage = {
                        type: 'keyAccepted',
                        role: 'mod'
                    }
                    await db.upsertUserRole(uuid, 'mod');
                    await ws.send(JSON.stringify(keyAcceptedMessage))
                }
                else {
                    const keyRejectedMessage = {
                        type: 'keyRejected'
                    }
                    logger.error(`Key rejected: ${parsedMessage.key} from ${senderUUID}`)
                    await ws.send(JSON.stringify(keyRejectedMessage))
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
                        'type': 'chatMessage',
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

                    if (liveConfig.promptConfig.isAutoResponse || isEmptyTrigger) {
                        handleResponse(
                            parsedMessage, selectedAPI, STBasicAuthCredentials,
                            engineMode, user, liveConfig
                        );
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
                        type: 'chatMessage',
                        chatID: chatID,
                        username: username,
                        userColor: userColor,
                        content: parsedMessage.content
                    }
                    await broadcast(newUserChatMessage)
                }
            } else {
                logger.warn(`unknown message type received (${parsedMessage.type})...ignoring...`)
            }
        } catch (error) {
            logger.error('Error parsing message:', error);
            return;
        }
    });

    ws.on('close', async () => {
        // Remove the disconnected client from the clientsObject
        logger.debug(`Client ${uuid} disconnected..removing from clientsObject`);
        delete clientsObject[uuid];
        updateConnectedUsers()
        await broadcastUserList();
    });

};

//checks an incoming liveConfig from client for changes to the APIList, and adjust server's list and db-registered APIs to match it.
async function checkAPIListChanges(liveConfig, parsedMessage) {
    if (JSON.stringify(liveConfig.promptConfig.APIList) !== JSON.stringify(parsedMessage.value.promptConfig.APIList)) { //if the lists are different
        logger.warn('something is different about the API lists')
        if (parsedMessage.value.promptConfig.APIList.length < liveConfig.promptConfig.APIList.length) { //if server has more than client, the client deleted something
            logger.warn(`the client's API list was smaller than server's list...`)
            let APIToDelete = '';

            for (const serverListAPI of liveConfig.promptConfig.APIList) {
                logger.info('checking client list for', serverListAPI.name);
                const found = parsedMessage.value.promptConfig.APIList.some((clientListAPI) => {
                    if (serverListAPI.name === clientListAPI.name) {
                        logger.info(`found ${serverListAPI.name} in both`);
                        return true;
                    }
                    return false;
                });

                if (!found) {
                    APIToDelete = serverListAPI.name;
                    break;
                }
            }

            if (APIToDelete) {
                logger.warn(`Client API list no longer contains "${APIToDelete}"... removing it from the server list.`);
                liveConfig.promptConfig.APIList = liveConfig.promptConfig.APIList.filter(
                    (api) => api.name !== APIToDelete
                );
                await db.deleteAPI(APIToDelete);
                parsedMessage.value.promptConfig.selectedAPI = 'Default'; // Update parsedMessage as needed
            }

        } else if (parsedMessage.value.promptConfig.APIList.length > liveConfig.promptConfig.APIList.length) { //if user added an API
            logger.warn(`there is new API in client's API list..adding to server's API DB table..`)
            const newAPIs = parsedMessage.value.promptConfig.APIList.filter((api) =>
                !liveConfig.promptConfig.APIList.some((existingAPI) => existingAPI.name === api.name)
            );
            for (const api of newAPIs) {
                await db.upsertAPI(api);
            };
        } else if (parsedMessage.value.promptConfig.APIList.length === liveConfig.promptConfig.APIList.length) {
            logger.warn(`API list lengths are the same, but content is different...`);
            for (const clientAPI of parsedMessage.value.promptConfig.APIList) {
                logger.warn('checking', clientAPI.name);
                const serverAPI = liveConfig.promptConfig.APIList.find((api) => api.name === clientAPI.name);
                if (serverAPI) {
                    for (const key of Object.keys(clientAPI)) {
                        if (key === 'modelList') {
                            if (JSON.stringify(clientAPI[key]) !== JSON.stringify(serverAPI[key])) {
                                // Handle the modelList comparison difference
                                logger.warn(`Detected change in API called '${clientAPI.name}', key: '${key}'`);
                                logger.warn(`Previous value: '${JSON.stringify(serverAPI[key])}'`);
                                logger.warn(`New value: '${JSON.stringify(clientAPI[key])}'`);

                                // Update that API in the db with the new value
                                await db.upsertAPI(clientAPI);
                            }
                        } else if (clientAPI[key] !== serverAPI[key]) {
                            // Handle the comparison for other keys
                            logger.warn(`Detected change in API called '${clientAPI.name}', key: '${key}'`);
                            logger.warn(`Previous value: '${serverAPI[key]}'`);
                            logger.warn(`New value: '${clientAPI[key]}'`);

                            // Update that API in the db with the new value
                            await db.upsertAPI(clientAPI);
                        }
                    };
                }
            };
        }
    }
}



let accumulatedStreamOutput = ''

const createTextListener = (parsedMessage, liveConfig, AIChatUserList, user) => {
    let currentlyStreaming
    logger.warn(parsedMessage)

    const endResponse = async () => {
        //logger.warn('AIChatUserList in text Listener EndResponse')
        //logger.warn(AIChatUserList)
        currentlyStreaming = false
        //if (!responseEnded) {
        //    responseEnded = true;
        api.textEmitter.removeAllListeners('text');
        const streamEndToken = {
            chatID: parsedMessage.chatID,
            AIChatUserList: AIChatUserList,
            userColor: parsedMessage.userColor,
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            type: 'streamedAIResponseEnd',
        };
        logger.warn('sending stream end')
        broadcast(streamEndToken); // Emit the event to clients
        //}
    };

    return async (text) => {

        //add the newest token to the accumulated variable for later chat saving. 
        //console.log(text);
        // Check if the response stream has ended
        if (currentlyStreaming) {
            if (text === 'END_OF_RESPONSE' || text === null || text === undefined) {
                endResponse();
                return
            }
            //logger.debug('saw end of stream or invalid token')
        } else if (text === 'END_OF_RESPONSE' || text === null || text === undefined) {
            return
        }

        accumulatedStreamOutput += text
        //logger.debug(accumulatedStreamOutput)

        const streamedTokenMessage = {
            chatID: parsedMessage.chatID,
            content: text,
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            type: 'streamedAIResponse',
            color: user.color ? user.color : 'red',
        };
        await broadcast(streamedTokenMessage);
        currentlyStreaming = true


    };
};

async function handleResponse(parsedMessage, selectedAPI, STBasicAuthCredentials, engineMode, user, liveConfig) {
    let AIResponse

    //console.log(liveConfig)

    //just get the AI chat userlist with 'true' as last argument
    //this is jank..
    //logger.warn('Dry run to get the AI UserList')
    let AIChatUserList = await api.getAIResponse(isStreaming, STBasicAuthCredentials, engineMode, user, liveConfig, liveConfig.APIConfig, true, parsedMessage);
    //logger.warn('now for the real deal')
    //.warn('AIChatUserList in handleResponse')
    //logger.warn(AIChatUserList)

    if (isStreaming) {

        api.textEmitter.removeAllListeners('text');
        const textListener = createTextListener(parsedMessage, liveConfig, AIChatUserList, user);
        // Handle streamed response
        api.textEmitter.off('text', textListener).on('text', textListener)

        // Make the API request for streamed responses

        const response = await api.getAIResponse(isStreaming, STBasicAuthCredentials, engineMode, user, liveConfig, liveConfig.APIConfig, false, parsedMessage);

        if (response === null) {
            textListener('END_OF_RESPONSE');
            let trimmedStreamedResponse = await api.trimIncompleteSentences(accumulatedStreamOutput)
            await db.writeAIChatMessage(liveConfig.promptConfig.selectedCharacterDisplayName, 'AI', trimmedStreamedResponse, 'AI')
            //console.log('message was:')
            //console.log(liveConfig.promptConfig.selectedCharacterDisplayName + ':' + accumulatedStreamOutput)
            accumulatedStreamOutput = ''
        }

    } else {
        //logger.info('SENDING BACK NON-STREAM RESPONSE')
        // Handle non-streamed response
        [AIResponse, AIChatUserList] = await api.getAIResponse(
            isStreaming, STBasicAuthCredentials, engineMode, user, liveConfig, liveConfig.APIConfig, false, parsedMessage);

        const AIResponseMessage = {
            chatID: parsedMessage.chatID,
            content: AIResponse,
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            type: 'AIResponse',
            color: user.color,
            AIChatUserList: AIChatUserList
        }
        await broadcast(AIResponseMessage)

    }
}

// Handle server shutdown via ctrl+c
process.on('SIGINT', async () => {
    logger.warn('Server shutting down...');

    // Send a message to all connected clients
    const serverShutdownMessage = {
        type: 'forceDisconnect',
    };
    broadcast(serverShutdownMessage);

    //give a delay to make sure the shutdown message is sent to all users
    await delay(1000)

    // Close the WebSocket server
    wsServer.close(() => {
        logger.debug('Host websocket closed.');
    });
    wssServer.close(() => {
        logger.debug('Guest websocket closed.');
    });
    process.exit(0);
})

module.exports = {
    broadcast: broadcast
}

const http = require('http');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const $ = require('jquery');
const characterCardParser = require('./character-card-parser.js');
const express = require('express');
const localApp = express();
const remoteApp = express();
localApp.use(express.static('public'));
remoteApp.use(express.static('public'));

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
var clientsArray = [];
var connectedUserNames = [];

//default values
var selectedCharacter
var isAutoResponse = true
var responseLength = 200
var contextSize = 4096
var liveConfig

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function initConfig() {
    if (!fs.existsSync('config.json')) {
        let config = {
            engineMode: engineMode,
            selectedCharacter: '',
            responseLength: responseLength,
            contextSize: contextSize,
            isAutoResponse: isAutoResponse,
        }
        liveConfig = config
        const writableArray = JSON.stringify(config, null, 2);
        //console.log('initConfig writing initial file')
        fs.writeFileSync('config.json', writableArray);
        console.log('config.json created with default values.');

    } else {
        console.log('config.json already exists.');
        liveConfig = await readConfig()
    }
}

initConfig()

/* async function testConfig() {
    initConfig()
    await delay(1)
    let configData = await readConfig()
    await delay(1)
    await writeConfig(configData, 'selectedCharacter', 'Coding Sensei')
    await delay(1)
    let newConfigData = await readConfig()
    console.log(newConfigData)
}

testConfig() */

// Handle incoming WebSocket connections
wsServer.on('connection', (ws) => {
    handleConnections(ws)
})
wssServer.on('connection', (ws) => {
    handleConnections(ws)
})

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

async function getSamplerPresetList() {
    const path = 'public/api-presets'
    const files = await fs.promises.readdir(path);
    var presets = []
    var i = 0
    //console.log('Files in directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            //const samplerPreset = await readFile(fullPath);
            //var jsonData = JSON.parse(samplerPreset);
            //jsonData.filename = `${path}/${file}`
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
    clientsArray.forEach(client => {
        if (client.socket.readyState === WebSocket.OPEN) {
            client.socket.send(JSON.stringify(message));
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
}

async function removeLastAIChatMessage() {
    const data = await readAIChat()
    let jsonArray = JSON.parse(data)
    jsonArray.pop();
    const formattedData = JSON.stringify(jsonArray, null, 2);
    await writeAIChat(formattedData)
    let chatUpdateMessage = {
        type: 'chatUpdate',
        chatHistory: jsonArray
    }
    console.log('sending AI Chat Update instruction to clients')
    broadcast(chatUpdateMessage);
}

function humanizedTimestamp() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hour = String(currentDate.getHours()).padStart(2, '0');
    const minute = String(currentDate.getMinutes()).padStart(2, '0');
    const second = String(currentDate.getSeconds()).padStart(2, '0');
    const currentDateTime = `${year}-${month}-${day}_${hour}h${minute}m${second}s`;
    return currentDateTime
}

async function saveAndClearChat(type) {

    let fileprefix, currentChatData
    if (type === 'AIChat') {
        fileprefix = 'AIChat_'
        currentChatData = await readAIChat();
    } else {
        fileprefix = 'UserChat_'
        currentChatData = await readUserChat();
    }

    let currentTimestamp = humanizedTimestamp()
    const newFileName = `${fileprefix}${currentTimestamp}.json`;
    const newFilePath = `public/chats/${newFileName}`;

    fs.writeFile(newFilePath, currentChatData, 'utf8', (writeErr) => {
        if (writeErr) {
            console.error('An error occurred while writing to the file:', writeErr);
            return;
        }
        console.log(`Saved current ${type} as ${newFileName}.`);
    });

    // Create a new file with an empty array
    try {
        console.log(`Clearing ${type}.json...`);
        type === 'AIChat' ? await writeAIChat('[]') : await writeUserChat('[]')

    } catch (writeError) {
        console.error('An error occurred while creating the file:', writeError);
        return;
    }
}

async function handleConnections(ws) {
    // Store the connected client in the appropriate array based on the server
    const thisUserColor = usernameColors[Math.floor(Math.random() * usernameColors.length)];
    clientsArray.push({
        socket: ws,
        color: thisUserColor,
    });

    const cardList = await getCardList()
    const samplerPresetList = await getSamplerPresetList()
    var AIChatJSON = await readAIChat();
    var userChatJSON = await readUserChat()

    //send connection confirmation along with both chat history, card list, selected char, and assigned user color.
    let connectionConfirmedMessage = {
        type: 'connectionConfirmed',
        chatHistory: userChatJSON,
        AIChatHistory: AIChatJSON,
        color: thisUserColor,
        cardList: cardList,
        samplerPresetList: samplerPresetList,
        selectedCharacter: liveConfig.selectedCharacter,
        selectedSamplerPreset: liveConfig.selectedPreset,
        userList: connectedUserNames,
        engineMode: liveConfig.engineMode,
        isAutoResponse: liveConfig.isAutoResponse,
        contextSize: liveConfig.contextSize,
        responseLength: liveConfig.responseLength
    }
    //send connection confirmation along with chat history
    ws.send(JSON.stringify(connectionConfirmedMessage))
    broadcastUserList()


    // Handle incoming messages from clients
    ws.on('message', async function (message) {

        // Parse the incoming message as JSON
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            parsedMessage.userColor = thisUserColor
            //stringifiedMessage = JSON.stringify(message)
            //console.log('Received message from client:', parsedMessage);
            if (parsedMessage.type === 'connect') {
                console.log('saw connect message from client')
                ws.username = parsedMessage.username;
                connectedUserNames.push(parsedMessage.username)
                console.log(`connectedUserNames: ${connectedUserNames}`)
                await broadcastUserList()
                return
            }
            else if (parsedMessage.type === 'clearChat') {
                //clear the UserChat.json file
                await saveAndClearChat('UserChat')
                // Broadcast the clear chat message to all connected clients
                broadcast(parsedMessage);
            }
            else if (parsedMessage.type === 'toggleAutoResponse') {
                isAutoResponse = parsedMessage.value
                liveConfig.isAutoResponse = isAutoResponse
                await writeConfig('isAutoResponse', isAutoResponse)
            }
            else if (parsedMessage.type === 'adjustContextSize') {
                contextSize = parsedMessage.value
                liveConfig.contextSize = contextSize
                await writeConfig('contextSize', contextSize)

            }
            else if (parsedMessage.type === 'adjustResponseLength') {
                responseLength = parsedMessage.value
                liveConfig.responseLength = responseLength
                await writeConfig('responseLength', responseLength)

            }
            else if (parsedMessage.type === 'clearAIChat') {
                await saveAndClearChat('AIChat')
                broadcast(parsedMessage);
            }
            else if (parsedMessage.type === 'deleteLast') {
                await removeLastAIChatMessage()
            }/* 
            else if (parsedMessage.type === 'cardListQuery') {
                let cards = await getCardList()
                let cardListMessage = {
                    type: 'cardList',
                    cards: cards
                }
                ws.send(JSON.stringify(cardListMessage))
                return
            }
            else if (parsedMessage.type === 'samplerListQuery') {
                let samplers = await getCardList()
                let samplerListMessage = {
                    type: 'samplerList',
                    samplers: samplers
                }
                ws.send(JSON.stringify(samplerListMessage))
                return
            } */
            else if (parsedMessage.type === 'disconnect') {
                const disconnectedUsername = parsedMessage.username;
                connectedUserNames = connectedUserNames.filter(username => username !== disconnectedUsername);
                await broadcastUserList()
                return
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
                broadcast(nameChangeNotification);
                broadcastUserList()
            }
            else if (parsedMessage.type === 'changeCharacter') {
                const changeCharMessage = {
                    type: 'changeCharacter',
                    char: parsedMessage.newChar
                }
                selectedCharacter = parsedMessage.newChar
                liveConfig.selectedCharacter = selectedCharacter
                await writeConfig('selectedCharacter', selectedCharacter)
                broadcast(changeCharMessage);
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
                await writeConfig('samplers', liveConfig.samplers)
                await writeConfig('selectedPreset', selectedPreset)
                broadcast(changePresetMessage);
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
                    await getAIResponse()
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
                await writeConfig('engineMode', engineMode)
                broadcast(modeChangeMessage);
            }

            else { //handle normal chat messages
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
                        let data = await readAIChat()
                        let jsonArray = JSON.parse(data)
                        const userObjToPush = {
                            username: parsedMessage.username,
                            content: parsedMessage.userInput,
                            //htmlContent: parsedMessage.htmlContent,
                            userColor: parsedMessage.userColor
                        }
                        jsonArray.push(userObjToPush)
                        const formmattedData = JSON.stringify(jsonArray, null, 2);
                        await writeAIChat(formmattedData)
                        broadcast(userPrompt)
                    }
                    if (isAutoResponse || isEmptyTrigger) {
                        await getAIResponse()
                    }
                }
                //read the current userChat file
                if (chatID === 'UserChat') {
                    let data = await readUserChat()
                    let jsonArray = JSON.parse(data);
                    // Add the new object to the array
                    jsonArray.push(parsedMessage);
                    const updatedData = JSON.stringify(jsonArray, null, 2);
                    // Write the updated array back to the file
                    await writeUserChat(updatedData)
                    broadcast(parsedMessage)
                }
            }
            async function getAIResponse() {
                try {
                    let jsonArray = [];
                    let isEmptyTrigger = userPrompt.content.length == 0 ? true : false
                    console.log(`Is this an empty trigger? ${isEmptyTrigger}`)

                    //if it's not an empty trigger from host
                    //if userInput is empty we can just request the AI directly
                    let charFile = parsedMessage.char
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

                    var AIResponse = '';
                    if (engineMode === 'horde') {
                        const [hordeResponse, workerName, hordeModel, kudosCost] = await requestToHorde(parsedMessage.APICallParams);
                        AIResponse = hordeResponse;
                    }
                    else {
                        AIResponse = trimIncompleteSentences(await requestToTabby(parsedMessage.APICallParams))
                    }

                    const AIResponseForChatJSON = {
                        username: charName,
                        content: AIResponse.trim(),
                        userColor: parsedMessage.userColor
                    }
                    //add the response to the chat file
                    let data = await readAIChat()
                    jsonArray = JSON.parse(data);
                    jsonArray.push(AIResponseForChatJSON);
                    const updatedData = JSON.stringify(jsonArray, null, 2);
                    // Write the formatted AI response array back to the file
                    await writeAIChat(updatedData)

                    //broadcast the response to all clients
                    const AIResponseBroadcast = {
                        chatID: parsedMessage.chatID,
                        content: AIResponse,
                        username: charName,
                        type: 'AIResponse',
                        userColor: parsedMessage.userColor
                    }
                    const clientsArray = [...wsServer.clients, ...wssServer.clients]; // Convert clients set to an array
                    await Promise.all(clientsArray.map(client => client.send(JSON.stringify(AIResponseBroadcast))));
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
        // Remove the disconnected client from the clientsArray
        clientsArray = clientsArray.filter(client => client !== ws);
    });
};


function countTokens(str) {
    let chars = str.length
    let tokens = Math.ceil(chars / 3)
    //console.log(`estimated tokens: ${tokens}`)
    return tokens
}

/**
 * Reads AI chat data from a JSON file. If the file doesn't exist, creates it.
 * @returns {Promise<string>} A promise that resolves with the file content.
 */
async function readAIChat() {
    return new Promise((resolve, reject) => {
        fs.readFile('public/chats/AIChat.json', 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log('AIChat.json not found, creating it now.');
                    writeAIChat('[]').then(() => {
                        resolve('[]');
                    }).catch(writeErr => {
                        console.error('An error occurred while creating the file:', writeErr);
                        reject(writeErr);
                    });
                } else {
                    console.error('An error occurred while reading the file:', err);
                    reject(err);
                }
            } else {
                resolve(data);
            }
        });
    });
}


async function writeAIChat(data) {
    fs.writeFile('public/chats/AIChat.json', data, 'utf8', (writeErr) => {
        if (writeErr) {
            console.error('An error occurred while writing to the file:', writeErr);
            return;
        }
        console.log('AIChat.json updated.');
    });
}

/**
 * Reads user chat data from a JSON file. If the file doesn't exist, creates it.
 * @returns {Promise<string>} A promise that resolves with the file content.
 */
async function readUserChat() {
    return new Promise((resolve, reject) => {
        fs.readFile('public/chats/UserChat.json', 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log('UserChat.json not found, creating it now.');
                    writeUserChat('[]').then(() => {
                        resolve('[]');
                    }).catch(writeErr => {
                        console.error('An error occurred while creating the file:', writeErr);
                        reject(writeErr);
                    });
                } else {
                    console.error('An error occurred while reading the file:', err);
                    reject(err);
                }
            } else {
                resolve(data);
            }
        });
    });
}

async function writeUserChat(data) {
    fs.writeFile('public/chats/UserChat.json', data, 'utf8', (writeErr) => {
        if (writeErr) {
            console.error('An error occurred while writing to the file:', writeErr);
            return;
        }
        console.log('UserChat.json updated.');
    });
}

async function readConfig() {
    await delay(100)
    //console.log('--- READ CONFIG started')
    return new Promise(async (resolve, reject) => {
        fs.readFile('config.json', 'utf8', async (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log('config.json not found, initializing with default values.');
                    try {
                        //console.log('--- READ CONFIG calling initconfig')
                        await initConfig();
                        //console.log('----- CREATED NEW CONFIG FILE, RETURNING IT')
                        resolve(liveConfig); // Assuming liveconfig is accessible here
                    } catch (initErr) {
                        console.error('An error occurred while initializing the file:', initErr);
                        reject(initErr);
                    }
                } else {
                    console.error('An error occurred while reading the file:', err);
                    reject(err);
                }
            } else {
                try {
                    //console.log('--- READ CONFIG saw data:')
                    //console.log(data)
                    //console.log('--- READ CONFIG parsing data')
                    const configData = JSON.parse(data); // Parse the content as JSON
                    //console.log('--- READ CONFIG sending back parsed data')
                    resolve(configData);
                } catch (parseErr) {
                    console.error('An error occurred while parsing the JSON:', parseErr);
                    reject(parseErr);
                }
            }
        });
    });
}

async function writeConfig(key, value) {
    await delay(100)
    let newObject = await readConfig()
    newObject[key] = value;
    //console.log('should have made changes to config object. Lets check.');
    console.log(`Config updated: ${key} = ${value}`);
    const writableConfig = JSON.stringify(newObject, null, 2); // Serialize the object with indentation
    fs.writeFile('config.json', writableConfig, 'utf8', writeErr => {
        if (writeErr) {
            console.error('An error occurred while writing to the file:', writeErr);
            return;
        }
        console.log('config.json updated.');
    });
}

async function readFile(file) {
    console.log(`[readFile()] Reading ${file}...`)
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log(`ERROR: ${file} not found`);
                } else {
                    console.error('An error occurred while reading the file:', err);
                    reject(err);
                }
            } else {
                resolve(data);
            }
        });
    });
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
        let data = await readAIChat();
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

async function addCharDefsToPrompt(charFile, lastUserMesageAndCharName, username) {
    return new Promise(async function (resolve, reject) {
        try {
            let charData = await charaRead(charFile, 'png')
            let chatHistory = await ObjectifyChatHistory()
            const jsonData = JSON.parse(charData)
            const charName = jsonData.name
            const jsonString = JSON.stringify(jsonData);
            var replacedString = jsonString.replace(/{{user}}/g, username);
            replacedString = replacedString.replace(/{{char}}/g, jsonData.name);
            const replacedData = JSON.parse(replacedString);
            const systemMessage = `You are ${charName}. Write ${charName}'s next response in this roleplay chat with ${username}.`

            //add the char description, personality, scenario, and first message
            var stringToReturn =
                `${systemMessage}\n${replacedData?.description}\n${replacedData?.personality.trim()}\n${replacedData?.scenario.trim()}\n${replacedData.name.trim()}: ${replacedData?.first_mes.trim()}\n`
            //add the chat history
            let promptTokens = countTokens(stringToReturn)
            //console.log(`before adding ChatHIstory, Prompt is: ~${promptTokens}`)
            let insertedItems = []
            for (let i = chatHistory.length - 1; i >= 0; i--) {
                let obj = chatHistory[i];
                let newItem = `${obj.username}: ${obj.content}\n`;
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
            stringToReturn += `${lastUserMesageAndCharName.trim()}`;
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

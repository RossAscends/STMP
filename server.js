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

// Create an HTTP servers
const wsPort = 8181; //WS for host
const wssPort = 8182; //WSS for guests

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

// Create a WebSocket server
const wsServer = new WebSocket.Server({ server: localServer });
const wssServer = new WebSocket.Server({ server: guestServer });
wsServer.setMaxListeners(0);
wssServer.setMaxListeners(0);

// Arrays to store connected clients of each server
var clientsArray = [];
var connectedUserNames = [];

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
    console.log('getting card list')
    const path = 'public/characters'
    const files = await fs.promises.readdir(path);
    console.log(files)
    var cards = []
    console.log('Files in directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            const cardData = await charaRead(fullPath);
            var jsonData = JSON.parse(cardData);
            jsonData.filename = `${path}/${file}`
            cards.push(jsonData);
            console.log(jsonData.name, jsonData.filename)
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
        }
    }

    return cards;
}

function handleConnections(ws) {
    // Store the connected client in the appropriate array based on the server
    const thisUserColor = usernameColors[Math.floor(Math.random() * usernameColors.length)];
    clientsArray.push({
        socket: ws,
        color: thisUserColor
    });

    var userChatJSON

    //gather the userchat history to send to the new user
    fs.readFile('public/chats/UserChat.json', 'utf8', (err, data) => {
        if (err) {
            console.error('An error occurred:', err);
            return;
        }
        userChatJSON = data;
        let connectionConfirmedMessage = {
            type: 'connectionConfirmed',
            chatHistory: userChatJSON,
            color: thisUserColor
        }
        //send connection confirmation along with chat history
        ws.send(JSON.stringify(connectionConfirmedMessage))
    })

    broadcastUserList()

    // Broadcast the updated array of connected usernames to all clients
    function broadcastUserList() {
        const userListMessage = {
            type: 'userList',
            userList: connectedUserNames.sort()
        };
        clientsArray.forEach(client => {
            if (client.socket.readyState === WebSocket.OPEN) {
                client.socket.send(JSON.stringify(userListMessage));
            }
        });
    }

    // Handle incoming messages from clients
    ws.on('message', async function (message) {

        // Parse the incoming message as JSON
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            parsedMessage.userColor = thisUserColor
            console.log(parsedMessage)
            stringifiedMessage = JSON.stringify(message)
            console.log('Received message from client:', parsedMessage);

            if (parsedMessage.type === 'clearChat') {
                // Broadcast the clear chat message to all connected clients
                clientsArray.forEach(function (client) {
                    if (client.socket.readyState === WebSocket.OPEN) {
                        client.socket.send(JSON.stringify(parsedMessage));
                    }
                });
                //clear the UserChat.json file
                fs.writeFile('public/chats/UserChat.json', '[]', 'utf8', (err) => {
                    if (err) {
                        console.error('An error occurred:', err);
                        return;
                    }
                    console.log('UserChat.json has been cleared.');
                });
            }
            else if (parsedMessage.type === 'cardListQuery') {
                let cards = await getCardList()
                let cardListMessage = {
                    type: 'cardList',
                    cards: cards
                }
                ws.send(JSON.stringify(cardListMessage))
            }
            else if (parsedMessage.type === 'disconnect') {
                const disconnectedUsername = parsedMessage.username;
                connectedUserNames = connectedUserNames.filter(username => username !== disconnectedUsername);
                broadcastUserList()
            }
            else if (parsedMessage.type === 'connect') {
                ws.username = parsedMessage.username;
                connectedUserNames.push(parsedMessage.username)
                broadcastUserList()
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
                clientsArray.forEach(function (client) {
                    if (client.socket.readyState === WebSocket.OPEN) {
                        client.socket.send(JSON.stringify(nameChangeNotification));
                    }
                });
                broadcastUserList()
            }

            else if (parsedMessage.type === 'changeChar') {
                const changeCharMessage = {
                    type: 'changeChar',
                    char: parsedMessage.newChar
                }
                clientsArray.forEach(async function (client) {
                    if (client.socket.readyState === WebSocket.OPEN) {
                        client.socket.send(JSON.stringify(changeCharMessage));
                    }
                })
            }

            else { //handle normal chat messages
                const chatID = parsedMessage.chatID;
                const username = parsedMessage.username
                const userColor = thisUserColor
                const userInput = parsedMessage.content
                const hordePrompt = parsedMessage.content?.prompt


                //setup the userPrompt arrayin order to send the input into the AIChat box
                if (chatID === 'AIChat') {
                    var userPrompt = {
                        'chatID': chatID,
                        'username': parsedMessage.username,
                        //send the HTML-ized message into the AI chat
                        'content': parsedMessage.rawContent,
                        'userColor': userColor
                    }
                }
                //read the current userChat file
                if (chatID === 'UserChat') {
                    fs.readFile('public/chats/userChat.json', 'utf8', (err, data) => {
                        if (err) {
                            console.error('An error occurred while reading the file:', err);
                            return;
                        }

                        let jsonArray = [];

                        try {
                            // Parse the existing contents as a JSON array
                            jsonArray = JSON.parse(data);
                        } catch (parseError) {
                            console.error('An error occurred while parsing the JSON:', parseError);
                            return;
                        }

                        // Add the new object to the array
                        jsonArray.push(parsedMessage);
                        const updatedData = JSON.stringify(jsonArray, null, 2);

                        // Write the updated array back to the file
                        fs.writeFile('public/chats/userChat.json', updatedData, 'utf8', (writeErr) => {
                            if (writeErr) {
                                console.error('An error occurred while writing to the file:', writeErr);
                                return;
                            }
                            console.log('UserChat.json updated.');
                        });
                    });
                }


                // Broadcast the parsed message to all connected clients
                clientsArray.forEach(async function (client) {
                    //send the manual input user message to chat
                    if (client.socket.readyState === WebSocket.OPEN) {
                        if (chatID === 'AIChat') {
                            console.log(userPrompt)
                            client.socket.send(JSON.stringify(userPrompt))
                        } else {
                            client.socket.send(JSON.stringify(parsedMessage));
                        }
                    }
                })
                //request to AI API if user Input was made into AIChat
                if (chatID === 'AIChat') {
                    try {
                        let charFile = parsedMessage.char
                        let cardData = await charaRead(charFile, 'png')
                        let cardJSON = JSON.parse(cardData)
                        let charName = cardJSON.name
                        var prompt = JSON.stringify(`${parsedMessage.content.prompt}\n${charName}:`);
                        //strips out HTML tags
                        var fixedPrompt = JSON.parse(prompt.replace(/<[^>]+>/g, ''));
                        await (async function () {

                            // AI_API_SELECTION_CODE
                            // UNCOMMENT THIS LINE IF YOU WANT TO USE TABBY FOR AI RESPONSES
                            [parsedMessage.content.prompt, charName] = await addCharDefsToPrompt(charFile, fixedPrompt, parsedMessage.username);
                            // UNCOMMENT THIS LINE IF YOU WANT TO USE HORDE FOR AI RESPONSES
                            //const [hordeResponse, workerName, hordeModel, kudosCost] = await requestToHorde(parsedMessage.content);

                            console.log(parsedMessage.content)
                            const tabbyResponse = await requestToTabby(parsedMessage.content)
                            //parsedMessage.content = `${charName}:${hordeResponse}`;
                            parsedMessage.content = tabbyResponse;
                            parsedMessage.username = charName;
                            parsedMessage.type = 'AIResponse'
                            const clientsArray = [...wsServer.clients, ...wssServer.clients]; // Convert clients set to an array
                            await Promise.all(clientsArray.map(client => client.send(JSON.stringify(parsedMessage))));
                        })();
                    } catch (error) {
                        console.log(error);
                    }
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

async function addCharDefsToPrompt(charFile, userInputString, username) {

    try {
        let charData = await charaRead(charFile, 'png')
        const jsonData = JSON.parse(charData)
        const jsonString = JSON.stringify(jsonData);
        //resolve {user} macros in data (depcreciated, was used for hivemind.json file from discord imp)
        const replacedString = jsonString.replace(/\${user}/g, username);
        const replacedData = JSON.parse(replacedString);
        console.log(replacedData)
        const stringToReturn =
            `${replacedData?.description}
${replacedData?.personality}
${replacedData?.scenario}
${replacedData.name}: ${replacedData?.first_mes}
${userInputString}`;
        let charName = jsonData.name

        return [stringToReturn, charName];
    } catch (error) {
        console.error('Error reading file:', error);
        throw error;
    }
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
        'Authorization': 'Basic ' + btoa(''),
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

async function requestToTabby(message, stringToSend, stoppingStrings) {
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

        const body = JSON.stringify(message);

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
    clientsArray.forEach(client => {
        if (client.socket.readyState === WebSocket.OPEN) {
            client.socket.send(JSON.stringify(serverShutdownMessage));
        }
    });

    // Close the WebSocket server
    wsServer.close(() => {
        console.log('Host websocket closed.');
    });
    wssServer.close(() => {
        console.log('Guest websocket closed.');
    });
    process.exit(0);
})
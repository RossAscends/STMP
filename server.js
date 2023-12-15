const http = require('http');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const $ = require('jquery');
const characterCardParser = require('./character-card-parser.js');

// Create an HTTP server
const wsPort = 8181;
const wssPort = 8182;

const localServer = http.createServer((req, res) => {
    // Serve the client HTML file
    if (req.url === '/') {
        //console.log('__dirname inside IF :', __dirname); // Add this line
        const filePath = path.join(__dirname, 'client.html');
        //console.log(`trying to read the file at ${filePath}`)
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading the client HTML file');
            } else {
                //console.log('saw no problem with finding the client.html file')
                //console.log(`serving: ${filePath}`)
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const guestServer = http.createServer((req, res) => {
    // Serve the client HTML file
    if (req.url === '/') {
        //console.log('__dirname inside IF :', __dirname); // Add this line
        const filePath = path.join(__dirname, 'client.html');
        //console.log(`trying to read the file at ${filePath}`)
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading the client HTML file');
            } else {
                //console.log('saw no problem with finding the client.html file')
                //console.log(`serving: ${filePath}`)
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

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
    const path = './characters'
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
    clientsArray.push(ws);
    //broadcast the full userlist to all clients

    let connectionConfirmedMessage = {
        type: 'connectionConfirmed'
    }
    ws.send(JSON.stringify(connectionConfirmedMessage))

    broadcastUserList()

    // Broadcast the updated array of connected usernames to all clients
    function broadcastUserList() {
        const userListMessage = {
            type: 'userList',
            userList: connectedUserNames.sort()
        };
        clientsArray.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(userListMessage));
            }
        });
    }

    // Handle incoming messages from clients
    ws.on('message', async function (message) {
        // Parse the incoming message as JSON
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
            console.log('Received message from client:', parsedMessage);

            if (parsedMessage.type === 'clearChat') {
                // Broadcast the clear chat message to all connected clients
                clientsArray.forEach(function (client) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(parsedMessage));
                    }
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
                broadcastUserList()
            }

            else if (parsedMessage.type === 'changeChar') {
                const changeCharMessage = {
                    type: 'changeChar',
                    char: parsedMessage.newChar
                }
                clientsArray.forEach(async function (client) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(changeCharMessage));
                    }
                })
            }

            else { //handle normal chat messages
                const chatID = parsedMessage.chatID;
                const userInput = parsedMessage.content
                const hordePrompt = parsedMessage.content?.prompt

                //setup the userPrompt arrayin order to send the input into the AIChat box
                if (chatID === 'AIChat') {
                    var userPrompt = {
                        'chatID': chatID,
                        'username': parsedMessage.username,
                        //send the HTML-ized message into the AI chat
                        'content': parsedMessage.rawContent
                    }
                }

                // Broadcast the parsed message to all connected clients
                clientsArray.forEach(async function (client) {
                    //send the manual input user message to chat
                    if (client.readyState === WebSocket.OPEN) {
                        if (chatID === 'AIChat') {
                            console.log(userPrompt)
                            client.send(JSON.stringify(userPrompt))
                        } else {
                            client.send(JSON.stringify(parsedMessage));
                        }
                    }
                })
                //request to horde if chat wasw made into AIChat
                if (chatID === 'AIChat') {
                    try {
                        let charFile = parsedMessage.char
                        let cardData = await charaRead(charFile, 'png')
                        let cardJSON = JSON.parse(cardData)
                        let charName = cardJSON.name
                        var prompt = JSON.stringify(`${parsedMessage.content.prompt}\n${charName}:`);
                        var fixedPrompt = JSON.parse(prompt.replace(/<[^>]+>/g, ''));
                        await (async function () {

                            // AI_API_SELECTION_CODE
                            // UNCOMMENT THIS LINE IF YOU WANT TO USE TABBY FOR AI RESPONSES
                            [parsedMessage.content.prompt, charName] = await addCharDefsToPrompt(charFile, fixedPrompt, parsedMessage.username);
                            // UNCOMMENT THIS LINE IF YOU WANT TO USE HORDE FOR AI RESPONSES
                            //const [hordeResponse, workerName, hordeModel, kudosCost] = await requestToHorde(parsedMessage.content);

                            console.log(parsedMessage.content)
                            const tabbyResponse = await requestToOoba(parsedMessage.content)
                            //parsedMessage.content = `${charName}:${hordeResponse}`;
                            parsedMessage.content = `${charName}:${tabbyResponse}`;
                            parsedMessage.username = 'AI';
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
        //const data = await fsp.readFile('Hivemind.json', 'utf8');
        const jsonData = JSON.parse(charData)
        const jsonString = JSON.stringify(jsonData);
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
    var url = 'http://127.0.0.1:8000/api/horde/generate-text';
    var headers = {
        'Content-Type': 'application/json',
        'Cache': 'no-cache',
        'Authorization': 'Basic ' + btoa('ra:arc'),
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

async function requestToOoba(message, stringToSend, stoppingStrings) {
    try {
        console.log('Sending Ooba request..');

        const OobaURL = 'http://127.0.0.1:5000';
        const OobaGenEndpoint = '/v1/completions';
        const url = OobaURL + OobaGenEndpoint;

        const headers = {
            'Content-Type': 'application/json',
            'Cache': 'no-cache',
            'x-api-key': tabbyAPIkey,
            'Authorization': `Bearer ${tabbyAPIkey}`,
        };

        //const oobaAPICallParams = JSON.parse(fs.readFileSync('oobaAPICall.json', 'utf-8'));
        //oobaAPICallParams['prompt'] = stringToSend;
        //oobaAPICallParams['stopping_strings'] = stoppingStrings;

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
        console.log('Error while requesting ST-Ooba');
        const line = error.stack.split('\n').pop().split(':').pop();
        console.log(line);
        console.log(error);
    }
}

// Start the server
localServer.listen(wsPort, () => {
    console.log('===========================')
    console.log(`Host Server is listening on http://localhost:${wsPort}`);
    console.log('The Host User (you) should connect to this address.')
    console.log('===========================')
});
guestServer.listen(wssPort, () => {
    console.log(`The Guest Server is listening on port ${wssPort}`);
    console.log('Run the Remote-Link.cmd file in the STMP directory')
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
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(serverShutdownMessage));
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
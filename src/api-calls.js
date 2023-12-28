//const http = require('http');
const fs = require('fs');
//const fsp = require('fs').promises;
//const util = require('util');
//const WebSocket = require('ws');
//const crypto = require('crypto');

//const writeFileAsync = util.promisify(fs.writeFile);
//const existsAsync = util.promisify(fs.exists);

//const { v4: uuidv4 } = require('uuid');
//const path = require('path');

const $ = require('jquery');

//const express = require('express');
//const { url } = require('inspector');

const db = require('./db.js');
const fio = require('./file-io.js')

const TCURL = 'http://127.0.0.1:5000';
const TCGenEndpoint = '/v1/completions';


function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setNewAPI(name, url, endpoint, key) {
    TCNAME = name
    TCURL = url
    TCGenEndpoint = endpoint
    TCAPIkey = key
    console.log(`New API set: ${TCURL}${TCGenEndpoint} with key ${TCAPIkey}`)
}

function getTCInfo() {
    return { TCNAME, TCURL, TCGenEndpoint, TCAPIkey }
}

var TCAPIDefaults, HordeAPIDefaults

async function getAPIDefaults() {
    try {
        const fileContents = await fio.readFile('default-API-Parameters.json');
        const jsonData = JSON.parse(fileContents);
        const { TCAPICallParams, HordeAPICallParams } = jsonData[0];
        TCAPIDefaults = TCAPICallParams;
        HordeAPIDefaults = HordeAPICallParams;
    } catch (error) {
        console.error('Error reading or parsing the default API Param JSON file:', error);
    }
}

async function getAIResponse(selectedAPIName, STBasicAuthCredentials, engineMode, userObj, userPrompt, liveConfig) {
    try {
        let APICallParams
        if (engineMode === 'TC') {
            APICallParams = TCAPIDefaults
        } else {
            APICallParams = HordeAPIDefaults
        }
        console.log(APICallParams)

        let isEmptyTrigger = userPrompt.content.length == 0 ? true : false
        //console.log(`Is this an empty trigger? ${isEmptyTrigger}`)

        //if it's not an empty trigger from host
        //if userInput is empty we can just request the AI directly
        let charFile = liveConfig.selectedCharacter
        console.log(`selected character: ${charFile}`)
        let cardData = await fio.charaRead(charFile, 'png')
        let cardJSON = JSON.parse(cardData)
        let charName = cardJSON.name
        var finalCharName = JSON.stringify(`\n${charName}:`);
        //strips out HTML tags from last message
        var fixedFinalCharName = JSON.parse(finalCharName.replace(/<[^>]+>/g, ''));
        //a careful observer might notice that we don't set the userInput string into the 'prompt' section of the API Params at this point.
        //this is because the userInput has already been saved into the chat session, and the next function will read 
        //that file and parse the contents from there. All we need to do is pass the cardDefs, charName. and userName.
        const [fullPromptforAI, includedChatObjects] = await addCharDefsToPrompt(liveConfig, charFile, fixedFinalCharName, userObj.username)
        const samplers = JSON.parse(liveConfig.samplers);
        console.log(samplers)
        //apply the selected preset values to the API call
        for (const [key, value] of Object.entries(samplers)) {
            APICallParams[key] = value;
        }
        //add full prompt to API call
        APICallParams.prompt = fullPromptforAI;
        //ctx and response length for Text Completion API
        APICallParams.truncation_length = Number(liveConfig.contextSize)
        APICallParams.max_tokens = Number(liveConfig.responseLength)
        //ctx and response length for Horde
        APICallParams.max_context_length = Number(liveConfig.contextSize)
        APICallParams.max_length = Number(liveConfig.responseLength)

        //add stop strings
        const [finalAPICallParams, entitiesList] = await setStopStrings(liveConfig, APICallParams, includedChatObjects)

        var AIResponse = '';
        if (liveConfig.engineMode === 'horde') {
            const [hordeResponse, workerName, hordeModel, kudosCost] = await requestToHorde(STBasicAuthCredentials, finalAPICallParams);
            AIResponse = hordeResponse;
        }
        else {
            let liveAPI = await db.getAPI(selectedAPIName)
            //finalAPICallParams includes formatted TC prompt
            //includedChatObjects is an array of chat history objects that got included in the prompt
            //we send these along in case we are using chat completion, and need to convert before pinging the API.
            AIResponse = trimIncompleteSentences(await requestToTCorCC(liveAPI, finalAPICallParams, includedChatObjects))
        }

        await db.upsertChar(charName, charName, userObj.color);
        await db.writeAIChatMessage(charName, charName, AIResponse, 'AI');

        let AIChatUserList = await makeAIChatUserList(entitiesList, includedChatObjects)

        return [AIResponse, AIChatUserList]

    } catch (error) {
        console.log(error);
    }
}


//entityList is a set of entities drawn from setStopStrings, which gathers names for all entities in the chat history.
//chatHistoryFromPrompt is a JSON array of chat messages which made it into the prompt for the AI, as set by addCharDefsToPrompt
//this function compares the entity username from the set against the username in the chat object arrray
//if a match is found, the username and associated color are added into the AIChatUserList array
//this array is returned and sent along with the AI response, in order to populate the AI Chat UserList.

async function makeAIChatUserList(entitiesList, chatHistoryFromPrompt) {
    //console.log('-----------MAKING ENTITIES LIST NOW');
    const chatHistoryEntities = entitiesList;
    //console.log(chatHistoryEntities)
    const fullChatDataJSON = chatHistoryFromPrompt;
    const AIChatUserList = [];

    for (const entity of chatHistoryEntities) {
        //console.log(entity);
        for (const chat of fullChatDataJSON) {
            //console.log(chat);
            //console.log(`${chat.username} vs ${entity.username}`);
            if (chat.username === entity.username) {
                //console.log('found match');
                const userColor = chat.userColor;
                const username = chat.username;
                const entityType = chat.entity;
                AIChatUserList.push({ username: username, color: userColor, entity: entityType });
                break; // Once a match is found, no need to continue the inner loop
            }
        }
    }

    //console.log('Latest AI Chat User List:');
    //console.log(AIChatUserList);
    return AIChatUserList;
}

function countTokens(str) {
    let chars = str.length
    let tokens = Math.ceil(chars / 3)
    //console.log(`estimated tokens: ${tokens}`)
    return tokens
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
    //console.log('TRIMMEDSTRING')
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

async function setStopStrings(liveConfig, APICallParams, includedChatObjects) {

    //an array of chat message objects which made it into the AI prompt context limit
    let chatHistory = includedChatObjects;
    //create a array of usernames and entity types to pass back for processing for AIChat UserList
    let usernames = [];
    const knownUsernames = new Set();
    // Iterate over chatHistory and extract unique usernames and their entity type
    for (const obj of chatHistory) {
        const username = obj.username;
        const entity = obj.entity
        const key = `${username}_${entity}`
        if (!knownUsernames.has(key)) {
            knownUsernames.add(key);
            usernames.push({ username: username, entity: entity });
        }

    }
    //console.log('-------- USERNAMES FOUND')
    //console.log(usernames)
    let targetObj = []

    // Generate permutations for each unique username
    //TODO: find a sensible way to optimize this. 4 strings per entity is a lot..
    for (const entity of usernames) {
        targetObj.push(
            `${entity.username}:`,
            `\n${entity.username}:`,
            ` ${entity.username}:`,
            `\n ${entity.username}:`
        );
    }

    if (liveConfig.engineMode === 'TC') {
        APICallParams.stop = targetObj
    } else {
        APICallParams.params.stop_sequence = targetObj
    }
    return [APICallParams, usernames]
}

function replaceMacros(string, username, charname) {
    var replacedString = string.replace(/{{user}}/g, username);
    replacedString = replacedString.replace(/{{char}}/g, charname);

    return replacedString
}

async function addCharDefsToPrompt(liveConfig, charFile, lastUserMesageAndCharName, username) {
    console.log(`addCharDefsToPrompt: ${username}`)
    return new Promise(async function (resolve, reject) {
        try {
            let charData = await fio.charaRead(charFile, 'png')
            let chatHistory = await ObjectifyChatHistory()
            let ChatObjsInPrompt = []

            //replace {{user}} and {{char}} for character definitions
            const charJSON = JSON.parse(charData)
            const charName = charJSON.name
            const jsonString = JSON.stringify(charJSON);
            let replacedString = replaceMacros(jsonString, username, charJSON.name)
            const replacedData = JSON.parse(replacedString);

            //replace {{user}} and {{char}} for D1JB
            var D1JB = replaceMacros(liveConfig.D1JB, username, charJSON.name) || ''


            const instructSequence = JSON.parse(liveConfig.instructSequences)
            const inputSequence = replaceMacros(instructSequence.input_sequence, username, charJSON.name)
            const outputSequence = replaceMacros(instructSequence.output_sequence, username, charJSON.name)
            const systemSequence = replaceMacros(instructSequence.system_sequence, username, charJSON.name)
            const endSequence = replaceMacros(instructSequence.end_sequence, username, charJSON.name)
            const systemMessage = `You are ${charName}. Write ${charName}'s next response in this roleplay chat with ${username}.`

            //add the char description, personality, scenario, and first message
            var stringToReturn =
                `${systemSequence}${systemMessage}\n${replacedData?.description}\n${replacedData?.personality.trim()}\n${replacedData?.scenario.trim()}`
            //add the chat history
            stringToReturn = stringToReturn.trim()
            let promptTokens = countTokens(stringToReturn)
            //console.log(`before adding ChatHIstory, Prompt is: ~${promptTokens}`)
            let insertedItems = []
            for (let i = chatHistory.length - 1; i >= 0; i--) {
                let obj = chatHistory[i];
                let newItem
                if (obj.username === charName) {
                    newItem = `${endSequence}${outputSequence}${obj.username}: ${obj.content}`;
                } else {
                    newItem = `${endSequence}${inputSequence}${obj.username}: ${obj.content}`;
                }

                let newItemTokens = countTokens(newItem);
                if (promptTokens + newItemTokens < liveConfig.contextSize) {
                    promptTokens += newItemTokens;
                    ChatObjsInPrompt.push(obj)
                    //console.log(`added new item, prompt tokens: ~${promptTokens}`);
                    insertedItems.push(newItem); // Add new item to the array
                }
            }
            // Reverse the array before appending to insertedChatHistory
            let reversedItems = insertedItems.reverse();
            let insertedChatHistory = reversedItems.join('');
            stringToReturn += insertedChatHistory
            stringToReturn += `${endSequence}`
            //add the final first mes and userInput        
            if (D1JB.length !== 0 && D1JB !== '' && D1JB !== undefined && D1JB !== null) {
                stringToReturn += `${systemSequence}${D1JB}\n${endSequence}`
            }
            stringToReturn += `${outputSequence}${lastUserMesageAndCharName.trim()}`;
            stringToReturn = stringToReturn.trim()
            resolve([stringToReturn, ChatObjsInPrompt]);
        } catch (error) {
            console.error('Error reading file:', error);
            reject(error)
        }
    })
}


async function requestToHorde(STBasicAuthCredentials, stringToSend) {
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

async function testAPI(api) {
    console.log(api)
    let testMessage
    let payload = {
        stream: false,
        seed: -1,
        stop: [' ']
    }
    let testMessageObject = [{ entity: 'user', content: 'Test Message' }]

    if (api.type === 'CC') {
        payload.model = 'gpt-3.5-turbo'

    } else {
        let TCTestMessage = 'User: Test Message'
        payload.prompt = TCTestMessage
        //delete payload.stop
    }


    let result = await requestToTCorCC(api, payload, testMessageObject, true)
    return result

}

async function requestToTCorCC(liveAPI, APICallParamsAndPrompt, includedChatObjects, isTest) {

    const isCCSelected = liveAPI.type === 'CC' ? true : false
    const TCEndpoint = liveAPI.endpoint
    const TCAPIKey = liveAPI.key

    //this is brought in from the sampler preset, but we don't use it yet.
    //better to not show it in the API gen call response, would be confusing.
    delete APICallParamsAndPrompt.system_prompt

    const url = TCEndpoint.trim()
    console.log(url)
    const key = TCAPIKey.trim()
    console.log(key)
    console.log(`Sending ${liveAPI.type} API request..`);

    try {

        const headers = {
            'Content-Type': 'application/json',
            'Cache': 'no-cache',
            'x-api-key': key,
            'Authorization': `Bearer ${key}`,
        };

        function TCtoCC(messages, stops) {
            console.log('entered the TC to CC function. here is the incoming message array:')
            console.log(messages)
            //convert chat history object produced by addCharDefsToPrompt into CC compliant format
            let CCMessages = messages.map(message => {
                const { content, entity } = message;
                let role = '';

                if (entity === 'user') {
                    role = 'user';
                } else if (entity === 'AI') {
                    role = 'assistant';
                }

                return {
                    content,
                    role
                };
            });
            //reduce stop to 4 items as requried by CC API (at least OAI's)
            let CCStops = stops.slice(0, 4);

            return [CCMessages, CCStops]
        }

        if (isCCSelected) {
            console.log('========== DOING CC conversion =======')
            const [CCMessages, CCStops] = TCtoCC(includedChatObjects, APICallParamsAndPrompt.stop)
            APICallParamsAndPrompt.stop = CCStops
            APICallParamsAndPrompt.messages = CCMessages
            APICallParamsAndPrompt.model = 'gpt-3.5-turbo' //we can figure out model selection later.
            APICallParamsAndPrompt.stream = false //this needs to be false until we figure out streaming
        }

        const body = JSON.stringify(APICallParamsAndPrompt);
        console.log(APICallParamsAndPrompt)

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body,
            timeout: 0,
        })
        if (response.status === 200) {
            let text, status
            let JSONResponse = await response.json()
            console.log('--- API RESPONSE')
            if (isCCSelected) {
                console.log(JSONResponse.choices[0])
                text = JSONResponse.choices[0].message.content
                //return text;
            } else {
                console.log(JSONResponse)
                text = JSONResponse.choices[0].text
                //return text;
            }
            if (isTest) {
                status = response.status
                let testResults = {
                    status: status,
                    value: text
                }
                return testResults
            }
            return text
        } else {
            console.log(`API Error: Code ${response.status}`)
            return `Error: code ${response.status}`
        }


    } catch (error) {
        console.log('Error while requesting Text Completion API');
        const line = error.stack.split('\n').pop().split(':').pop();
        console.log(line);
        console.log(error);
    }
}

module.exports = {
    getAIResponse: getAIResponse,
    getAPIDefaults: getAPIDefaults,
    replaceMacros: replaceMacros,
    setNewAPI: setNewAPI,
    testAPI: testAPI,
    getTCInfo: getTCInfo,
}

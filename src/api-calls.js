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
const secretsObj = JSON.parse(fs.readFileSync('./secrets.json', { encoding: 'utf8' }));
const TCAPIkey = secretsObj.api_key_TC
const STBasicAuthCredentials = secretsObj?.sillytavern_basic_auth_string

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

async function getAIResponse(engineMode, parsedMessage, userPrompt, liveConfig) {

    try {
        console.log(engineMode)
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
        const [fullPromptforAI, includedChatObjects] = await addCharDefsToPrompt(liveConfig, charFile, fixedFinalCharName, parsedMessage.username)
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
            const [hordeResponse, workerName, hordeModel, kudosCost] = await requestToHorde(finalAPICallParams);
            AIResponse = hordeResponse;
        }
        else {
            AIResponse = trimIncompleteSentences(await requestToTC(finalAPICallParams))
        }

        await db.upsertChar(charName, charName, parsedMessage.userColor);
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
    console.log(input)
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
    return new Promise(async function (resolve, reject) {
        try {
            let charData = await fio.charaRead(charFile, 'png')
            let chatHistory = await ObjectifyChatHistory()
            let ChatObjsInPrompt = []

            //replace {{user}} and {{char}} for character definitions
            const jsonData = JSON.parse(charData)
            const charName = jsonData.name
            const jsonString = JSON.stringify(jsonData);
            let replacedString = replaceMacros(jsonString, username, jsonData.name)
            const replacedData = JSON.parse(replacedString);

            //replace {{user}} and {{char}} for D1JB
            var D1JB = replaceMacros(liveConfig.D1JB, username, jsonData.name) || ''


            const instructSequence = JSON.parse(liveConfig.instructSequences)
            const inputSequence = instructSequence.input_sequence
            const outputSequence = instructSequence.output_sequence
            const systemSequence = instructSequence.system_sequence
            const endSequence = instructSequence.end_sequence
            const systemMessage = `You are ${charName}. Write ${charName}'s next response in this roleplay chat with ${username}.`

            //add the char description, personality, scenario, and first message
            var stringToReturn =
                `${systemSequence}${systemMessage}\n${replacedData?.description}\n${replacedData?.personality.trim()}\n${replacedData?.scenario.trim()}${endSequence}`
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
                    ChatObjsInPrompt.push(obj)
                    //console.log(`added new item, prompt tokens: ~${promptTokens}`);
                    insertedItems.push(newItem); // Add new item to the array
                }
            }

            // Reverse the array before appending to insertedChatHistory
            let reversedItems = insertedItems.reverse();
            let insertedChatHistory = reversedItems.join('');
            stringToReturn += insertedChatHistory
            //add the final first mes and userInput        
            stringToReturn += `${systemSequence}${D1JB}\n${endSequence}`
            stringToReturn += `${outputSequence}${lastUserMesageAndCharName.trim()}`;
            stringToReturn = stringToReturn.trim()
            resolve([stringToReturn, ChatObjsInPrompt]);
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

async function requestToTC(APICallParamsAndPrompt) {
    //message needs to be the ENTIRE API call, including params and chat history..
    try {
        console.log('Sending Text Completion API request..');
        const url = TCURL + TCGenEndpoint;

        const headers = {
            'Content-Type': 'application/json',
            'Cache': 'no-cache',
            'x-api-key': TCAPIkey,
            'Authorization': `Bearer ${TCAPIkey}`,
        };

        //old code for pulling from an external JSON file to get gen params, currently these are provided by client.html WS messages
        //TODO: revert to external JSON and only pull necessary variables from client.html WS pings.

        //const TCAPICallParams = JSON.parse(fs.readFileSync('TCAPICall.json', 'utf-8'));
        //TCAPICallParams['prompt'] = stringToSend;
        //TCAPICallParams['stopping_strings'] = stoppingStrings;

        const body = JSON.stringify(APICallParamsAndPrompt);
        console.log(APICallParamsAndPrompt)

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body,
            timeout: 0,
        })
        //console.log("RAW LLM API RESPONSE")
        //console.log(response)
        let JSONResponse = await response.json()
        console.log('--- API RESPONSE')
        console.log(JSONResponse)
        let text = JSONResponse.choices[0].text
        //console.log('AI CHAT API RESPONSE')
        //console.log(text)
        return text;
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
}
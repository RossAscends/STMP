
const fs = require('fs');
const $ = require('jquery');

const db = require('./db.js');
const fio = require('./file-io.js')
const { apiLogger: logger } = require('./log.js');


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
        logger.error('Error reading or parsing the default API Param JSON file:', error);
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
        logger.trace(APICallParams)

        //if it's not an empty trigger from host
        //if userInput is empty we can just request the AI directly
        let charFile = liveConfig.selectedCharacter
        logger.trace(`selected character: ${charFile}`)
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
        logger.debug(samplers)
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
            let rawResponse = await requestToTCorCC(liveAPI, finalAPICallParams, includedChatObjects, false, liveConfig)
            AIResponse = trimIncompleteSentences(rawResponse)
        }

        await db.upsertChar(charName, charName, userObj.color);
        await db.writeAIChatMessage(charName, charName, AIResponse, 'AI');

        let AIChatUserList = await makeAIChatUserList(entitiesList, includedChatObjects)

        return [AIResponse, AIChatUserList]

    } catch (error) {
        logger.error('Error while requesting AI response');
        logger.error(error);
    }
}


//entityList is a set of entities drawn from setStopStrings, which gathers names for all entities in the chat history.
//chatHistoryFromPrompt is a JSON array of chat messages which made it into the prompt for the AI, as set by addCharDefsToPrompt
//this function compares the entity username from the set against the username in the chat object arrray
//if a match is found, the username and associated color are added into the AIChatUserList array
//this array is returned and sent along with the AI response, in order to populate the AI Chat UserList.

async function makeAIChatUserList(entitiesList, chatHistoryFromPrompt) {
    logger.trace('-----------MAKING ENTITIES LIST NOW');
    const chatHistoryEntities = entitiesList;
    logger.trace(chatHistoryEntities)
    const fullChatDataJSON = chatHistoryFromPrompt;
    const AIChatUserList = [];

    for (const entity of chatHistoryEntities) {
        for (const chat of fullChatDataJSON) {
            if (chat.username === entity.username) {
                const userColor = chat.userColor;
                const username = chat.username;
                const entityType = chat.entity;
                AIChatUserList.push({ username: username, color: userColor, entity: entityType });
                break; // Once a match is found, no need to continue the inner loop
            }
        }
    }
    return AIChatUserList;
}

function countTokens(str) {
    let chars = str.length
    let tokens = Math.ceil(chars / 3)
    logger.trace(`estimated tokens: ${tokens}`)
    return tokens
}

function trimIncompleteSentences(input, include_newline = false) {
    const punctuation = new Set(['.', '!', '?', '*', '"', ')', '}', '`', ']', '$', '。', '！', '？', '”', '）', '】', '】', '’', '」', '】']); // extend this as you see fit
    let last = -1;
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
        logger.trace(input.trimEnd())
        return input.trimEnd();
    }
    let trimmedString = input.substring(0, last + 1).trimEnd();
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
            logger.error('An error occurred while parsing the JSON:', parseError);
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
    logger.debug(`addCharDefsToPrompt: ${username}`)
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
            logger.trace(`before adding ChatHIstory, Prompt is: ~${promptTokens}`)
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
                    logger.trace(`added new item, prompt tokens: ~${promptTokens}`);
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
            logger.error('Error reading file:', error);
            reject(error)
        }
    })
}


async function requestToHorde(STBasicAuthCredentials, stringToSend) {
    logger.debug('Sending Horde request...');
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
    logger.debug(`--- horde payload:`)
    logger.debug(stringToSend)

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
            logger.warn('no task ID, aborting')
            return 'error requesting Horde'
        }
        logger.debug(`horde task ID ${task_id}`)

        for (var retryNumber = 0; retryNumber < MAX_RETRIES; retryNumber++) {

            var status_url = "https://horde.koboldai.net/api/v2/generate/text/status/" + task_id;
            var status_headers = {
                "Client-Agent": 'SillyTavern:UNKNOWN:Cohee#1207',
            };

            await new Promise(function (resolve) {
                setTimeout(resolve, CHECK_INTERVAL);
            });

            var statusResponse = await (await fetch(status_url, status_headers)).json()
            logger.info('Horde status check ' + (retryNumber + 1) + ': ' + statusResponse.wait_time + ' secs left');
            if (
                statusResponse.done &&
                Array.isArray(statusResponse.generations) &&
                statusResponse.generations.length > 0
            ) {
                var workerName = statusResponse.generations[0].worker_name;
                var hordeModel = statusResponse.generations[0].model;
                var text = statusResponse.generations[0].text;
                var kudosCost = statusResponse.kudos + 2
                logger.debug('Raw Horde response: ' + text);
                logger.debug(`Worker: ${workerName}, Model:${hordeModel}`)
                return [text, workerName, hordeModel, kudosCost]
            }
        }
    } else {
        logger.error('Error while requesting ST');
        logger.error(response)
    };
}

async function testAPI(api, liveConfig) {
    logger.trace(api)
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


    let result = await requestToTCorCC(api, payload, testMessageObject, true, liveConfig)
    return result

}

async function getModelList(api) {
    let fullURL = api.endpoint
    var modifiedString = fullURL.replace(/\/chat\/completions\/?$/, "");
    let modelsEndpoint = modifiedString + '/models'
    logger.debug(`Fetching model list from: ${modelsEndpoint}`)
    const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache': 'no-cache',
            'Authorization': 'Bearer ' + api.key,
        },
    });

    if (response.status === 200) {
        let responseJSON = await response.json();
        let modelNames = responseJSON.data.map(item => item.id);
        logger.debug('Available models:');
        logger.debug(modelNames);
        return responseJSON.data;
    } else {
        logger.error(`Error getting models. Code ${response.status}`)
    }
}

async function requestToTCorCC(liveAPI, APICallParamsAndPrompt, includedChatObjects, isTest, liveConfig) {
    //console.log(liveConfig)
    const isCCSelected = liveAPI.type === 'CC' ? true : false
    const TCEndpoint = liveAPI.endpoint
    const TCAPIKey = liveAPI.key

    //this is brought in from the sampler preset, but we don't use it yet.
    //better to not show it in the API gen call response, would be confusing.
    delete APICallParamsAndPrompt.system_prompt

    //Claude uses max_tokens_to_sampl, this is a testing placeholder.
    //APICallParamsAndPrompt.max_tokens_to_sample = 300

    const url = TCEndpoint.trim()
    logger.trace(url)
    const key = TCAPIKey.trim()
    logger.trace(key)
    logger.debug(`Sending ${liveAPI.type} API request..`);

    try {

        const headers = {
            'Content-Type': 'application/json',
            'Cache': 'no-cache',
            'anthropic-version': '2023-06-01', //for Claude, apparently, doesn't hurt OAI calls.
            'x-api-key': key,
            'Authorization': `Bearer ${key}`,
        };

        function TCtoCC(messages, stops) {
            logger.trace('entered the TC to CC function. here is the incoming message array:')
            logger.trace(messages)
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
            CCMessages.reverse()
            //reduce stop to 4 items as requried by OAI's CC API
            let CCStops = stops.slice(0, 4);

            return [CCMessages, CCStops]
        }
        APICallParamsAndPrompt.model = liveConfig.selectedModel
        if (isCCSelected) {
            logger.trace('========== DOING CC conversion =======')
            const [CCMessages, CCStops] = TCtoCC(includedChatObjects, APICallParamsAndPrompt.stop)
            APICallParamsAndPrompt.stop = CCStops
            APICallParamsAndPrompt.messages = CCMessages
            APICallParamsAndPrompt.stream = false //this needs to be false until we figure out streaming
        }

        logger.debug(' ')
        logger.debug('HEADERS')
        logger.debug(headers)
        logger.debug(' ')
        logger.debug('PAYLOAD BODY')
        logger.debug(APICallParamsAndPrompt)
        logger.debug(' ')
        const body = JSON.stringify(APICallParamsAndPrompt);
        logger.debug(`Sending chat request to ${url}`)

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body,
            timeout: 0,
        })
        let JSONResponse = await response.json()
        if (response.status === 200) {
            let text, status
            logger.debug('--- API RESPONSE')
            logger.debug(JSONResponse)
            if (isCCSelected) {
                //look for 'choices' from OAI, and then if it doesn't exist, look for 'completion' (from Claude)
                if (JSONResponse.choices && JSONResponse.choices.length > 0) {
                    text = JSONResponse.choices[0].message?.content || JSONResponse.completion;
                } else {
                    text = JSONResponse.completion;
                }
                //return text;
            } else {
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
            logger.error('API RETURNED ERROR:')
            logger.error(JSONResponse)
            return JSONResponse
        }


    } catch (error) {
        logger.error('Error while requesting Text Completion API');
        const line = error.stack.split('\n').pop().split(':').pop();
        logger.error(line);
        logger.error(error);
    }
}

module.exports = {
    getAIResponse: getAIResponse,
    getAPIDefaults: getAPIDefaults,
    replaceMacros: replaceMacros,
    testAPI: testAPI,
    getModelList: getModelList,
}

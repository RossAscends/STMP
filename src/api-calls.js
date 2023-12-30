
const fs = require('fs');
const $ = require('jquery');
const { Readable } = require('stream');
const { EventEmitter } = require('events');
const textEmitter = new EventEmitter();

const db = require('./db.js');
const fio = require('./file-io.js')

//const streaming = require('./stream.js')

const { apiLogger: logger } = require('./log.js');


function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

var TCAPIDefaults, HordeAPIDefaults

async function getAPIDefaults(shouldReturn = null) {
    try {
        const fileContents = await fio.readFile('default-API-Parameters.json');
        const jsonData = JSON.parse(fileContents);
        const { TCAPICallParams, HordeAPICallParams } = jsonData[0];
        TCAPIDefaults = TCAPICallParams;
        HordeAPIDefaults = HordeAPICallParams;
        if (shouldReturn) {
            let defaults = [TCAPIDefaults, HordeAPIDefaults]
            return defaults
        }


    } catch (error) {
        logger.error('Error reading or parsing the default API Param JSON file:', error);
    }
}

async function getAIResponse(isStreaming, selectedAPIName, STBasicAuthCredentials, engineMode, user, liveConfig, liveAPI, onlyUserList) {
    let isCCSelected = liveAPI.type === 'CC' ? true : false
    try {
        let APICallParams = {}
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
        const [fullPromptforAI, includedChatObjects] = await addCharDefsToPrompt(liveConfig, charFile, fixedFinalCharName, user.username, liveAPI)
        const samplers = JSON.parse(liveConfig.samplers);
        //logger.debug(samplers)
        //apply the selected preset values to the API call
        for (const [key, value] of Object.entries(samplers)) {
            APICallParams[key] = value;
        }
        //add full prompt to API call
        if (!isCCSelected) {
            APICallParams.prompt = fullPromptforAI;
        } else {
            APICallParams.messages = fullPromptforAI
        }

        //ctx and response length for Text Completion API
        APICallParams.truncation_length = Number(liveConfig.contextSize)
        APICallParams.max_tokens = Number(liveConfig.responseLength)
        //ctx and response length for Horde
        APICallParams.max_context_length = Number(liveConfig.contextSize)
        APICallParams.max_length = Number(liveConfig.responseLength)

        //add stop strings
        const [finalAPICallParams, entitiesList] = await setStopStrings(liveConfig, APICallParams, includedChatObjects, liveAPI)

        var AIResponse = '';
        if (liveConfig.engineMode === 'horde') {
            const [hordeResponse, workerName, hordeModel, kudosCost] = await requestToHorde(STBasicAuthCredentials, finalAPICallParams);
            AIResponse = hordeResponse;
        }
        else {

            let AIChatUserList = await makeAIChatUserList(entitiesList, includedChatObjects)
            if (onlyUserList) {
                return AIChatUserList
            }
            //finalAPICallParams includes formatted TC prompt
            //includedChatObjects is an array of chat history objects that got included in the prompt
            //we send these along in case we are using chat completion, and need to convert before pinging the API.
            let rawResponse = await requestToTCorCC(isStreaming, liveAPI, finalAPICallParams, includedChatObjects, false, liveConfig)


            //finalize non-streamed responses
            if (!finalAPICallParams.stream) {
                console.log('RAW RESPONSE')
                console.log(rawResponse)
                AIResponse = trimIncompleteSentences(rawResponse)
                await db.upsertChar(charName, charName, user.color);
                await db.writeAIChatMessage(charName, charName, AIResponse, 'AI');
                // let AIChatUserList = await makeAIChatUserList(entitiesList, includedChatObjects)
                return [AIResponse, AIChatUserList]

            } else {

                return null
            }
        }
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
    //logger.trace('-----------MAKING ENTITIES LIST NOW');
    const chatHistoryEntities = entitiesList;
    //logger.trace(chatHistoryEntities)
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
    if (input === undefined) { return 'Error processing response (could not trim sentences).' }

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

async function setStopStrings(liveConfig, APICallParams, includedChatObjects, liveAPI) {
    logger.debug(`[setStopStrings] >> GO`)
    //logger.debug(APICallParams)
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
    /*     logger.debug(APICallParams)
        logger.debug(targetObj)
        logger.debug(liveAPI)
        logger.debug(liveConfig) */
    if (liveAPI.claude === 1) { //for claude
        logger.debug('setting Claude stop strings')
        APICallParams.stop_sequences = targetObj
    } else if (liveConfig.engineMode === 'TC' || liveConfig.engineMode === 'CC' && liveAPI.claude !== 1) { //for TC and OAI CC
        logger.debug('setting TC/OAI stop strings')
        APICallParams.stop = targetObj
    } else { //for horde
        logger.debug('setting horde stop strings')
        APICallParams.params.stop_sequence = targetObj
    }
    return [APICallParams, usernames]
}

function replaceMacros(string, username, charname) {
    var replacedString = string.replace(/{{user}}/g, username);
    replacedString = replacedString.replace(/{{char}}/g, charname);

    return replacedString
}

async function addCharDefsToPrompt(liveConfig, charFile, lastUserMesageAndCharName, username, liveAPI) {
    logger.debug(`[addCharDefsToPrompt] >> GO`)
    //logger.debug(liveAPI)
    let isClaude = liveAPI.claude
    let isCCSelected = liveAPI.type === 'CC' ? true : false

    //logger.debug(`addCharDefsToPrompt: ${username}`)
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
            var D1JBObj = { role: 'system', content: D1JB }

            const instructSequence = JSON.parse(liveConfig.instructSequences)
            const inputSequence = replaceMacros(instructSequence.input_sequence, username, charJSON.name)
            const outputSequence = replaceMacros(instructSequence.output_sequence, username, charJSON.name)
            const systemSequence = replaceMacros(instructSequence.system_sequence, username, charJSON.name)
            const endSequence = replaceMacros(instructSequence.end_sequence, username, charJSON.name)
            const systemMessage = `You are ${charName}. Write ${charName}'s next response in this roleplay chat with ${username}.`

            var systemPrompt = `${systemSequence}${systemMessage}\n${replacedData?.description}\n${replacedData?.personality.trim()}\n${replacedData?.scenario.trim()}${endSequence}`

            if (!isCCSelected) {
                //this will be what we return to TC as the prompt
                var stringToReturn = systemPrompt

                //add the chat history
                stringToReturn = stringToReturn.trim()

                if (isClaude) {
                    stringToReturn += '\n[Start a new Chat]'
                }
                let promptTokens = countTokens(stringToReturn)
                logger.trace(`before adding ChatHIstory, Prompt is: ~${promptTokens}`)
                let insertedItems = []

                for (let i = chatHistory.length - 1; i >= 0; i--) {
                    let obj = chatHistory[i];
                    let newItem
                    if (obj.username === charName) {
                        if (isClaude) {
                            newItem = `${endSequence}${outputSequence}Assistant: ${obj.content}`;
                        } else {
                            newItem = `${endSequence}${outputSequence}${obj.username}: ${obj.content}`;
                        }
                    } else {
                        if (isClaude) {
                            newItem = `${endSequence}${inputSequence}Human: ${obj.content}`;
                        } else {
                            newItem = `${endSequence}${inputSequence}${obj.username}: ${obj.content}`;
                        }

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
                    stringToReturn += `${systemSequence}${D1JB}${endSequence}`
                }
                stringToReturn += `${outputSequence}`
                if (isClaude) {
                    stringToReturn += `Assistant:` //toggle for claude    
                } else {
                    stringToReturn += lastUserMesageAndCharName.trim();
                }

                if (isCCSelected) {
                    logger.debug('========== DOING CC conversion =======')
                    const [CCMessages, CCStops] = TCtoCC(includedChatObjects, APICallParamsAndPrompt.stop)
                    APICallParamsAndPrompt.stop = CCStops
                    APICallParamsAndPrompt.messages = CCMessages

                }

                stringToReturn = stringToReturn.trim()

                resolve([stringToReturn, ChatObjsInPrompt]);
            } else {
                var CCMessageObj = []

                var systemPromptObject = {
                    role: 'system',
                    content: systemPrompt
                }

                let promptTokens = countTokens(systemPromptObject['content'])
                //logger.debug(`before adding ChatHistory, Prompt is: ~${promptTokens}`)

                let insertedItems = []

                for (let i = chatHistory.length - 1; i >= 0; i--) {
                    let obj = chatHistory[i];
                    let newItem
                    if (i === chatHistory.length - 2) {
                        CCMessageObj.push(D1JBObj)
                    }
                    if (obj.username === charName) {
                        newObj = {
                            role: 'assistant',
                            content: obj.content
                        }
                    } else {
                        newObj = {
                            role: 'human',
                            content: obj.content
                        }
                    }

                    let newItemTokens = countTokens(newObj.content);
                    if (promptTokens + newItemTokens < liveConfig.contextSize) {
                        promptTokens += newItemTokens;
                        CCMessageObj.push(newObj)
                        //logger.debug(`added new item, prompt tokens: ~${promptTokens}`);
                        insertedItems.push(newObj); // Add new item to the array
                    }
                }
            }
            CCMessageObj.push({ role: 'system', content: '[Start a New Chat]' })

            CCMessageObj.push(systemPromptObject)
            CCMessageObj = CCMessageObj.reverse();
            resolve([CCMessageObj, ChatObjsInPrompt]);


        } catch (error) {
            logger.error('Error reading file:', error);
            reject(error)
        }
    })
}

function TCtoCC(messages, systemMessage, stops) {
    //logger.debug('entered the TC to CC function. here is the incoming message array:')
    //logger.debug(messages)
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

async function requestToHorde(STBasicAuthCredentials, stringToSend) {
    logger.info('Sending Horde request...');
    //the ST server must be running with CSRF turned off in order for this to work.
    var STHordeURL = 'http://127.0.0.1:8000/api/horde/generate-text';
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
    logger.info(`--- horde payload:`)
    logger.info(stringToSend)

    var timeout = 30000; // Timeout value in milliseconds (30 seconds)

    const response = await fetch(STHordeURL, {
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

            var horde_status_url = "https://horde.koboldai.net/api/v2/generate/text/status/" + task_id;
            var status_headers = {
                "Client-Agent": 'SillyTavern:UNKNOWN:Cohee#1207',
            };

            await new Promise(function (resolve) {
                setTimeout(resolve, CHECK_INTERVAL);
            });

            var statusResponse = await (await fetch(horde_status_url, status_headers)).json()
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
                logger.info(`Worker: ${workerName}, Model:${hordeModel}`)
                return [text, workerName, hordeModel, kudosCost]
            }
        }
    } else {
        logger.error('Error while requesting ST');
        logger.error(response)
    };
}

async function testAPI(isStreaming, api, liveConfig) {
    logger.debug(`[testAPI] >> GO`)
    logger.info('api:')
    logger.info(api)
    let testMessage
    let payload = {
        stream: isStreaming,
        seed: -1,
        stop: [' ']
    }
    let testMessageObject = [{ entity: 'user', content: 'Test Message' }]
    let TCTestMessage = 'User: Test Message'
    if (api.type === 'CC') {
        payload.model = liveConfig.selectedModel
        testMessage = testMessageObject

    } else {
        testMessage = TCTestMessage
        payload.prompt = TCTestMessage
        //delete payload.stop
    }


    let result = await requestToTCorCC(isStreaming, api, payload, testMessage, true, liveConfig)
    return result

}

async function getModelList(api) {
    let isClaude = api.isClaude
    let baseURL = api.endpoint

    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api.key,
        'Authorization': 'Bearer ' + api.key,
    }
    //console.log(headers)

    /*     if (!isClaude) {
            try {
                const modelInfoUrl = baseURL + 'model/';
                console.log(modelInfoUrl)
                const modelInfoReply = await fetch(modelInfoUrl, headers);
                if (modelInfoReply) {
                    const modelInfo = await modelInfoReply.json();
                    console.log(modelInfo)
                    return modelInfo
                }
            }
            catch (error) {
                console.log(error)
            }
        } */

    let modelsEndpoint = baseURL + 'models/'
    logger.info(`Fetching model list from: ${modelsEndpoint}`)

    if (isClaude) {
        headers['anthropic-version'] = '2023-06-01';
    }

    const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: headers,
    });

    if (response.status === 200) {
        let responseJSON = await response.json();
        let modelNames = responseJSON.data.map(item => item.id);
        logger.info('Available models:');
        logger.info(modelNames);
        return responseJSON.data;
    } else {
        logger.error(`Error getting models. Code ${response.status}`)
    }


}

async function requestToTCorCC(isStreaming, liveAPI, APICallParamsAndPrompt, includedChatObjects, isTest, liveConfig) {
    let isClaude = liveAPI.claude
    const isCCSelected = liveAPI.type === 'CC' ? true : false
    const TCEndpoint = liveAPI.endpoint
    const TCAPIKey = liveAPI.key
    const key = TCAPIKey.trim()

    //this is brought in from the sampler preset, but we don't use it yet.
    //better to not show it in the API gen call response, would be confusing.
    delete APICallParamsAndPrompt.system_prompt

    let baseURL = TCEndpoint.trim()
    let chatURL
    if (!isClaude) {
        if (isCCSelected) { //for CC, OAI and others
            chatURL = baseURL + 'chat/completions/'
        } else { //for TC (Tabby, KCPP, and OR?)
            chatURL = baseURL + 'completions/'
        }
    } else { //for Claude
        chatURL = baseURL + 'complete/'
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Cache': 'no-cache',
            'x-api-key': key,
            'Authorization': `Bearer ${key}`,
        };

        if (isClaude) {
            headers['anthropic-version'] = '2023-06-01';
        }

        /*         if (isCCSelected) {
        
                    logger.warn('DELETING ALL NON OAI PARAMETERS')
        
                    APICallParamsAndPrompt.max_tokens = 600
                    APICallParamsAndPrompt.presence_penalty = 0.7
                    APICallParamsAndPrompt.frequency_penalty = 0.7
                    APICallParamsAndPrompt.temperature = 0.9
                    APICallParamsAndPrompt.top_p = 1
                    APICallParamsAndPrompt.top_k = undefined
                    APICallParamsAndPrompt.stop = ['<|', '<|system|>', '<|user|>', '<|assistant|>']
                    APICallParamsAndPrompt.logit_bias = {}
                    APICallParamsAndPrompt.seed = undefined
                    APICallParamsAndPrompt.prompt = undefined
        
                    delete APICallParamsAndPrompt.truncation_length
                    delete APICallParamsAndPrompt.min_p
                    delete APICallParamsAndPrompt.typical_p
                    delete APICallParamsAndPrompt.tfs
                    delete APICallParamsAndPrompt.repitition_penalty
                    delete APICallParamsAndPrompt.repitetion_penalty_range
                    delete APICallParamsAndPrompt.skip_special_tokens
                    delete APICallParamsAndPrompt.mirostat_mode
                    delete APICallParamsAndPrompt.mirostat_tau
                    delete APICallParamsAndPrompt.mirostat_tau
                    delete APICallParamsAndPrompt.mirostat_eta
                    delete APICallParamsAndPrompt.grammar_string
                    delete APICallParamsAndPrompt.custom_token_bans
                    delete APICallParamsAndPrompt.max_context_length
                    delete APICallParamsAndPrompt.max_length
        
                    
                } */

        APICallParamsAndPrompt.model = liveConfig.selectedModel

        if (isClaude) {
            APICallParamsAndPrompt.max_tokens_to_sample = APICallParamsAndPrompt.max_tokens
            delete APICallParamsAndPrompt.max_tokens
        }

        APICallParamsAndPrompt.stream = isStreaming

        logger.debug('HEADERS')
        console.log(headers)
        logger.info('PAYLOAD')
        console.log(APICallParamsAndPrompt)

        const body = JSON.stringify(APICallParamsAndPrompt);
        //const abortController = new AbortController();

        let streamingReportText = APICallParamsAndPrompt.stream ? 'streamed' : 'non-streamed'
        logger.info(`Sending ${streamingReportText} ${liveAPI.type} API request to ${chatURL}..`);
        //logger.debug(`API KEY: ${key}`)

        let args = {
            method: 'POST',
            headers: headers,
            body: body,
            timeout: 0,
            //signal: abortController.signal
        }

        //console.log(args)

        const response = await fetch(chatURL, args)


        if (response.status === 200) {
            logger.debug('Status 200: Ok.')
            return await processResponse(response, isCCSelected, isTest, isStreaming, liveAPI)
        } else {
            logger.warn('API error: ' + response.status)

            let JSONResponse = await response.json()
            logger.warn(JSONResponse);
            //these are error message attributes from Tabby
            //logger.debug(JSONResponse.detail[0].loc) //shows the location of the error causing thing
            //logger.debug(JSONResponse.detail[0].input) //just shows the value of messages object
            return JSONResponse;
        }

    } catch (error) {
        logger.error('Error while requesting Text Completion API');
        const line = error.stack.split('\n').pop().split(':').pop();
        logger.error(line);
        logger.error(error);
    }
}

async function processResponse(response, isCCSelected, isTest, isStreaming, liveAPI) {
    let isClaude = liveAPI.claude
    if (!isStreaming) {
        try {
            let JSONResponse = await response.json();
            //logger.debug('Response JSON:', JSONResponse);
            return processNonStreamedResponse(JSONResponse, isCCSelected, isTest);
        }

        catch (error) {
            console.error('Error parsing JSON:', error);

        }
    } else {
        //look for streams first
        if (response.body) {

            let stream = response.body;
            let data = '';
            if (typeof stream.on !== 'function') {
                // Create a new readable stream from response.body
                stream = Readable.from(response.body);
            } else {
                logger.debug('saw function in response body..')
                logger.debug(stream)
            }
            let text
            stream.on('data', async (chunk) => {
                const dataChunk = String.fromCharCode(...chunk);
                //logger.debug(dataChunk)
                data += dataChunk;
                // Process individual JSON objects
                let separatorIndex
                while (true) {
                    separatorIndex = data.indexOf('data: ');
                    if (separatorIndex === -1) {
                        // Incomplete JSON object, wait for more data
                        break;
                    }
                    // Extract the JSON object string
                    const jsonStartIndex = separatorIndex + 6;
                    const jsonEndIndex = data.indexOf('\n', jsonStartIndex);
                    if (jsonEndIndex === -1) {
                        // Incomplete JSON object, wait for more data
                        break;
                    }
                    const jsonChunk = data.substring(jsonStartIndex, jsonEndIndex);

                    // Check if it's the final object
                    if (jsonChunk === '[DONE]') {
                        logger.debug('End of stream. Closing the stream.');
                        stream.destroy();
                        break;
                    }

                    // Remove the "data: " prefix
                    const trimmedJsonChunk = jsonChunk.trim().replace(/^data:\s+/, '');
                    //logger.debug('trimmedJsonChunk:')
                    //logger.debug(trimmedJsonChunk)
                    // Parse and process the JSON object
                    let jsonData = null;
                    try {
                        jsonData = JSON.parse(trimmedJsonChunk);
                    } catch (error) {
                        console.error('Error parsing JSON:', error);
                        break;
                    }

                    if (jsonData.choices && jsonData.choices.length > 0) {
                        if (isCCSelected) {
                            //logger.debug(jsonData.choices)
                            text = jsonData.choices[0].delta.content;
                        } else {
                            text = jsonData.choices[0].text;
                        }
                        textEmitter.emit('text', text);
                        //logger.debug(text)

                        //return text
                    } else {
                        if (isClaude) {
                            if (jsonData.completion || jsonData.completion === '') {
                                text = jsonData.completion;
                                //logger.debug(text)
                            } else {
                                logger.warn('did not see completion:')
                                logger.warn(jsonData)
                            }
                        } else {
                            logger.warn('did not see "choices" object, saw this:')
                            logger.warn(jsonData)
                        }
                        textEmitter.emit('text', text);

                    }


                    // Remove the processed JSON object from the data string
                    data = data.substring(jsonEndIndex + 1);
                }
            });

            stream.on('end', () => { logger.debug('All data entries processed.'); });
            stream.on('error', (error) => { logger.warn('Error while streaming data:', error); });

            // Start reading the chunks
            await readStreamChunks(stream);
            return;
        }
    }

}

async function readStreamChunks(readableStream) {
    return new Promise((resolve, reject) => {
        if (!(readableStream instanceof Readable)) {
            reject(new Error('Invalid readable stream'));
            logger.debug(readableStream)
            return;
        }

        const chunks = [];
        readableStream.on('data', (chunk) => {
            const data = chunk.toString('utf-8');
            chunks.push(data);
        });

        readableStream.on('end', () => {
            logger.info('Stream ended.');
            const data = chunks.join('');
            resolve({ data, streamEnded: true }); // Resolve with data and streamEnded flag
        });

        readableStream.on('error', (error) => {
            console.error('Error while reading the stream:', error);
            reject(error);
        });
    });
}

async function processNonStreamedResponse(JSONResponse, isCCSelected, isTest) {

    let text, status
    logger.info('--- API RESPONSE')
    logger.info(JSONResponse)
    if (isCCSelected) {
        //look for 'choices' from OAI first..
        if (JSONResponse.choices && JSONResponse.choices.length > 0) {
            text = JSONResponse.choices[0].message?.content || JSONResponse.completion;
        } else { //look for Claude stream data location 'completions'
            text = JSONResponse.completion;
        }

    } else { // text completions have data in 'choices'
        text = JSONResponse.choices[0].text
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
}

module.exports = {
    getAIResponse: getAIResponse,
    getAPIDefaults: getAPIDefaults,
    replaceMacros: replaceMacros,
    testAPI: testAPI,
    getModelList: getModelList,
    textEmitter: textEmitter,
    processResponse: processResponse,
    addCharDefsToPrompt: addCharDefsToPrompt,
    setStopStrings: setStopStrings,
    trimIncompleteSentences: trimIncompleteSentences
}

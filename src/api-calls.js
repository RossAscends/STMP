
import fs from 'fs';
import $ from 'jquery';
import util from 'util';
import stream from './stream.js';
import db from './db.js';
import fio from './file-io.js';
import { apiLogger as logger } from './log.js';


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

//MARK: getAIResponse
async function getAIResponse(isStreaming, hordeKey, engineMode, user, liveConfig, liveAPI, onlyUserList, parsedMessage, shouldContinue) {
    // logger.warn('getAIResponse liveAPI:', liveAPI)
    // logger.warn(`liveConfig: ${JSON.stringify(liveConfig)}`);
    const isCCSelected = liveAPI.type === 'CC';
    const isClaude = liveAPI.claude;

    let apiCallParams;

    try {
        apiCallParams = engineMode === 'TC' ? TCAPIDefaults : HordeAPIDefaults;

        const charFile = liveConfig.promptConfig.selectedCharacter;
        const cardData = await fio.charaRead(charFile, 'png');
        const cardJSON = JSON.parse(cardData);
        const charName = cardJSON.name;
        const formattedCharName = JSON.parse(JSON.stringify(`\n${charName}:`).replace(/<[^>]+>/g, ''));

        const [fullPrompt, includedChatObjects] = await addCharDefsToPrompt(liveConfig, charFile, formattedCharName, parsedMessage.username, liveAPI, shouldContinue);
        const samplerData = await fio.readFile(liveConfig.promptConfig.selectedSamplerPreset);
        const samplers = JSON.parse(samplerData);
        //logger.info('[getAIResponse] >> samplers:', samplerData)

        if (isCCSelected) apiCallParams = {}
        //logger.info('apiCallParams samplers cleared')
        //logger.info('PROOF: ', apiCallParams.params)
        Object.entries(samplers).forEach(([key, value]) => {

            if (engineMode === 'horde') {
                apiCallParams.params[key] = value;
            } else {
                //logger.info(`[getAIResponse] >> key: ${key}, value: ${value}`)
                apiCallParams[key] = value;
            }
        });

        apiCallParams.stream = isStreaming;

        if (!isCCSelected) {
            apiCallParams.prompt = fullPrompt;
        } else {
            apiCallParams.messages = fullPrompt;
        }

        if (engineMode !== 'horde' && !isCCSelected) {
            apiCallParams.max_tokens = Number(liveConfig.promptConfig.responseLength);
        }
        const [finalApiCallParams, entitiesList] = await setStopStrings(liveConfig, apiCallParams, includedChatObjects, liveAPI);

        logger.info('[getAIResponse] >> finalApiCallParams after SetStopStrings:', finalApiCallParams.params);

        let AIChatUserList, AIResponse = '';
        if (engineMode === 'horde') { //if horde...
            apiCallParams.params.max_context_length = Number(liveConfig.promptConfig.contextSize);
            apiCallParams.params.max_length = Number(liveConfig.promptConfig.responseLength);
            AIChatUserList = await makeAIChatUserList(entitiesList, includedChatObjects);
            if (onlyUserList) return AIChatUserList; //if only User List for horde

            finalApiCallParams.models = [liveConfig.promptConfig.selectedHordeWorker];
            const [hordeResponse] = await requestToHorde(hordeKey, finalApiCallParams);
            AIResponse = hordeResponse;

            return [AIResponse, AIChatUserList];
        } else { //if TC or CC
            AIChatUserList = await makeAIChatUserList(entitiesList, includedChatObjects);
            if (onlyUserList) return AIChatUserList; //if only User List for TC/CC
            //logger.warn('getting rawResponse for stream')
            let rawResponse = await requestToTCorCC(isStreaming, liveAPI, finalApiCallParams, includedChatObjects, false, liveConfig, parsedMessage, formattedCharName);
            //logger.warn('finished getting rawResponse..., moving on..');

            //logger.warn('finalApiCallParams.stream (after requestToTCorCC):', finalApiCallParams.stream);
            //logger.warn('checking if we are in a stream or not? ', finalApiCallParams.stream);
            if (!finalApiCallParams.stream) { //if not streaming..
                //logger.warn('no stream, returning rawResponse as a whole chunk');
                AIResponse = await postProcessText(trimIncompleteSentences(rawResponse));
                await db.upsertChar(charName, charName, user.color); //why upsert? because it might not exist yet
                await db.writeAIChatMessage(charName, charName, AIResponse, 'AI');
                return [AIResponse, AIChatUserList];
            } else { //if TC and stream...
                //logger.info('it was streamed already, no need to return anything..')
                //return null;
                //console.warn('TC/CC stream response incoming, returning: [AIResponse, AIChatUserList]');
                //console.warn('AIResponse:', AIResponse);
                //console.warn('AIChatUserList:', AIChatUserList);
                return [AIResponse, AIChatUserList]; //return this anyway for now, since it crashes without it
            }
        }
    } catch (error) {
        logger.error('Error while requesting AI response:', error);
    }
}


//entityList is a set of entities drawn from setStopStrings, which gathers names for all entities in the chat history.
//chatHistoryFromPrompt is a JSON array of chat messages which made it into the prompt for the AI, as set by addCharDefsToPrompt
//this function compares the entity username from the set against the username in the chat object arrray
//if a match is found, the username and associated color are added into the AIChatUserList array
//this array is returned and sent along with the AI response, in order to populate the AI Chat UserList.

//MARK: makeAIChatUserList
async function makeAIChatUserList(entitiesList, chatHistoryFromPrompt) {
    const chatHistoryEntities = entitiesList;
    const fullChatDataJSON = chatHistoryFromPrompt;
    const AIChatUserList = [];

    for (const entity of chatHistoryEntities) {
        for (const chat of fullChatDataJSON) {
            if (chat.username === entity.username) {
                const userColor = chat.userColor;
                const username = chat.username;
                const entityType = chat.entity;
                const uuid = chat.user_id;
                const role = chat.role;
                AIChatUserList.push({ username: username, color: userColor, entity: entityType, uuid: uuid, role: role });
                break; // Once a match is found, no need to continue the inner loop
            }
        }
    }
    logger.warn(`AIChatUserList result: ${JSON.stringify(AIChatUserList)}`);
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
        let [data, sessionID] = await db.readAIChat();
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
    //logger.info(`[setStopStrings] >> GO`)
    //logger.info(APICallParams)
    const instructData = await fio.readFile(liveConfig.promptConfig.selectedInstruct)
    const instructSequence = JSON.parse(instructData)
    const inputSequence = instructSequence.input_sequence
    const outputSequence = instructSequence.output_sequence
    const systemSequence = instructSequence.system_sequence
    const endSequence = instructSequence.end_sequence
    const extraStops = instructSequence?.extras_for_stops || [];

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

    targetObj.push(inputSequence, outputSequence, systemSequence, endSequence, ...extraStops)

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

    //remove any empty items in targetObj
    targetObj = targetObj.filter(item => item !== '');

    //logger.info(APICallParams)
    //logger.info(targetObj)
    //   logger.debug(liveAPI)
    //  logger.debug(liveConfig) 
    if (liveAPI.claude === (1 || true)) { //for claude
        //logger.info('setting Claude stop strings')
        APICallParams.stop_sequences = targetObj
    } else if (liveConfig.promptConfig.engineMode === 'TC' || liveConfig.promptConfig.engineMode === 'CC' && liveAPI.claude !== 1) { //for TC and OAI CC
        //logger.info('setting TC/OAI stop strings')
        APICallParams.stop = targetObj
    } else { //for horde
        logger.info('setting horde stop strings')
        APICallParams.params.stop_sequence = targetObj

    }
    //logger.info(APICallParams)
    //logger.info(APICallParams.params)
    //logger.info(targetObj)
    return [APICallParams, usernames]
}

//MARK: replaceMacros
function replaceMacros(string, username = null, charname = null) {
    //logger.debug(username, charname)
    var replacedString = string
    if (username !== null && charname !== null) {
        replacedString = replacedString.replace(/{{user}}/g, username);
        replacedString = replacedString.replace(/{{char}}/g, charname);
    }
    return replacedString
}

function collapseNewlines(x) {
    return x.replaceAll(/\n+/g, '\n');
}

function postProcessText(text) {
    // Collapse multiple newlines into one
    //text = collapseNewlines(text);
    // Trim leading and trailing whitespace, and remove empty lines
    //text = text.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    // Remove carriage returns
    text = text.replace(/\r/g, '');
    // Normalize unicode spaces
    text = text.replace(/\u00A0/g, ' ');
    // Collapse multiple spaces into one (except for newlines)
    text = text.replace(/ {2,}/g, ' ');
    // Remove leading and trailing spaces
    text = text.trim();
    return text;
}

//MARK: addCharDefsToPrompt
async function addCharDefsToPrompt(liveConfig, charFile, lastUserMesageAndCharName, username, liveAPI, shouldContinue) {
    //logger.debug(`[addCharDefsToPrompt] >> GO`)
    //logger.debug(liveAPI)
    let isClaude = liveAPI.claude
    let isCCSelected = liveAPI.type === 'CC' ? true : false
    let doD4CharDefs = liveConfig.promptConfig.D4CharDefs
    //logger.info(doD4CharDefs)


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
            let replacedString = postProcessText(replaceMacros(jsonString, username, charJSON.name))
            const replacedData = JSON.parse(replacedString);

            const descToAdd = replacedData.description.length > 0 ? `\n${replacedData.description.trim()}` : ''
            //const personalityToAdd = replacedData.personality.length > 0 ? `\n${replacedData.personality.trim()}` : ''
            //const scenarioToAdd = replacedData.scenario.length > 0 ? `\n${replacedData.scenario.trim()}` : ''

            //replace {{user}} and {{char}} for D1JB
            var D1JB = postProcessText(replaceMacros(liveConfig.promptConfig.D1JB, username, charJSON.name)) || ''
            var D4AN = postProcessText(replaceMacros(liveConfig.promptConfig.D4AN, username, charJSON.name)) || ''
            if (doD4CharDefs) {
                D4AN = `${descToAdd}\n${D4AN}`
            }
            var systemMessage = postProcessText(replaceMacros(liveConfig.promptConfig.systemPrompt, username, charJSON.name)) || `You are ${charName}. Write ${charName}'s next response to interact with ${username}.`
            const instructData = await fio.readFile(liveConfig.promptConfig.selectedInstruct)
            const instructSequence = JSON.parse(instructData)
            const inputSequence = replaceMacros(instructSequence.input_sequence, username, charJSON.name)
            const outputSequence = replaceMacros(instructSequence.output_sequence, username, charJSON.name)
            const systemSequence = replaceMacros(instructSequence.system_sequence, username, charJSON.name)
            const endSequence = replaceMacros(instructSequence.end_sequence, username, charJSON.name)

            if (!doD4CharDefs) {
                var systemPrompt = `${systemSequence}${systemMessage}${descToAdd}`
                var systemPromptforCC = `${systemMessage}${descToAdd}`
            } else {
                var systemPrompt = `${systemSequence}${systemMessage}`
                var systemPromptforCC = `${systemMessage}`
            }

            //logger.info("CC?", isCCSelected, "claude?", isClaude)
            if (liveConfig.promptConfig.engineMode === 'horde' || !isCCSelected) { //craft the TC prompt
                logger.trace('adding Text Completion style message objects into prompt')
                //this will be what we return to TC as the prompt
                var stringToReturn = systemPrompt

                //add the chat history
                stringToReturn = stringToReturn.trim()

                let promptTokens = countTokens(stringToReturn)
                //logger.trace(`before adding ChatHistory, Prompt is: ~${promptTokens}`)
                let insertedItems = []
                let lastInsertedEntity

                for (let i = chatHistory.length - 1; i >= 0; i--) {
                    let obj = chatHistory[i];
                    let newItem
                    if (obj.username === charName) {
                        if (isClaude) {
                            newItem = `${endSequence}${outputSequence}Assistant: ${postProcessText(obj.content)}`;
                        } else {
                            newItem = `${endSequence}${outputSequence}${obj.username}: ${postProcessText(obj.content)}`;
                        }
                    } else {
                        if (isClaude) {
                            newItem = `${endSequence}${inputSequence}Human: ${postProcessText(obj.content)}`;
                        } else {
                            newItem = `${endSequence}${inputSequence}${obj.username}: ${postProcessText(obj.content)}`;
                        }
                    }

                    let newItemTokens = countTokens(newItem);
                    if (promptTokens + newItemTokens < liveConfig.promptConfig.contextSize) {
                        promptTokens += newItemTokens;
                        ChatObjsInPrompt.push(obj)
                        //logger.trace(`added new item, prompt tokens: ~${promptTokens}`);
                        insertedItems.push(newItem); // Add new item to the array
                    }
                    //logger.warn(obj.username, obj.user, obj.content)
                    lastInsertedEntity = obj.username === charName ? 'Assistant' : 'Human'; // Store the last entity type
                }
                //reverse to prepare for D4AN insertion
                insertedItems.reverse()
                let numOfObjects = insertedItems.length
                let positionForD4AN = numOfObjects - 4
                let positionForD1JB = numOfObjects - 1
                //logger.warn(`D4AN will be inserted at position ${positionForD4AN} of ${numOfObjects}`)
                D4AN = D4AN.trim()
                if (D4AN.length !== 0 && D4AN !== '' && D4AN !== undefined && D4AN !== null) {
                    if (insertedItems.length < 5) {
                        //logger.warn('adding D4AN at top of prompt because it is small')
                        insertedItems.splice(0, 0, `${endSequence}${systemSequence}${D4AN}`)
                    } else {
                        //logger.warn('adding D4AN at depth', positionForD4AN)
                        insertedItems.splice(positionForD4AN, 0, `${endSequence}${systemSequence}${D4AN}`)
                        numOfObjects = insertedItems.length
                        positionForD1JB = numOfObjects - 1
                    }
                }
                D1JB = D1JB.trim()
                if (D1JB.length !== 0 && D1JB !== '' && D1JB !== undefined && D1JB !== null) {
                    if (insertedItems.length < 2) {
                        //logger.warn('adding D1JB at top of prompt because it is small')
                        insertedItems.splice(1, 0, `${endSequence}${systemSequence}${D1JB}`)
                    } else {
                        //logger.warn('adding D1JB at depth', positionForD1JB)
                        insertedItems.splice(positionForD1JB, 0, `${endSequence}${systemSequence}${D1JB}`)
                    }
                }
                // Reverse the array before appending to insertedChatHistory
                //let reversedItems = insertedItems.reverse();
                //let insertedChatHistory = reversedItems.join('');
                let insertedChatHistory = insertedItems.join('');
                stringToReturn += insertedChatHistory

                //logger.warn('lastInsertedEntity:', lastInsertedEntity, 'shouldContinue:', shouldContinue)

                if (shouldContinue === true && lastInsertedEntity === 'Assistant') {
                    //logger.info('not adding end sequence because this is a continue for an AI msg')
                } else {
                    // logger.info('adding end sequence')
                    stringToReturn += `${endSequence}`
                }

                //add the final mes and userInput        
                if (shouldContinue === true && lastInsertedEntity === 'Assistant') { //no need to add last user msg and char name if we are continuing
                    //logger.info('this is a continue for an AI msg, not adding last user Msg and charname')
                    stringToReturn = postProcessText(stringToReturn)
                } else {
                    //logger.info('adding last user Msg and leading charname as usual')
                    stringToReturn += `${outputSequence}`
                    if (isClaude) {
                        stringToReturn += `Assistant:` //toggle for claude    
                    } else {
                        stringToReturn += lastUserMesageAndCharName.trim();
                    }
                }

                stringToReturn = postProcessText(stringToReturn)
                resolve([stringToReturn, ChatObjsInPrompt]);
            } else { //craft the CC prompt
                // logger.info('adding Chat Completion style message objects into prompt')
                var CCMessageObj = []

                var D4ANObj, D1JBObj, systemPromptObject, promptTokens = 0

                if (!isClaude) { // OAI can get a system role message, but Claude can't. It goes to a top-level param.
                    systemPromptObject = { role: 'system', content: systemPromptforCC }
                    D1JBObj = { role: 'system', content: D1JB }
                    D4ANObj = { role: 'system', content: D4AN }
                    promptTokens = countTokens(systemPromptObject['content'])
                } else {
                    D1JBObj = { role: 'user', content: D1JB }
                    D4ANObj = { role: 'user', content: D4AN }
                }

                // logger.info(`before adding ChatHistory, Prompt is: ~${promptTokens}`)

                let D4Added = false,
                    D1Added = false
                let shouldAddD4 = false
                let shouldAddD1 = false
                let D4Loc, D1Loc
                if (isClaude) {
                    D4Loc = 3
                    D1Loc = 1
                } else {
                    D4Loc = 4
                    D1Loc = 2
                }

                for (let i = chatHistory.length - 1; i >= 0; i--) {
                    let obj = chatHistory[i];

                    if (chatHistory.length < 4) { //if chat history is only one turn, add D4 and D1 into first user obj
                        if (obj.entity === 'user' && D4ANObj.content.length > 0 && D4Added === false) {
                            obj.content = `${D4ANObj.content} \n` + obj.content
                            D4Added = true
                        }
                        if (obj.entity === 'user' && D1JBObj.content.length > 0 && D1Added === false) {
                            obj.content = `${D1JBObj.content}\n` + obj.content
                            D1Added = true
                        }
                    }

                    let newItem, newObj, newItemTokens

                    if (i === chatHistory.length - D4Loc && D4ANObj.content.length > 0 && D4Added === false) {
                        //logger.warn('saw D4 incoming')
                        shouldAddD4 = true
                        if (!isClaude) {
                            //logger.warn('adding D4')
                            CCMessageObj.push(D4ANObj)
                            D4Added = true
                            shouldAddD4 = false
                            let D4Tokens = countTokens(D4ANObj?.content);
                            promptTokens = + D4Tokens
                        }
                    }
                    if (i === chatHistory.length - D1Loc && D1JBObj.content.length > 0 && D1Added === false) {
                        // logger.warn('saw D1 incoming')
                        shouldAddD1 = true
                        if (!isClaude) {
                            // logger.warn('adding D1')
                            CCMessageObj.push(D1JBObj)
                            D1Added = true
                            shouldAddD1 = false
                            let D1Tokens = countTokens(D1JBObj?.content);
                            promptTokens = + D1Tokens
                        }
                    }

                    if (obj.username === charName) {
                        newObj = {
                            role: 'assistant',
                            content: postProcessText(obj.content)
                        }
                        newItemTokens = countTokens(newObj?.content);
                    } else { //for user objects

                        if (!isClaude) { //for OAI
                            newObj = {
                                role: 'user',
                                content: postProcessText(obj.content)
                            }
                            newItemTokens = countTokens(newObj?.content);
                        } else { //for Claude

                            if (shouldAddD4 === true) {
                                logger.info('added d4')
                                obj.content = D4ANObj.content + `\n` + obj.content
                                D4Added = true
                                shouldAddD4 = false
                            }
                            if (shouldAddD1 === true) {
                                logger.info('added d1')
                                obj.content = D1JBObj.content + `\n` + obj.content
                                D1Added = true
                                shouldAddD1 = false
                            }
                            if (chatHistory[i - 1].role === obj.entity) { // if prev and current are both 'user'
                                chatHistory[i - 1].content = chatHistory[i - 1].content + `\n` + obj.content //just combine the content
                            }
                            else {
                                newObj = {
                                    role: 'user',
                                    content: postProcessText(obj.content)
                                }
                                newItemTokens = countTokens(newObj?.content);
                            }
                        }
                    }

                    if (promptTokens + newItemTokens < liveConfig.promptConfig.contextSize) {
                        promptTokens += newItemTokens;
                        CCMessageObj.push(newObj)
                        ChatObjsInPrompt.push(obj)
                        // logger.info(`added new item, prompt tokens: ~${promptTokens}`);
                    } else {
                        logger.debug('ran out of context space', promptTokens, newItemTokens, liveConfig.promptConfig.contextSize)
                    }
                }
                if (!isClaude) {
                    //CCMessageObj.push({ role: 'system', content: '[Start a New Chat]' })
                    if (systemPromptObject.content.length > 0) {
                        CCMessageObj.push(systemPromptObject)
                    }
                } else {
                    CCMessageObj.push({ role: 'user', content: '[Start a New Chat]' })
                }
                CCMessageObj = CCMessageObj.reverse();
                resolve([CCMessageObj, ChatObjsInPrompt]);
            }



        } catch (error) {
            logger.error('Error reading file:', error);
            reject(error)
        }
    })
}

//MARK: getHordeModelList
async function getHordeModelList(hordekey) {
    logger.info('Getting Horde model list...');
    //const url = 'https://horde.koboldai.net/api/v2/workers?type=text';
    const url = 'https://aihorde.net/api/v2/status/models?type=text&model_state=all';

    var headers = {
        'Content-Type': 'application/json',
        'Cache': 'no-cache',
        'apikey': hordekey,
        "Client-Agent": "STMP:1.0.2:RossAscends"
    };

    const response = await fetch(url, {
        method: 'GET',
        headers: headers
    })

    const data = await response.json()

    const options = data
        .filter(item => {
            const { eta, count } = item;
            return eta <= 60;
        })
        .map(item => {
            const { name, count, eta, queued, performance } = item
            const modelName = name.split('/').pop(); // Extract the value after the final forward slash
            //const { models, uncompleted_jobs, max_length, max_context_length } = item;
            //const modelName = models[0].split('/').pop(); // Extract the value after the final forward slash
            //const short_ctx_string = max_context_length < 1000 ? max_context_length : Math.floor(max_context_length / 1000) + "k"
            //const short_resp_string = max_length < 1000 ? max_length : Math.floor(max_length / 1000) + "k"

            return {
                //name: `${modelName} (Q:${uncompleted_jobs}, ${short_resp_string}/${short_ctx_string})`,
                //value: models[0]
                name: `${modelName} (🧑‍🤝‍🧑:${queued}, ⏳:${eta}, ${performance}tps, 🤖:${count})`,
                value: name

            }
        });

    options.sort((a, b) => {
        const etaA = parseInt(a.name.split('E:')[1]);
        const etaB = parseInt(b.name.split('E:')[1]);
        return etaA - etaB
    })

    /*     options.sort((a, b) => {
            const uncompletedJobsA = parseInt(a.name.split('(Q:')[1]);
            const uncompletedJobsB = parseInt(b.name.split('(Q:')[1]);
            return uncompletedJobsA - uncompletedJobsB;
        }); */

    logger.info(options)
    return options
}

//MARK: requestToHorde
async function requestToHorde(hordeKey, stringToSend) {
    logger.info('Sending Horde request...');
    const url = 'https://aihorde.net/api/v2/generate/text/async';

    var headers = {
        'Content-Type': 'application/json',
        'Cache': 'no-cache',
        'apikey': hordeKey,
        "Client-Agent": "STMP:1.0.2:RossAscends"
    };

    hordeKey = hordeKey || '0000000000';
    var body = JSON.stringify(stringToSend);
    logger.debug(`--- horde payload:`)
    logger.info(headers)
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
            return ['Horde Error: No taskID', null, null, null]
        }

        logger.info(`horde task ID ${task_id}`)

        for (var retryNumber = 0; retryNumber < MAX_RETRIES; retryNumber++) {

            var horde_status_url = "https://aihorde.net/api/v2/generate/text/status/" + task_id;
            var status_headers = {
                "Client-Agent": 'SillyTavern:UNKNOWN:Cohee#1207',
            };

            await new Promise(function (resolve) {
                setTimeout(resolve, CHECK_INTERVAL);
            });

            var statusResponse = await (await fetch(horde_status_url, status_headers)).json()
            if (statusResponse.is_possible === false) {
                logger.warn('Horde said this was request impossible, check context and response size.')
                return ['[Horde Error: Request deemed not possible. Check context and response sizes.]', null, null, null]
            }
            logger.info('Horde status check ' + (retryNumber + 1) + ':');
            logger.info(statusResponse)
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
        logger.error('Error while requesting Horde');
        logger.error(response)
        return response
    };
}

async function testAPI(api, liveConfig) {
    logger.debug(`[testAPI] >> GO`)
    logger.info('Test Message API Info:')
    logger.info(api)
    let testMessage = 'User: Ping? (if you can see me say "Pong!\n\nAssistant:")'
    let payload = {
        prompt: '',
        stream: false, //no point to stream test messages
        seed: undefined,
        stop: ['.'],
        stop_sequence: ['.'],
        stop_sequences: ['.'],
        max_tokens_to_sample: 50,
        max_tokens: 50,
        max_length: 50
    }

    let testMessageObject = [{ role: 'user', content: 'Ping? (if you can see me say "Pong!")' }]

    if (api.type === 'CC' && !api.claude) {
        payload.model = api.model
        payload.messages = testMessageObject
        delete payload.prompt
    }

    if (api.type === 'TC') {
        payload.prompt = testMessage
    }

    if (api.claude) {
        payload.model = api.model
        let tempPrompt = payload.prompt
    }

    let result = await requestToTCorCC(false, api, payload, testMessage, true, liveConfig)
    return result

}

async function getModelList(api, liveConfig = null) {
    if (liveConfig.promptConfig.engineMode === 'horde') {
        logger.info('aborting model list request because horde is active')
        return
    }
    let isClaude = api.isClaude
    let modelsEndpoint = api.endpoint

    if (!/^https?:\/\//i.test(modelsEndpoint)) {
        if (modelsEndpoint.includes("localhost") || modelsEndpoint.includes("127.0.0.1")) {
            // Add "http://" at the beginning
            modelsEndpoint = "http://" + modelsEndpoint;
        } else {
            // Add "https://" at the beginning
            modelsEndpoint = "https://" + modelsEndpoint;
        }
    }

    // Check if baseURL ends with "/"
    if (!/\/$/.test(modelsEndpoint)) {
        // Add "/" at the end
        modelsEndpoint += "/";
    }



    modelsEndpoint = modelsEndpoint + 'models'
    let key = 'Bearer ' + api.key

    let headers = {
        'Content-Type': 'application/json',
        'x-api-key': api.key,
        Authorization: key
    }

    if (isClaude) {
        headers['anthropic-version'] = '2023-06-01';
    }
    let args = {
        method: 'GET',
        headers: headers
    }
    logger.info(`Fetching model list from: ${modelsEndpoint}`)
    logger.debug(modelsEndpoint)
    logger.debug(args)

    const response = await fetch(modelsEndpoint, args);

    if (response.status === 200) {
        let responseJSON = await response.json();
        let modelNames = responseJSON.data.map(item => item.id);
        logger.info('Available models:');
        logger.info(modelNames);
        return modelNames
        //return responseJSON.data;
    } else {
        logger.error(`Error getting models. Code ${response.status}`)
    }
}

async function tryLoadModel(api, liveConfig, liveAPI) {
    logger.info(`[tryLoadModel] >> GO`)

    let isClaude = api.isClaude
    let modelLoadEndpoint = api.endpoint
    let selectedModel = liveConfig.APIConfig.selectedModel

    if (!/^https?:\/\//i.test(modelLoadEndpoint)) {
        if (modelLoadEndpoint.includes("localhost") || modelLoadEndpoint.includes("127.0.0.1")) {
            // Add "http://" at the beginning
            modelLoadEndpoint = "http://" + modelLoadEndpoint;
        } else {
            // Add "https://" at the beginning
            modelLoadEndpoint = "https://" + modelLoadEndpoint;
        }
    }

    // Check if baseURL ends with "/"
    if (!/\/$/.test(modelLoadEndpoint)) {
        // Add "/" at the end
        modelLoadEndpoint += "/";
    }

    modelLoadEndpoint = modelLoadEndpoint + 'model/load'
    let key = 'Bearer ' + api.key

    let headers = {
        'Content-Type': 'application/json',
        'x-api-key': api.key,
        Authorization: key
    }

    let body = JSON.stringify(
        {
            model_name: selectedModel,
            num_gpu_layers: 999,
            max_seq_len: Number(api.ctxSize),
            cache_size: Number(api.ctxSize),
            flash_attention: true,
            cache_mode_k: 'Q8_0',
            cache_mode_v: 'Q8_0',
        })

    if (isClaude) {
        headers['anthropic-version'] = '2023-06-01';
    }
    let args = {
        method: 'POST',
        headers: headers,
        body: body
    }
    logger.info(`Trying to tell the API to load model at: ${modelLoadEndpoint}`)
    //logger.debug(modelLoadEndpoint)
    logger.info(args)

    const response = await fetch(modelLoadEndpoint, args);

    if (response.status === 200) {
        //let responseJSON = await response.json();
        //let modelNames = responseJSON.data.map(item => item.id);
        logger.info('Model Load response: ', response.status);
        //logger.info(modelNames);
        return response.status
        //return responseJSON.data;
    } else {
        logger.error(`Error getting models. Code ${response.status}`)
    }

    return response
}

//MARK: requestToTCorCC
async function requestToTCorCC(isStreaming, liveAPI, finalApiCallParams, includedChatObjects, isTest, liveConfig, parsedMessage, charName) {
    logger.info('[requestToTCorCC] >> GO')
    //logger.info('finalApiCallParams: ', finalApiCallParams)
    const TCEndpoint = liveAPI.endpoint
    const TCAPIKey = liveAPI.key
    const key = TCAPIKey.trim()

    const isCCSelected = liveAPI.type === 'CC' ? true : false
    let isOpenRouter = TCEndpoint.includes('openrouter') ? true : false
    let isOpenAI = TCEndpoint.includes('openai') ? true : false
    let isClaude = liveAPI.claude
    let selectedModel = liveAPI.selectedModel

    //this is brought in from the sampler preset, but we don't use it yet.
    //better to not show it in the API gen call response, would be confusing.
    delete finalApiCallParams.system_prompt

    let baseURL = TCEndpoint.trim()

    // Check if baseURL contains "localhost" or "127.0.0.1"
    if (!/^https?:\/\//i.test(baseURL)) {
        if (baseURL.includes("localhost") || baseURL.includes("127.0.0.1")) {
            // Add "http://" at the beginning
            baseURL = "http://" + baseURL;
        } else {
            // Add "https://" at the beginning
            baseURL = "https://" + baseURL;
        }
    }

    // Check if baseURL ends with "/"
    if (!/\/$/.test(baseURL)) {
        // Add "/" at the end
        baseURL += "/";
    }


    let chatURL
    var headers = {
        'Content-Type': 'application/json',
        Cache: 'no-cache',
        'x-api-key': key,
        Authorization: `Bearer ${key}`,
    };

    if (isCCSelected && !isClaude) { //for OAI CC
        chatURL = baseURL + 'chat/completions'
        delete finalApiCallParams.prompt
    } else if (!isCCSelected) { //for TC (Tabby, KCPP, and OR?)
        chatURL = baseURL + 'completions'
        delete finalApiCallParams.messages
    }

    if (isClaude) {
        chatURL = baseURL + 'messages'
        headers['anthropic-version'] = '2023-06-01';
        //finalApiCallParams.max_tokens_to_sample = finalApiCallParams.max_tokens
        //delete finalApiCallParams.max_tokens
        if (finalApiCallParams.temperature > 1) { finalApiCallParams.temperature = 1 }
        if (liveConfig.promptConfig.systemPrompt.length > 0) {
            finalApiCallParams.system = postProcessText(replaceMacros(liveConfig.promptConfig.systemPrompt, parsedMessage.username, charName))
        }
    }

    if (isOpenRouter) {

        headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': 'http://127.0.0.1:8181/'
        }
        finalApiCallParams.transforms = ['middle-out']
        finalApiCallParams.route = 'fallback'
    }

    if (isOpenAI) {
        logger.warn('we are using an OpenAI API, so stop will be trimmed to 4')
        finalApiCallParams.stop = finalApiCallParams.stop.slice(0, 4);
    }

    try {

        finalApiCallParams.model = selectedModel
        //logger.warn('setting finalApiCallParams.stream to isStreaming:', isStreaming)
        //logger.warn(finalApiCallParams.model)
        finalApiCallParams.stream = isStreaming

        //logger.debug('HEADERS')
        //logger.info(headers)
        logger.info('PAYLOAD')
        logger.info(finalApiCallParams)

        const body = JSON.stringify(finalApiCallParams);
        //logger.info(body)

        let streamingReportText = finalApiCallParams.stream ? 'streamed' : 'non-streamed'
        //let modelReportText = finalApiCallParams.model ? `model ${finalApiCallParams.model}` : 'no model specified'
        // logger.info('finalApiCallParams.stream (inside requestToTCorCC): ' + finalApiCallParams.stream);
        logger.info(`Sending ${streamingReportText} ${liveAPI.type} API request to ${chatURL}..`);
        //logger.debug(`API KEY: ${key}`)

        let args = {
            method: 'POST',
            headers: headers,
            body: body,
            timeout: 0,
        }

        //logger.info(args)
        const response = await fetch(chatURL, args)
        //logger.info('FULL RESPONSE')
        //logger.info('=====================')
        //logger.info(util.inspect(response, { depth: null }));
        //logger.info('=====================')

        if (response.status === 200) {
            logger.info('Status 200: Ok.')
            return await processResponse(response, isCCSelected, isTest, isStreaming, liveAPI)
        } else {
            let responseStatus = response.status
            logger.error('API error: ' + responseStatus)

            let parsedResponse, unparsedResponse
            try {
                parsedResponse = await response.json()
                logger.warn(parsedResponse); //for debugging
                return (parsedResponse)
            }
            catch {
                logger.warn('could not parse response, returning it as-is')
                unparsedResponse = response
            }
            let errorResponse = {
                status: response.status,
                statusText: response.statusText

            }
            //these are error message attributes from Tabby
            //logger.debug(JSONResponse.detail[0].loc) //shows the location of the error causing thing
            //logger.debug(JSONResponse.detail[0].input) //just shows the value of messages object
            return errorResponse
        }

    } catch (error) {
        logger.error('Error while requesting Text Completion API');
        const line = error.stack.split('\n').pop().split(':').pop();
        logger.error(line);
        logger.error(error);
        return error
    }
}

//MARK: processResponse
async function processResponse(response, isCCSelected, isTest, isStreaming, liveAPI) {
    logger.info('Processing response..')
    let isClaude = liveAPI.claude

    if (!isStreaming) {
        try {
            let JSONResponse = await response.json();
            logger.debug('Response JSON:', JSONResponse);
            return processNonStreamedResponse(JSONResponse, isCCSelected, isTest, isClaude);
        }
        catch (error) {
            logger.error('Error parsing JSON:', error);
        }
    } else {
        if (response.body) {
            let chunk = await stream.processStreamedResponse(response, isCCSelected, isTest, isClaude);
            //logger.info('chunk: ', chunk)
            if (chunk) {
                return chunk
            }
        }

    }

    async function processNonStreamedResponse(JSONResponse, isCCSelected, isTest, isClaude) {

        let text
        let apistatus = 200 //if we got here it's 200.
        //logger.info('--- API RESPONSE')
        //logger.info(JSONResponse) 
        //logger.info(`isCCSelected? ${isCCSelected}`)
        //logger.info(`isTest? ${isTest}`)
        if (isCCSelected) {
            if (isClaude) {
                text = JSONResponse.completion;
            }
            else if (JSONResponse.choices && JSONResponse.choices.length > 0) {
                text = JSONResponse.choices[0].message?.content
            }
            else {
                logger.info(JSONResponse)
                return "Unknown API type. Couldn't find response. Check console log."
            }
        } else { // text completions have data in 'choices'
            text = JSONResponse.choices[0].text
        }
        //this assumes we got a response from the server that was not 200
        if (isTest) {
            let testResults = {
                status: apistatus,
                value: text
            }
            return testResults
        }
        return text
    }

}

export default {
    getAIResponse,
    getAPIDefaults,
    replaceMacros,
    testAPI,
    getModelList,
    processResponse,
    addCharDefsToPrompt,
    setStopStrings,
    trimIncompleteSentences,
    getHordeModelList,
    tryLoadModel
}

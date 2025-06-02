import { logger } from './log.js';
import api from './api-calls.js';
import { broadcast, purifier } from '../server.js';
import db from './db.js';
import { StringDecoder } from 'string_decoder';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import iconv from 'iconv-lite';
import purify from './purify.js';

const textEmitter = new EventEmitter();

var isStreaming = true
let accumulatedStreamOutput = ''

const createTextListener = async (parsedMessage, liveConfig, AIChatUserList, user, sessionID, messageID, shouldContinue) => {
    //logger.warn('createTextListener activated');
    let currentlyStreaming
    //logger.warn(parsedMessage)
    let contentBeforeContinue

    if (shouldContinue) {
        contentBeforeContinue = await db.getMessage(messageID - 1, sessionID);
    }

    const endResponse = async () => {

        //logger.error('AIChatUserList in text Listener EndResponse')
        //logger.error(AIChatUserList)
        currentlyStreaming = false
        if (shouldContinue) {
            //logger.warn('shouldContinue is true, so we will append the content before continue to the accumulated output')
            accumulatedStreamOutput = contentBeforeContinue + accumulatedStreamOutput;
        }
        //if (!responseEnded) {
        //    responseEnded = true;
        textEmitter.removeAllListeners('text');
        const streamEndToken = {
            chatID: parsedMessage.chatID,
            AIChatUserList: AIChatUserList,
            userColor: parsedMessage.userColor || parsedMessage.color || 'white',
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            //send the final markdown version at the end, replacing 
            rawResponse: accumulatedStreamOutput,
            consoleSeperator: '------------------', //this only exists to make the output easier to read
            content: purifier.makeHtml(await api.trimIncompleteSentences(accumulatedStreamOutput)),
            type: 'streamedAIResponseEnd',
        };
        //logger.warn('sending stream end')
        broadcast(streamEndToken); // Emit the event to clients
        //}
    };

    return async (text) => {

        //add the newest token to the accumulated variable for later chat saving. 
        //logger.log(text);
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
        //logger.warn(accumulatedStreamOutput)
        // logger.warn(purify.partialMarkdownToHTML(purifier.makeHtml((accumulatedStreamOutput))))

        const streamedTokenMessage = {
            chatID: parsedMessage.chatID,
            content: purify.partialMarkdownToHTML(purifier.makeHtml((accumulatedStreamOutput))),
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            type: 'streamedAIResponse',
            isContinue: shouldContinue,
            color: user?.color || 'red', //if red, then we have a problem somewhere. AI dont have colors atm, defaulting to white in frontend.
            sessionID: sessionID,
            messageID: messageID,
        };
        await broadcast(streamedTokenMessage);
        currentlyStreaming = true;
    };
};

async function handleResponse(parsedMessage, selectedAPI, hordeKey, engineMode, user, liveConfig, shouldContinue, sessionID = null) {
    // logger.warn('handleResponse liveConfig.promptConfig.stream:', liveConfig.promptConfig.isStreaming)
    isStreaming = liveConfig.promptConfig.isStreaming;
    isStreaming = engineMode === 'horde' ? false : isStreaming;
    let activeSessionID;
    if (sessionID) activeSessionID = sessionID;

    //logger.warn('handle response sees sessionID: ', activeSessionID)
    // logger.warn(`isStreaming: ${isStreaming}, engineMode: ${engineMode}, selectedAPI: ${selectedAPI}`);

    if (isStreaming) {
        const [activeChatJSON, foundSessionID] = await db.readAIChat(sessionID);
        //const activeChat = JSON.parse(activeChatJSON);
        const newMessageID = await db.getNextMessageID();

        //this is a dry run to get the AIChatUserList, so we can create the listener EARLY.
        const AIChatUserList = await api.getAIResponse(
            isStreaming, hordeKey, engineMode, user, liveConfig, liveConfig.APIConfig, true, parsedMessage, false
        );
        // Create listener EARLY
        const textListener = await createTextListener(parsedMessage, liveConfig, AIChatUserList, user, foundSessionID, newMessageID, shouldContinue);

        textEmitter.removeAllListeners('text'); // Prevent multiple listeners
        textEmitter.on('text', textListener); // 🔁 NOW the emitter is hooked

        //this is the actual call to the API, which will start streaming.
        const [AIResponse, uselessAIChatUserList] = await api.getAIResponse(
            isStreaming, hordeKey, engineMode, user, liveConfig, liveConfig.APIConfig, false, parsedMessage, shouldContinue
        );

        if (!AIResponse || !AIResponse[0]) {
            // logger.warn('[handleResponse] null or empty response received for streaming.');

            textListener('END_OF_RESPONSE');
            const trimmed = await api.trimIncompleteSentences(accumulatedStreamOutput);
            if (shouldContinue) {
                await db.editMessage(sessionID, newMessageID - 1, trimmed)
            } else {
                await db.writeAIChatMessage(liveConfig.promptConfig.selectedCharacterDisplayName, 'AI', trimmed, 'AI');
            }

            accumulatedStreamOutput = '';
        } else {
            logger.info('streaming started successfully.');
        }

    } else {
        const [AIResponse, AIChatUserList] = await api.getAIResponse(
            isStreaming, hordeKey, engineMode, user, liveConfig, liveConfig.APIConfig, false, parsedMessage
        );

        //const [AIResponse, AIChatUserList] = response;

        //logger.warn('not streaming, AIChatUserList:', AIChatUserList);

        const AIResponseMessage = {
            chatID: parsedMessage.chatID,
            content: AIResponse,
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            type: 'AIResponse',
            color: user?.color || 'red',
            AIChatUserList
        };

        const trimmed = await api.trimIncompleteSentences(AIResponse);
        await db.writeAIChatMessage(
            liveConfig.promptConfig.selectedCharacterDisplayName, 'AI', trimmed, 'AI'
        );
        await broadcast(AIResponseMessage);
    }
}


async function processStreamedResponse(response, isCCSelected, isTest, isClaude) {
    let stream = response.body;
    let data = '';
    let text;

    // Initialize StringDecoder
    const decoder = new StringDecoder('utf8');

    if (typeof stream.on !== 'function') {
        // Create a new readable stream from response.body
        stream = Readable.from(response.body);
    } else {
        logger.error('Saw function in response body. Not a Readable stream...')
        logger.info(stream)
    }

    stream.on('data', async (chunk) => {
        // Use StringDecoder to handle UTF-8 text properly
        const dataChunk = decoder.write(chunk);
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
                logger.debug('[DONE] seen before "data:" removal. End of stream. Closing the stream.');
                stream.destroy();
                break;
            }

            // Remove the "data: " prefix
            const trimmedJsonChunk = jsonChunk.trim().replace(/^data:\s+/, '');
            //logger.debug('trimmedJsonChunk:')
            //logger.info(trimmedJsonChunk)
            // Parse and process the JSON object

            // Check if it's the final object (again)
            if (trimmedJsonChunk === '[DONE]') {
                logger.debug('[DONE] seen after "data:" removal. End of stream. Closing the stream.');
                stream.destroy();
                break;
            }

            let jsonData = null;
            try {
                jsonData = JSON.parse(trimmedJsonChunk);
            } catch (error) {
                logger.error('Error parsing JSON:', error);
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
                //logger.info(text) //this will log each decoded token to the console

                //return text
            } else {
                if (isClaude) {
                    if (jsonData.type === 'message_stop') {
                        stream.destroy();
                        break;
                    } else if (jsonData.type === 'content_block_start' ||
                        jsonData.type === 'message_start' ||
                        jsonData.type === 'content_block_stop' ||
                        jsonData?.delta?.stop_reason
                    ) {
                        //do nothing
                    } else if (jsonData?.delta?.text) {
                        text = jsonData.delta.text;
                    } else {
                        logger.warn('Did not see Completion object, saw this:')
                        logger.warn(jsonData)
                    }
                } else {
                    logger.warn('Did not see "choices" object, saw this:')
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
    return await readStreamChunks(stream);

}

function isNonUTF8Token(token) {
    const utf8Buffer = iconv.encode(token, 'utf8');
    const encodedBuffer = iconv.encode(token, 'binary');
    return !utf8Buffer.equals(encodedBuffer);
}


async function readStreamChunks(readableStream) {
    logger.warn('[readStreamChunks] >> GO')
    //logger.info(readableStream)
    return new Promise((resolve, reject) => {
        if (!(readableStream instanceof Readable)) {
            reject(new Error('Stream was not Readable'));
            logger.error(readableStream)
            return;
        }

        const chunks = [];
        readableStream.on('data', (chunk) => {
            const data = chunk.toString('utf-8');
            chunks.push(data);
            //logger.info(data)  //this is a huge block of un-decoded UTF-8, useless to log; just numbers.
            return chunks
        });

        readableStream.on('end', () => {
            logger.info('Stream ended.');
            const data = chunks.join('');
            //logger.info('Data:', data);
            resolve({ data, streamEnded: true }); // Resolve with data and streamEnded flag
        });

        readableStream.on('error', (error) => {
            logger.error('Error while reading the stream:', error);
            reject(error);
        });
    });
}

export default {
    handleResponse, createTextListener, readStreamChunks, processStreamedResponse
}

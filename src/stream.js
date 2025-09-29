import { logger } from './log.js';
import api from './api-calls.js';
import { broadcast, purifier } from '../server.js';
import db from './db.js';
import { StringDecoder } from 'string_decoder';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import iconv from 'iconv-lite';
import purify from './purify.js';

// Emits incremental text tokens for streaming responses
const textEmitter = new EventEmitter();
// Emits 'responseComplete' when an AI response (streamed or non-streamed) has fully finished
export const responseLifecycleEmitter = new EventEmitter();

var isStreaming = true
let accumulatedStreamOutput = ''

// Heuristic fixer: if final text ends with unmatched quotes or markdown
// delimiters, append the closing counterpart(s) at the end. This runs on the
// final response only; we don't attempt full parsing—just minimal balancing.
function autoMendMarkdown(text) {
    if (typeof text !== 'string') return text;
    let out = text;

    // Helper counters
    const countMatches = (re) => ((out.match(re)) || []).length;

    // 1) Double quotes: if odd number of \" present, append closing \"
    const dqCount = countMatches(/"/g);
    if (dqCount % 2 === 1) out += '"';

    // 2) Fenced code blocks (triple backticks): if odd number of fences, append a closing fence
    //    We treat any line-start ``` (optionally indented) as a fence. Language labels are allowed on opening.
    //    Appending on a new line preserves fence semantics.
    const fenceRegex = /(^|\n)[ \t]*```/g;
    const fenceCount = countMatches(fenceRegex);
    if (fenceCount % 2 === 1) {
        if (!out.endsWith('\n')) out += '\n';
        out += '```';
    }

    // 3) Inline code: single backticks. If odd number outside fenced blocks, append one more
    //    Remove balanced fenced sections first; if an opening fence remains unmatched, also remove from that fence to end
    let tmp = out;
    // Remove balanced ```...``` sections lazily
    //tmp = tmp.replace(/```[\s\S]*?```/g, '');
    // If any opening fence without a closing remains, remove from that fence to end so we don't count backticks within
    //tmp = tmp.replace(/```[\s\S]*$/, '');
    const singleBacktickCount = ((tmp.match(/(?<!`)`(?!`)/g)) || []).length;
    if (singleBacktickCount % 2 === 1) out += '`';

    // 4) Bold: ** delimiter pairs
    const boldPairCount = countMatches(/\*\*/g);
    if (boldPairCount % 2 === 1) out += '**';

    // 5) Strikethrough: ~~ delimiter pairs
    const strikePairCount = countMatches(/~~/g);
    if (strikePairCount % 2 === 1) out += '~~';

    // 6) Italic: single * (exclude ** and list bullets "* ")
    // Only mend if there are unmatched OPENING italic markers ("*word" or "word*" logic favors closing when possible)
    const s = out;
    let openItalics = 0, closeItalics = 0;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch !== '*') continue;
        // Skip bold ** sequences
        if (i + 1 < s.length && s[i + 1] === '*') { i++; continue; }
        // Skip list bullets: start of line (or after newline) followed by space
        const atLineStart = (i === 0) || s[i - 1] === '\n';
        const nextChar = s[i + 1];
        if (atLineStart && (nextChar === ' ' || nextChar === '\t')) continue;
        // Determine adjacency
        const prevChar = i > 0 ? s[i - 1] : '';
        const prevNonWS = prevChar && !/\s/.test(prevChar);
        const nextNonWS = nextChar && !/\s/.test(nextChar);
        if (!prevNonWS && !nextNonWS) continue; // ignore decorative or isolated *
        // Prefer closing when there is an open unmatched run and closing is plausible
        if (openItalics > closeItalics && prevNonWS) {
            closeItalics++;
        } else if (nextNonWS) {
            openItalics++;
        }
    }
    const unmatchedOpens = Math.max(0, openItalics - closeItalics);
    if (unmatchedOpens > 0) out += '*'.repeat(unmatchedOpens);

    return out;
}

const createTextListener = async (parsedMessage, liveConfig, AIChatUserList, user, sessionID, messageID, shouldContinue) => {
    //logger.warn('createTextListener activated');
    let currentlyStreaming
    //logger.warn(parsedMessage)
    let contentBeforeContinue
    // Track mid-stream fenced code block state for stable rendering
    let streamIsInsideFencedCodeblock = false;
    let haveInsertedPrefillForDisplayYet = false;

    // Produce a markdown string for rendering that appends a temporary closing
    // fence when the current content has an unmatched opening ``` fence.
    const withTemporaryFenceIfNeeded = (md) => {
        if (typeof md !== 'string' || md.length === 0) return md;
        const fenceCount = (md.match(/```/g) || []).length;
        const inside = (fenceCount % 2) === 1;
        streamIsInsideFencedCodeblock = inside;
        if (!inside) return md;
        // Append a temporary closing fence to stabilize rendering (do not mutate raw output)
        // Keep it on a new line to avoid gluing to code content
        return md.endsWith('\n') ? md + '```' : md + '\n```';
    };

    if (shouldContinue) {
        // Use explicit target when provided; fallback to previous message id convention
        const targetSessionID = parsedMessage?.continueTarget?.sessionID || sessionID;
        const targetMessageID = parsedMessage?.continueTarget?.mesID || (messageID - 1);
        contentBeforeContinue = await db.getMessage(targetMessageID, targetSessionID);
    }

    const endResponse = async () => {

        //logger.error('AIChatUserList in text Listener EndResponse')
        //logger.error(AIChatUserList)
        currentlyStreaming = false
        if (shouldContinue) {
            //logger.warn('shouldContinue is true, so we will append the content before continue to the accumulated output')
            accumulatedStreamOutput = contentBeforeContinue + accumulatedStreamOutput;
        }
        // If we end while a temporary fence was being used, do nothing special here; the
        // accumulatedStreamOutput already contains the true raw content without the temp fence.
        // The purifier will render correctly based on the true final fences.
        textEmitter.removeAllListeners('text');
            const streamEndToken = {
            chatID: parsedMessage.chatID,
            AIChatUserList: AIChatUserList,
            userColor: parsedMessage.userColor || parsedMessage.color || 'white',
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            //send the final markdown version at the end, replacing 
            rawResponse: accumulatedStreamOutput,
            consoleSeperator: '------------------', //this only exists to make the output easier to read
            content: purifier.makeHtml(
                autoMendMarkdown(
                    await api.trimIncompleteSentences(accumulatedStreamOutput)
                )
            ),
            type: 'streamedAIResponseEnd',
                // preserve targeting so client can finalize the correct node
                sessionID: parsedMessage?.continueTarget?.sessionID || sessionID,
                messageID: parsedMessage?.continueTarget?.mesID || messageID,
        };
        //logger.warn('sending stream end')
        broadcast(streamEndToken); // Emit the event to clients
        // Notify queue manager / server that this character's response is complete
        responseLifecycleEmitter.emit('responseComplete', {
            characterDisplayName: liveConfig.promptConfig.selectedCharacterDisplayName,
            characterValue: liveConfig.promptConfig.selectedCharacter,
            chatID: parsedMessage.chatID,
            streamed: true
        });
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

        if (haveInsertedPrefillForDisplayYet === false && liveConfig.promptConfig.responsePrefill.length > 0) {
            //logger.error('TEXTLISTENER: inserting prefill for display:', liveConfig.promptConfig.responsePrefill)
            accumulatedStreamOutput += liveConfig.promptConfig.responsePrefill;
            haveInsertedPrefillForDisplayYet = true;
        }

        accumulatedStreamOutput += text
        //logger.warn(accumulatedStreamOutput)
        // logger.warn(purify.partialMarkdownToHTML(purifier.makeHtml((accumulatedStreamOutput))))

        const streamedTokenMessage = {
            chatID: parsedMessage.chatID,
            content: purify.partialMarkdownToHTML(
                purifier.makeHtml(
                    withTemporaryFenceIfNeeded(accumulatedStreamOutput)
                )
            ),
            username: liveConfig.promptConfig.selectedCharacterDisplayName,
            type: 'streamedAIResponse',
            isContinue: shouldContinue,
            color: user?.color || 'red', //if red, then we have a problem somewhere. AI dont have colors atm, defaulting to white in frontend.
            sessionID: parsedMessage?.continueTarget?.sessionID || sessionID,
            messageID: parsedMessage?.continueTarget?.mesID || messageID,
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

    logger.warn('handle response sees sessionID: ', activeSessionID)
    // logger.warn(`isStreaming: ${isStreaming}, engineMode: ${engineMode}, selectedAPI: ${selectedAPI}`);

    if (isStreaming) {
        logger.warn('Preparing to stream response...');
        const [activeChatJSON, foundSessionID] = await db.readAIChat(sessionID);
        //const activeChat = JSON.parse(activeChatJSON);
        const newMessageID = await db.getNextMessageID();

        //this is a dry run to get the AIChatUserList, so we can create the listener EARLY.
        logger.warn('>>> DRY RUN to get userlist<<<')
        const AIChatUserList = await api.getAIResponse(
            isStreaming, hordeKey, engineMode, user, liveConfig, liveConfig.APIConfig, true, parsedMessage, false
        );
        // Create listener EARLY
        const textListener = await createTextListener(parsedMessage, liveConfig, AIChatUserList, user, foundSessionID, newMessageID, shouldContinue);

        textEmitter.removeAllListeners('text'); // Prevent multiple listeners
        textEmitter.on('text', textListener); // 🔁 NOW the emitter is hooked

        //this is the actual call to the API, which will start streaming.
        logger.warn('>>> REAL RUN to get response<<<')
        const [AIResponse, uselessAIChatUserList] = await api.getAIResponse(
            isStreaming, hordeKey, engineMode, user, liveConfig, liveConfig.APIConfig, false, parsedMessage, shouldContinue
        );

        if (!AIResponse || !AIResponse[0]) {
            logger.warn('[handleResponse] null or empty response received for streaming.');

            textListener('END_OF_RESPONSE');
            const trimmed = await api.trimIncompleteSentences(accumulatedStreamOutput);
            if (shouldContinue) {
                const targetSessionID = parsedMessage?.continueTarget?.sessionID || sessionID;
                const targetMessageID = parsedMessage?.continueTarget?.mesID || (newMessageID - 1);
                logger.warn('Editing message ID after got no response content: ', targetMessageID, ' in session ', targetSessionID);
                await db.editMessage(targetSessionID, targetMessageID, trimmed)
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
        // Non-streamed completion notification
        responseLifecycleEmitter.emit('responseComplete', {
            characterDisplayName: liveConfig.promptConfig.selectedCharacterDisplayName,
            characterValue: liveConfig.promptConfig.selectedCharacter,
            chatID: parsedMessage.chatID,
            streamed: false
        });
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
    //logger.warn('[readStreamChunks] >> GO')
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
    handleResponse, createTextListener, readStreamChunks, processStreamedResponse, responseLifecycleEmitter
}

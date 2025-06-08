import fs from 'fs';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';
import { charLogger as logger } from './log.js';

/**
 * Parses character data from a PNG file or raw buffer.
 * 
 * @param {string} cardUrl - Path or URL to the PNG file (ignored if `buffer` is passed).
 * @param {string} format - File format (default: "png").
 * @param {Buffer} [buffer] - Optional: pass raw PNG buffer instead of reading from file.
 * @returns {Promise<string>} - Parsed character data string.
 */
const characterCardParser = async (cardUrl, format = 'png', buffer = null) => {
    if (format !== 'png') return;

    try {
        const pngBuffer = buffer ?? fs.readFileSync(cardUrl);
        const chunks = extract(pngBuffer);

        // Filter for tEXt chunks with 'chara' keyword
        const textChunks = chunks
            .filter(chunk => chunk.name === 'tEXt')
            .map(chunk => PNGtext.decode(chunk.data))
            .filter(text => text.keyword === 'chara');

        if (!textChunks.length || !textChunks[0].text) {
            throw new Error(`No embedded "chara" metadata found in ${cardUrl}.`);
        }

        let base64Text = textChunks[0].text.trim();

        // Validate base64 format
        if (!/^[A-Za-z0-9+/=\s]+$/.test(base64Text)) {
            throw new Error(`Embedded "chara" data is not valid base64 in ${cardUrl}.`);
        }

        const decoded = Buffer.from(base64Text, 'base64').toString('utf8');

        if (!decoded || decoded.length < 10) {
            throw new Error(`Decoded character data is empty or invalid in ${cardUrl}.`);
        }

        // Temporarily parse to validate v1 or v2 spec
        let parsedData;
        try {
            parsedData = JSON.parse(decoded);
        } catch (err) {
            throw new Error(`Decoded character data is not valid JSON in ${cardUrl}.`);
        }

        // Check for v1 or v2 spec compliance
        const v1Errors = [];
        const v2Errors = [];

        // v1 field checks
        if (!parsedData.name || typeof parsedData.name !== 'string' || parsedData.name.length === 0) {
            v1Errors.push('name (missing, not a string, or empty)');
        }
        if (parsedData.description && typeof parsedData.description !== 'string') {
            v1Errors.push('description (not a string)');
        }
        if (parsedData.first_mes && typeof parsedData.first_mes !== 'string') {
            v1Errors.push('first_mes (not a string)');
        }
        const hasV1Fields = v1Errors.length === 0;

        // v2 field checks
        if (!parsedData.spec || parsedData.spec !== 'chara_card_v2') {
            v2Errors.push('spec (missing or not "chara_card_v2")');
        }
        if (!parsedData.spec_version || parsedData.spec_version !== '2.0') {
            v2Errors.push('spec_version (missing or not "2.0")');
        }
        if (!parsedData.data || typeof parsedData.data !== 'object' || parsedData.data === null) {
            v2Errors.push('data (missing or not an object)');
        } else {
            if (!parsedData.data.name || typeof parsedData.data.name !== 'string' || parsedData.data.name.length === 0) {
                v2Errors.push('data.name (missing, not a string, or empty)');
            }
            if (parsedData.data.description && typeof parsedData.data.description !== 'string') {
                v2Errors.push('data.description (not a string)');
            }
            if (parsedData.data.first_mes && typeof parsedData.data.first_mes !== 'string') {
                v2Errors.push('data.first_mes (not a string)');
            }
        }
        const hasV2Fields = v2Errors.length === 0;

        if (!hasV1Fields && !hasV2Fields) {
            const errorMessage = `Character data does not conform to v1 or v2 spec in ${cardUrl}:\n` +
                `v1 errors: ${v1Errors.length ? v1Errors.join(', ') : 'none'}\n` +
                `v2 errors: ${v2Errors.length ? v2Errors.join(', ') : 'none'}`;
            logger.error(`Invalid character data: ${JSON.stringify(parsedData, null, 2)}`);
            throw new Error(errorMessage);
        }

        return decoded; // Return unparsed string as expected

    } catch (err) {
        logger.error(`Failed to parse PNG metadata: ${err.message}`);
        throw err;
    }
};


export default characterCardParser;

/* sample character data schema as exported from SillyTavern on 20250608

{
    "name":"test case",
    "description":"desc",
    "personality":"",
    "scenario":"",
    "first_mes":"first mst",
    "mes_example":"",
    "creatorcomment":"",
    "avatar":"none",
    "chat":"test case - 2025-6-8 @19h 02m 25s 555ms",
    "talkativeness":"0.5",
    "fav":false,
    "tags":[],
    "spec":"chara_card_v2",
    "spec_version":"2.0",
    "data":{
        "name":"test case",
        "description":"desc",
        "personality":"",
        "scenario":"",
        "first_mes":"first mst",
        "mes_example":"",
        "creator_notes":"",
        "system_prompt":"",
        "post_history_instructions":"",
        "tags":[],
        "creator":"",
        "character_version":"",
        "alternate_greetings":[
            "alt first mes 1",
            "alt first mes 2"
            ],
        "extensions":{
            "talkativeness":"0.5",
            "fav":false,
            "world":"TestLoreBookForEmbed",
            "depth_prompt":{
                "prompt":"",
                "depth":4,
                "role":"system"
            }
        },
        "group_only_greetings":[],
        "character_book":{
            "entries":[
                {
                    "id":0,
                    "keys":["test"],
                    "secondary_keys":["test"],
                    "comment":"",
                    "content":"test",
                    "constant":false,
                    "selective":true,
                    "insertion_order":100,
                    "enabled":true,
                    "position":"before_char",
                    "use_regex":true,
                    "extensions":{
                        "position":0,
                        "exclude_recursion":false,
                        "display_index":0,
                        "probability":100,
                        "useProbability":true,
                        "depth":4,
                        "selectiveLogic":0,
                        "group":"",
                        "group_override":false,
                        "group_weight":100,
                        "prevent_recursion":false,
                        "delay_until_recursion":false,
                        "scan_depth":null,
                        "match_whole_words":null,
                        "use_group_scoring":false,
                        "case_sensitive":null,
                        "automation_id":"",
                        "role":0,
                        "vectorized":false,
                        "sticky":0,
                        "cooldown":0,
                        "delay":0,
                        "match_persona_description":false,
                        "match_character_description":false,
                        "match_character_personality":false,
                        "match_character_depth_prompt":false,
                        "match_scenario":false,
                        "match_creator_notes":false
                    }
                }
            ],
            "name":"TestLoreBookForEmbed"
        }
    }
}*/

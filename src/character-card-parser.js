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

        const textChunks = chunks
            .filter(chunk => chunk.name === 'tEXt')
            .map(chunk => PNGtext.decode(chunk.data));

        if (!textChunks.length || !textChunks[0].text) {
            throw new Error('No embedded character metadata found in PNG.');
        }

        let base64Text = textChunks[0].text.trim();

        // Optional: basic base64 validation
        if (!/^[A-Za-z0-9+/=\s]+$/.test(base64Text)) {
            throw new Error('Embedded data is not valid base64.');
        }

        const decoded = Buffer.from(base64Text, 'base64').toString('utf8');

        if (!decoded || decoded.length < 10) {
            throw new Error('Decoded character data is empty or invalid.');
        }

        return decoded;

    } catch (err) {
        logger.error(`Failed to parse PNG metadata: ${err.message}`);
        throw err;
    }
};


export default characterCardParser;

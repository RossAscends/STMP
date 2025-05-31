import fs from 'fs';
import { promisify } from 'util';
import $ from 'jquery';
import express, { response } from 'express';
import { fileLogger as logger } from './log.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');

const writeFileAsync = promisify(fs.writeFile);
import encode from 'png-chunks-encode';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';
import jimp from 'jimp';

const localApp = express();
const remoteApp = express();

localApp.use(express.static('public'));
remoteApp.use(express.static('public'));

import characterCardParser from './character-card-parser.js';

const charnameColors = [
    '#FF8A8A',  // Light Red
    '#FFC17E',  // Light Orange
    '#FFEC8A',  // Light Yellow
    '#6AFF9E',  // Light Green
    '#6ABEFF',  // Light Blue
    '#C46AFF',  // Light Purple
    '#FF6AE4',  // Light Magenta
    '#FF6A9C',  // Light Pink
    '#FF5C5C',  // Red
    '#FFB54C',  // Orange
    '#FFED4C',  // Yellow
    '#4CFF69',  // Green
    '#4CCAFF',  // Blue
    '#AD4CFF',  // Purple
    '#FF4CC3',  // Magenta
    '#FF4C86',  // Pink
];

//Import db handler from /db.js
import db from './db.js';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createDirectoryIfNotExist(path) {
    if (!fs.existsSync(path)) {
        try {
            fs.mkdirSync(path, { recursive: true });
            logger.debug(`-- Created '${path}' folder.`);
        } catch (err) {
            logger.error(`Failed to create '${path}' folder. Check permissions or path.`);
            process.exit(1);
        }
    }
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9_\-\.]/gi, '_');
}

function getUniqueFilename(dir, baseName, ext) {
    let candidate = `${baseName}${ext}`;
    let counter = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
        candidate = `${baseName}_${counter}${ext}`;
        counter++;
    }
    return candidate;
}

async function validateAndAcceptPNGUploads(uploadMessage) {
    logger.info('[[validateAndAcceptPNGUploads]] STARTING...');

    const { filename, mimeType, content, UUID, size } = uploadMessage;
    const CHARACTER_UPLOAD_DIR = path.join(ROOT_DIR, 'public', 'characters');
    const MAX_SIZE = 1 * 1024 * 1024;
    const buffer = Buffer.from(content, 'base64');
    let responseMessage, status, validatedDefs;

    // 1. Validate type
    if (mimeType !== "image/png") {
        responseMessage = `❌ PNG Card upload failed: Only PNGs are allowed. ${filename} (${mimeType})`;
        logger.warn(responseMessage);
        return { response: responseMessage, status: 'error' };
    }

    // 2. Validate size
    if (buffer.length > MAX_SIZE) {
        responseMessage = `❌ PNG Card upload failed: File Too Large. ${filename} (${buffer.length} bytes)`;
        logger.warn(responseMessage);
        return { response: responseMessage, status: 'error' };
    }

    // 3. Validate metadata
    try {
        validatedDefs = await characterCardParser('', 'png', buffer);
        if (!validatedDefs) {
            throw new Error('Embedded character data missing or unreadable.');
        }
    } catch (err) {
        responseMessage = `❌ PNG Card rejected: ${err.message}`;
        logger.warn(responseMessage);
        return { response: responseMessage, status: 'error' };
    }

    // 4. Save to disk
    const safeName = sanitizeFilename(path.basename(filename));
    const ext = path.extname(safeName).toLowerCase();
    const baseName = path.basename(safeName, ext);
    const finalName = getUniqueFilename(CHARACTER_UPLOAD_DIR, baseName, ext);
    const filePath = path.join(CHARACTER_UPLOAD_DIR, finalName);
    fs.writeFileSync(filePath, buffer);

    responseMessage = `✅ Card uploaded: ${JSON.parse(validatedDefs).name}`;
    validatedDefs = ''

    logger.info(responseMessage);
    return { response: responseMessage, status: 'ok' };
}



async function readConfig() {
    await acquireLock()
    //await delay(100)
    //logger.debug('--- READ CONFIG started')
    return new Promise(async (resolve, reject) => {
        fs.readFile('config.json', 'utf8', async (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    logger.warn('config.json not found, initializing with default values.');
                    try {
                        releaseLock()
                        resolve(liveConfig); // Assuming liveconfig is accessible here
                    } catch (initErr) {
                        logger.error('An error occurred while initializing the file:', initErr);
                        releaseLock()
                        reject(initErr);
                    }
                } else {
                    logger.error('An error occurred while reading the file:', err);
                    releaseLock()
                    reject(err);
                }
            } else {
                try {
                    //await delay(100)
                    const configData = JSON.parse(data); // Parse the content as JSON
                    releaseLock()
                    resolve(configData);
                } catch (parseErr) {
                    logger.error('An error occurred while parsing the JSON:', parseErr);
                    releaseLock()
                    reject(parseErr);
                }
            }
        });
    });
}

async function writeConfig(configObj, key = null, value = null) {
    await acquireLock();
    await delay(100);

    if (key) {
        const parts = key.split(".");
        let currentObj = configObj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];

            if (!(part in currentObj)) {
                currentObj[part] = {};
            }

            currentObj = currentObj[part];
        }

        currentObj[parts[parts.length - 1]] = value;

        logger.info(`Config updated: ${key}, ${value}`);
    }
    //logger.warn('WRITE configObj: ', configObj.crowdControl)
    const writableConfig = JSON.stringify(configObj, null, 2);
    fs.writeFile("./config.json", writableConfig, "utf8", writeErr => {
        if (writeErr) {
            logger.error("An error occurred while writing to the file:", writeErr);
            releaseLock();
            return;
        }

        logger.debug("config.json updated.");
        releaseLock();
    });
}

async function readFile(file) {
    await acquireLock()
    logger.trace(`[readFile()] Reading ${file}...`)
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    logger.error(`ERROR: ${file} not found`);
                } else {
                    logger.error('An error occurred while reading the file:', err);
                    releaseLock()
                    reject(err);
                }
            } else {
                releaseLock()
                resolve(data);
            }
        });
    });
}

async function acquireLock() {
    const stackTrace = new Error().stack;
    const callingFunctionName = stackTrace.split('\n')[2].trim().split(' ')[1];
    logger.trace(`${callingFunctionName} trying to acquiring lock..`)
    let lockfilePath = 'lockfile.lock'
    while (true) {
        try {
            // Attempt to create the lock file exclusively
            await fs.promises.writeFile(lockfilePath, '', { flag: 'wx' });
            logger.trace('lock acquired')
            return;
        } catch (error) {
            logger.trace('lockfile already exists')
            // File already exists, wait and retry
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

async function releaseLock() {
    const stackTrace = new Error().stack;
    const callingFunctionName = stackTrace.split('\n')[2].trim().split(' ')[1];
    logger.trace(`${callingFunctionName} releasing lock..`)
    const lockfilePath = 'lockfile.lock';

    try {
        // Check if the lock file exists
        await fs.promises.access(lockfilePath, fs.constants.F_OK);

        // Delete the lock file
        await fs.promises.unlink(lockfilePath);
        logger.trace('Lock file deleted successfully.');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            logger.error('Error deleting lock file:', error);
        }
    }
}

async function charaRead(img_url, input_format) {
    return characterCardParser(img_url, input_format);
}

async function charaWrite(img_url, data) {
    logger.warn(img_url)
    logger.debug(`Writing character definitions to ${img_url}...`)

    await acquireLock()
    try {
        // Read the image, resize, and save it as a PNG into the buffer
        const image = await tryReadImage(img_url);

        // Get the chunks
        const chunks = extract(image);
        const tEXtChunks = chunks.filter(chunk => chunk.name === 'tEXt');

        // Remove all existing tEXt chunks
        for (let tEXtChunk of tEXtChunks) {
            chunks.splice(chunks.indexOf(tEXtChunk), 1);
        }

        // Add new chunks before the IEND chunk

        //take the charDefsObject, stringify it, put it into a buffer, and then do base64 encoding
        const base64EncodedData = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
        chunks.splice(-1, 0, PNGtext.encode('chara', base64EncodedData));
        //logger.debug(chunks)
        await writeFileAsync(img_url, Buffer.from(encode(chunks), 'binary'));
        releaseLock()
        logger.debug('Done writing character defintions')
        return true;
    } catch (err) {
        logger.error(`Error writing character defs ${img_url}...`)
        logger.error(err);
        releaseLock()
        return false;
    }
}

async function tryReadImage(img_url) {
    try {
        let rawImg = await jimp.read(img_url);
        let final_width = rawImg.bitmap.width, final_height = rawImg.bitmap.height;

        const image = await rawImg.cover(final_width, final_height).getBufferAsync(jimp.MIME_PNG);
        return image;
    }
    // If it's an unsupported type of image (APNG) - just read the file as buffer
    catch {
        return fs.readFileSync(img_url);
    }
}

async function getCardList() {
    logger.info('Gathering character card list..')
    const path = 'public/characters'
    const files = (await fs.promises.readdir(path)).filter(file => file.endsWith('.png'));
    var cards = []
    var i = 0
    logger.trace('Files in character directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            const cardData = await charaRead(fullPath);
            var jsonData = JSON.parse(cardData);
            jsonData.filename = fullPath
            cards[i] = {
                name: jsonData.name,
                value: jsonData.filename
            }
            let thisCharColor = charnameColors[Math.floor(Math.random() * charnameColors.length)];
            db.upsertChar(jsonData.filename, jsonData.name, thisCharColor)
        } catch (error) {
            logger.error(`Error reading file ${file}:`, error);
        }
        i++
    }
    logger.trace(cards)
    return cards;
}

async function getInstructList() {
    const path = 'public/instructFormats'
    const files = await fs.promises.readdir(path);
    var instructs = []
    var i = 0
    logger.trace('Files in Instruct directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            const cardData = await readFile(fullPath);

            var jsonData = JSON.parse(cardData);
            jsonData.filename = `${path}/${file}`
            instructs[i] = {
                name: jsonData.name,
                value: jsonData.filename
            }
        } catch (error) {
            logger.error(`Error reading file ${file}:`, error);
        }
        i++
    }
    logger.trace(instructs)
    return instructs;
}

async function getSamplerPresetList() {
    const path = 'public/api-presets';
    const files = await fs.promises.readdir(path);
    const presets = [];

    for (const file of files) {
        try {
            if (file.endsWith('.json')) {
                const fullPath = `${path}/${file}`;
                presets.push({
                    name: file.replace('.json', ''),
                    value: fullPath,
                });
            }
        } catch (error) {
            logger.error(`Error reading file ${file}:`, error);
        }
    }

    return presets;
}

export default {
    readConfig,
    writeConfig,
    readFile,
    acquireLock,
    releaseLock,
    createDirectoryIfNotExist,
    getCardList,
    getInstructList,
    getSamplerPresetList,
    charaRead,
    charaWrite,
    validateAndAcceptPNGUploads
}
const fs = require('fs');
const util = require('util');
const $ = require('jquery');
const express = require('express');
const localApp = express();
const remoteApp = express();
const { fileLogger: logger } = require('./log.js');

localApp.use(express.static('public'));
remoteApp.use(express.static('public'));

const characterCardParser = require('./character-card-parser.js');

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
const db = require('./db.js');

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

async function readConfig() {
    await acquireLock()
    //await delay(100)
    //logger.debug('--- READ CONFIG started')
    return new Promise(async (resolve, reject) => {
        fs.readFile('config.json', 'utf8', async (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    logger.debug('config.json not found, initializing with default values.');
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

        logger.debug(`Config updated: ${key}`);
    }

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
    return characterCardParser.parse(img_url, input_format);
}

async function getCardList() {
    logger.info('Gathering character card list..')
    const path = 'public/characters'
    const files = await fs.promises.readdir(path);
    var cards = []
    var i = 0
    logger.trace('Files in character directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            const cardData = await charaRead(fullPath);
            var jsonData = JSON.parse(cardData);
            jsonData.filename = `${path}/${file}`
            cards[i] = {
                name: jsonData.name,
                value: jsonData.filename
            }
            thisCharColor = charnameColors[Math.floor(Math.random() * charnameColors.length)];
            db.upsertChar(jsonData.value, jsonData.name, thisCharColor)
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

module.exports = {
    readConfig: readConfig,
    writeConfig: writeConfig,
    readFile: readFile,
    acquireLock: acquireLock,
    releaseLock: releaseLock,
    createDirectoryIfNotExist: createDirectoryIfNotExist,
    getCardList: getCardList,
    getInstructList: getInstructList,
    getSamplerPresetList: getSamplerPresetList,
    charaRead: charaRead,
}
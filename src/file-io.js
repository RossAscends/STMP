const fs = require('fs');
const util = require('util');

//Old Reqs from old flat file era, can probably remove.

//const fsp = require('fs').promises;
//const writeFileAsync = util.promisify(fs.writeFile);
//const existsAsync = util.promisify(fs.exists);
//const path = require('path');

const $ = require('jquery');
const express = require('express');
const localApp = express();
const remoteApp = express();

localApp.use(express.static('public'));
remoteApp.use(express.static('public'));

const characterCardParser = require('./character-card-parser.js');

//Import db handler from /db.js
const db = require('./db.js');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createDirectoryIfNotExist(path) {
    if (!fs.existsSync(path)) {
        try {
            fs.mkdirSync(path, { recursive: true });
            console.log(`-- Created '${path}' folder.`);
        } catch (err) {
            console.error(`Failed to create '${path}' folder. Check permissions or path.`);
            process.exit(1);
        }
    }
}

async function readConfig() {
    await acquireLock()
    //await delay(100)
    //console.log('--- READ CONFIG started')
    return new Promise(async (resolve, reject) => {
        fs.readFile('config.json', 'utf8', async (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log('config.json not found, initializing with default values.');
                    try {
                        //console.log('--- READ CONFIG calling initconfig')
                        //await delay(100)
                        //await initConfig();
                        //console.log('----- CREATED NEW CONFIG FILE, RETURNING IT')
                        releaseLock()
                        resolve(liveConfig); // Assuming liveconfig is accessible here
                    } catch (initErr) {
                        console.error('An error occurred while initializing the file:', initErr);
                        releaseLock()
                        reject(initErr);
                    }
                } else {
                    console.error('An error occurred while reading the file:', err);
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
                    console.error('An error occurred while parsing the JSON:', parseErr);
                    releaseLock()
                    reject(parseErr);
                }
            }
        });
    });
}

async function writeConfig(configObj, key, value) {
    await acquireLock()
    await delay(100)
    //let newObject = await readConfig()
    if (key) {
        configObj[key] = value;
        console.log(`Config updated: ${key}`); // = ${value}`);
    }
    const writableConfig = JSON.stringify(configObj, null, 2); // Serialize the object with indentation
    fs.writeFile('./config.json', writableConfig, 'utf8', writeErr => {
        if (writeErr) {
            console.error('An error occurred while writing to the file:', writeErr);
            releaseLock()
            return;
        }
        console.log('config.json updated.');
        releaseLock()
    });
}

async function readFile(file) {
    await acquireLock()
    //console.log(`[readFile()] Reading ${file}...`)
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.log(`ERROR: ${file} not found`);
                } else {
                    console.error('An error occurred while reading the file:', err);
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
    //console.log(`${callingFunctionName} trying to acquiring lock..`)
    let lockfilePath = 'lockfile.lock'
    while (true) {
        try {
            // Attempt to create the lock file exclusively
            await fs.promises.writeFile(lockfilePath, '', { flag: 'wx' });
            //console.log('lock acquired')
            return;
        } catch (error) {
            //console.log('lockfile already exists')
            // File already exists, wait and retry
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

async function releaseLock() {
    const stackTrace = new Error().stack;
    const callingFunctionName = stackTrace.split('\n')[2].trim().split(' ')[1];
    //console.log(`${callingFunctionName} releasing lock..`)
    const lockfilePath = 'lockfile.lock';

    try {
        // Check if the lock file exists
        await fs.promises.access(lockfilePath, fs.constants.F_OK);

        // Delete the lock file
        await fs.promises.unlink(lockfilePath);
        //console.log('Lock file deleted successfully.');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error deleting lock file:', error);
        }
    }
}

async function charaRead(img_url, input_format) {
    return characterCardParser.parse(img_url, input_format);
}

async function getCardList() {
    const path = 'public/characters'
    const files = await fs.promises.readdir(path);
    var cards = []
    var i = 0
    //console.log('Files in character directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            const cardData = await charaRead(fullPath);
            var jsonData = JSON.parse(cardData);
            jsonData.filename = `${path}/${file}`
            cards[i] = {
                name: jsonData.name,
                filename: jsonData.filename
            }
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
        }
        i++
    }
    //console.log(cards)
    return cards;
}

async function getInstructList() {
    const path = 'public/instructFormats'
    const files = await fs.promises.readdir(path);
    var instructs = []
    var i = 0
    //console.log('Files in Instruct directory:');
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            //console.log(fullPath)
            const cardData = await readFile(fullPath);
            //console.log('got data')
            var jsonData = JSON.parse(cardData);
            jsonData.filename = `${path}/${file}`
            instructs[i] = {
                name: jsonData.name,
                filename: jsonData.filename
            }
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
        }
        i++
    }
    //console.log(instructs)
    return instructs;
}

async function getSamplerPresetList() {
    const path = 'public/api-presets'
    const files = await fs.promises.readdir(path);
    var presets = []
    var i = 0
    for (const file of files) {
        try {
            let fullPath = `${path}/${file}`
            presets[i] = {
                name: file.replace('.json', ''),
                filename: fullPath,
            }
        } catch (error) {
            console.error(`Error reading file ${file}:`, error);
        }
        i++
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
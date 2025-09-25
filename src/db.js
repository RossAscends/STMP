import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { dbLogger as logger } from './log.js';
import apiCalls from './api-calls.js';

// Connect to the SQLite database
const dbPromise = open({
    filename: './stmp.db',
    driver: sqlite3.Database
}).then(async (db) => {
    await db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = 1000;
        PRAGMA temp_store = MEMORY;
        PRAGMA mmap_size = 268435456;
    `);
    return db;
});

const schemaDictionary = {
    users: {
        user_id: "TEXT UNIQUE PRIMARY KEY",
        username: "TEXT",
        username_color: "TEXT",
        created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        last_seen_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    },
    user_roles: {
        user_id: "TEXT UNIQUE PRIMARY KEY",
        role: "TEXT DEFAULT 'user'",
        foreignKeys: {
            user_id: "users(user_id)"
        }
    },
    characters: {
        char_id: "TEXT UNIQUE PRIMARY KEY",
        displayname: "TEXT",
        display_color: "TEXT",
        created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        last_seen_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    },
    aichats: {
        message_id: "INTEGER PRIMARY KEY",
        session_id: "INTEGER",
        user_id: "TEXT",
        username: "TEXT",
        message: "TEXT",
        entity: "TEXT",
        timestamp: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        foreignKeys: {
            session_id: "sessions(session_id)",
            user_id: "users(user_id)"
        }
    },
    userchats: {
        message_id: "INTEGER PRIMARY KEY",
        session_id: "INTEGER",
        user_id: "TEXT",
        message: "TEXT",
        timestamp: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        active: "BOOLEAN DEFAULT TRUE",
        foreignKeys: {
            session_id: "userSessions(session_id)",
            user_id: "users(user_id)"
        }
    },
    sessions: {
        session_id: "INTEGER PRIMARY KEY",
        started_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        ended_at: "DATETIME",
        is_active: "BOOLEAN DEFAULT TRUE"
    },
    userSessions: {
        session_id: "INTEGER PRIMARY KEY",
        started_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        ended_at: "DATETIME",
        is_active: "BOOLEAN DEFAULT TRUE"
    },
    apis: {
        name: "TEXT UNIQUE PRIMARY KEY",
        endpoint: "TEXT",
        key: "TEXT",
        type: "TEXT",
        claude: "BOOLEAN DEFAULT FALSE", //saves as INTEGER 0 or 1
        created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        last_used_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        modelList: "TEXT",
        selectedModel: "TEXT"
    }
};

// Database write queue for serialization
let isWriting = false;
const writeQueue = [];

async function queueDatabaseWrite(dbOperation, params) {
    const operationName = dbOperation.name || 'anonymous';
    //logger.info(`Queuing database write for operation: ${operationName}`);
    return new Promise((resolve, reject) => {
        writeQueue.push({ dbOperation, params, resolve, reject, operationName });
        processWriteQueue();
    });
}

async function processWriteQueue() {
    if (isWriting || writeQueue.length === 0) return;
    isWriting = true;

    const { dbOperation, params, resolve, reject, operationName } = writeQueue.shift();
    //logger.info(`Processing database write for operation: ${operationName}`);
    const db = await dbPromise;

    let transactionStarted = false;
    try {
        await db.run('BEGIN TRANSACTION');
        transactionStarted = true;
        const result = await dbOperation(db, ...params);
        await db.run('COMMIT');
        //logger.info(`Completed database write for operation: ${operationName}`);
        resolve(result);
    } catch (err) {
        55
        if (transactionStarted) {
            try {
                await db.run('ROLLBACK');
                //logger.info('Rollback successful');
            } catch (rollbackErr) {
                logger.error('Error during rollback:', rollbackErr);
            }
        }
        logger.error('Error executing database write:', err, { operation: operationName, params });
        reject(err);
    } finally {
        isWriting = false;
        processWriteQueue(); // Process next write
    }
}

// Optional: Monitor queue length to detect bottlenecks
setInterval(() => {
    if (writeQueue.length > 0) {
        logger.warn(`Database write queue length: ${writeQueue.length}`);
    }
}, 60 * 1000);


async function ensureDatabaseSchema(schemaDictionary) {
    console.info('Ensuring database schema...');
    const db = await dbPromise;
    for (const [tableName, tableSchema] of Object.entries(schemaDictionary)) {
        // Create the table if it doesn't exist
        let createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (`;
        const columnDefinitions = [];
        for (const [columnName, columnType] of Object.entries(tableSchema)) {
            if (columnName !== 'foreignKeys') {
                columnDefinitions.push(`${columnName} ${columnType}`);
            }
        }

        // Adding foreign keys if they exist
        if (tableSchema.foreignKeys) {
            for (const [fkColumn, fkReference] of Object.entries(tableSchema.foreignKeys)) {
                columnDefinitions.push(`FOREIGN KEY (${fkColumn}) REFERENCES ${fkReference}`);
            }
        }

        createTableQuery += columnDefinitions.join(', ') + ')';
        await db.run(createTableQuery);

        // Check and add columns if they don't exist
        const tableInfo = await db.all(`PRAGMA table_info(${tableName})`);
        const existingColumns = tableInfo.map(column => column.name);

        for (const [columnName, columnType] of Object.entries(tableSchema)) {
            if (columnName !== 'foreignKeys' && !existingColumns.includes(columnName)) {
                const addColumnQuery = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
                await db.run(addColumnQuery);
            }
        }
    }
    await db.run(`INSERT OR IGNORE INTO apis (name, endpoint, key, type, claude) VALUES ('Default', 'localhost:5000', '', 'TC', FALSE)`);
}


// Write the session ID of whatever the active session in the sessions table is
async function writeUserChatMessage(userId, message) {
    logger.debug('Writing user chat message to database...');
    return queueDatabaseWrite(async (db) => {
        let insertQuery = '';
        let params = [];

        // Retrieve the active user session
        const activeSession = await db.get('SELECT session_id FROM userSessions WHERE is_active = TRUE');
        let session_id;

        if (activeSession) {
            session_id = activeSession.session_id;
            logger.debug(`Using existing user session_id: ${session_id}`);
        } else {
            const maxSession = await db.get('SELECT MAX(session_id) AS max_session_id FROM userSessions');
            session_id = maxSession.max_session_id ? maxSession.max_session_id + 1 : 1;
            await db.run(
                'INSERT INTO userSessions (session_id, is_active, started_at) VALUES (?, ?, ?)',
                [session_id, 1, new Date().toISOString()]
            );
            logger.debug(`Created new user session_id: ${session_id}`);
        }

        // Generate timestamp
        const timestamp = new Date().toISOString();

        // Insert new message
        insertQuery = `
            INSERT INTO userchats (user_id, message, timestamp, active, session_id)
            VALUES (?, ?, ?, ?, ?)
        `;
        params = [userId, message, timestamp, 1, session_id];
        const result = await db.run(insertQuery, params);

        const message_id = result.lastID;
        logger.debug(`Inserted user chat message ${message_id} with session_id ${session_id}`);
        return { message_id, session_id, user_id: userId, message, timestamp };
    }, []);
}


async function getPastChats(type) {
    logger.debug(`Getting data for all past ${type} chats...`);
    const db = await dbPromise;
    try {
        const rows = await db.all(`
            SELECT s.session_id, s.started_at, s.ended_at, s.is_active, a.user_id, a.timestamp,
            strftime('%Y-%m-%d %H:%M:%S', a.timestamp, 'localtime') AS local_timestamp
            FROM sessions s
            JOIN aichats a ON s.session_id = a.session_id
            JOIN sessions s2 ON s.session_id = s2.session_id
            ORDER BY s.started_at ASC
        `);

        const result = {};

        for (const row of rows) {
            const sessionID = row.session_id;

            // Create a 'messages' object for each unique session_id
            if (!result[sessionID]) {
                result[sessionID] = {
                    session_id: row.session_id,
                    started_at: row.started_at,
                    ended_at: row.ended_at,
                    is_active: row.is_active,
                    aiName: null,
                    messageCount: 0,
                    latestTimestamp: null
                };
            }

            // Check if the user_id does not contain a hyphen to determine if it's an AI user
            if (!row.user_id.includes('-')) {
                const aiName = row.user_id;
                if (!result[sessionID].aiName) {
                    result[sessionID].aiName = aiName;
                } else if (!result[sessionID].aiName.includes(aiName)) {
                    result[sessionID].aiName += `, ${aiName}`;
                }
            }

            // Use the local_timestamp directly from the row
            const localTimestamp = row.local_timestamp;

            // Update the message count and latest timestamp for the session
            result[sessionID].messageCount++;
            result[sessionID].latestTimestamp = localTimestamp;
        }

        return result;
    } catch (err) {
        logger.error('An error occurred while reading from the database:', err);
        throw err;
    }
}

async function deletePastChat(sessionID) {

    logger.debug('Deleting past chat... ' + sessionID);
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        let wasActive = false;
        try {
            const row = await db.get('SELECT * FROM sessions WHERE session_id = ?', [sessionID]);
            if (row) {
                await db.run('DELETE FROM aichats WHERE session_id = ?', [sessionID]);
                if (row.is_active) {
                    wasActive = true;
                }
                await db.run('DELETE FROM sessions WHERE session_id = ?', [row.session_id]);
                logger.debug(`Session ${sessionID} was deleted`);
            }
            return ['ok', wasActive];
        } catch (err) {
            logger.error('Error deleting session:', err);
        }
    }, [sessionID]);
}

async function deleteAIChatMessage(mesID) {
    logger.info('Deleting AI chat message... ' + mesID);
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            const row = await db.get('SELECT * FROM aichats WHERE message_id = ?', [mesID]);
            if (row) {
                await db.run('DELETE FROM aichats WHERE message_id = ?', [mesID]);
                logger.debug(`Message ${mesID} was deleted`);
                return 'ok';
            }

        } catch (err) {
            logger.error('Error deleting message:', err);
            return 'error';
        }
    }, [mesID]);
}

async function deleteUserChatMessage(mesID) {
    logger.info('Deleting user chat message... ' + mesID);
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            const row = await db.get('SELECT * FROM userchats WHERE message_id = ?', [mesID]);
            if (row) {
                await db.run('DELETE FROM userchats WHERE message_id = ?', [mesID]);
                logger.info(`User chat message ${mesID} was deleted`);
                return 'ok';
            }

        } catch (err) {
            logger.error('Error deleting message:', err);
            return 'error';
        }
    }, [mesID]);
}

async function deleteAPI(APIName) {

    logger.debug('[deleteAPI()] Deleting API named:' + APIName);
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            const row = await db.get('SELECT * FROM apis WHERE name = ?', [APIName]);
            if (row) {
                await db.run('DELETE FROM apis WHERE name = ?', [APIName]);
                logger.debug(`API ${APIName} was deleted`);
            }
            return ['ok'];
        } catch (err) {
            logger.error('Error deleting API:', err);
        }
    }, [APIName]);
}

// Only read the user chat messages that are active
async function readUserChat() {
    //logger.debug('Reading user chat...');
    const db = await dbPromise;
    let foundSessionID;

    try {
        const rows = await db.all(`
            SELECT 
                u.username,
                u.username_color,
                uc.message,
                uc.message_id,
                uc.session_id,
                ur.role AS userRole,
                uc.timestamp
            FROM userchats uc 
            LEFT JOIN users u ON uc.user_id = u.user_id
            LEFT JOIN user_roles ur ON uc.user_id = ur.user_id
            WHERE uc.active = TRUE
            ORDER BY uc.timestamp ASC 
        `);

        if (rows.length === 0) {
            logger.warn('No active user chats found.');
        }

        const result = JSON.stringify(rows.map(row => ({
            username: row.username || 'Unknown',
            content: row.message,
            userColor: row.username_color || '#FFFFFF',
            messageID: row.message_id,
            sessionID: row.session_id,
            role: row.userRole || null,
            timestamp: row.timestamp
        })));

        if (rows.length > 0) {
            foundSessionID = rows[0].session_id;
            //logger.debug(`Found ${rows.length} active user chats in session ${foundSessionID}`);
        }

        return [result, foundSessionID];

    } catch (err) {
        logger.error('An error occurred while reading from the database:', err);
        throw err;
    }
}


//Remove last AI chat in the current session from the database
async function removeLastAIChatMessage() {
    logger.info('Removing last AI chat message...');
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            const session = await db.get('SELECT session_id FROM sessions WHERE is_active = 1 LIMIT 1');
            if (!session) {
                logger.error('Tried to remove last message from AIChat, but no active session found. Returning null.');
                return null;
            }

            const row = await db.get('SELECT message_id FROM aichats WHERE session_id = ? ORDER BY message_id DESC LIMIT 1', [session.session_id]);
            if (row) {
                await db.run('DELETE FROM aichats WHERE message_id = ?', [row.message_id]);
                logger.info(`Deleted last message ${row.message_id} from session ${session.session_id}`);
            }
            return session.session_id;
        } catch (err) {
            logger.error('Error deleting message:', err);
            return null;

        }
    }, []);
}

async function setActiveChat(sessionID) {
    logger.info('Setting session ' + sessionID + ' as active...');
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            await db.run('UPDATE sessions SET is_active = 0 WHERE is_active = 1');
            await db.run('UPDATE sessions SET is_active = 1 WHERE session_id = ?', [sessionID]);
            logger.info(`Session ${sessionID} was set as active.`);
        } catch (err) {
            logger.error(`Error setting session ${sessionID} as active:`, err);
        }
    }, [sessionID]);
}

async function getActiveChat() {
    const db = await dbPromise;
    try {
        const row = await db.get('SELECT session_id FROM sessions WHERE is_active = 1 LIMIT 1');
        if (!row) {
            logger.error('Tried to get active session, but no active session found. Returning null.');
            return null;
        }

        if (row.session_id === null) {
            logger.error('Found active session, but session_id is null. Returning null.');
            return null;
        }
        //logger.debug('Found active session with session_id: ' + row.session_id);
        return row.session_id;

    } catch (err) {
        logger.error('Error getting active session:', err);
        return null;
    }
}

//this might not be necessary, but just in case. 
function collapseNewlines(x) {
    x.replace(/\r/g, '');
    return x.replaceAll(/\n+/g, '\n');
}

// Write an AI chat message to the database
async function writeAIChatMessage(username, userId, message, entity) {
    logger.info('Writing AI chat message...Username: ' + username + ', User ID: ' + userId + ', Entity: ' + entity);

    //logger.debug('Writing AI chat message...Username: ' + username + ', User ID: ' + userId + ', Entity: ' + entity);
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        collapseNewlines(message)
        try {
            let sessionId;
            const row = await db.get('SELECT session_id FROM sessions WHERE is_active = TRUE');
            if (!row) {
                logger.warn('No active session found, creating a new session...');
                await db.run('INSERT INTO sessions DEFAULT VALUES');
                sessionId = (await db.get('SELECT session_id FROM sessions WHERE is_active = TRUE')).session_id;
                logger.info(`A new session was created with session_id ${sessionId}`);
            } else {
                sessionId = row.session_id;
            }
            const timestamp = new Date().toISOString();
            await db.run(
                'INSERT INTO aichats (session_id, user_id, message, username, entity, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                [sessionId, userId, message, username, entity, timestamp]
            );
            let resultingMessageID = (await db.get('SELECT message_id FROM aichats WHERE session_id = ? ORDER BY message_id DESC LIMIT 1', [sessionId]))?.message_id;

            //logger.debug('Message written into session ' + sessionId + ' with message_id ' + resultingMessageID);
        } catch (err) {
            logger.error('Error writing AI chat message:', err);
        }
    }, [username, userId, message, entity]);
}

// Update all messages in the current session to a new session ID and clear the current session
async function newSession() {
    logger.info('Creating a new session...');
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            await db.run('UPDATE sessions SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP WHERE is_active = TRUE');
            await db.run('INSERT INTO sessions DEFAULT VALUES');
            const newSessionID = (await db.get('SELECT session_id FROM sessions WHERE is_active = TRUE')).session_id;
            logger.info('Creating a new session with session_id ' + newSessionID + '...');
            return newSessionID;
        } catch (error) {
            logger.error('Error creating a new session:', error);
        }
    }, []);
}

// mark currently active user chat entries as inactive
async function newUserChatSession() {
    logger.info('Creating a new user chat session...');
    return queueDatabaseWrite(async function newUserChatSessionOP(db) {
        // Deactivate userchats
        const userChatResult = await db.run('UPDATE userchats SET active = FALSE WHERE active = TRUE');
        logger.debug(`Deactivated ${userChatResult.changes} user chat rows.`);

        // Deactivate userSessions
        const sessionResult = await db.run('UPDATE userSessions SET is_active = FALSE WHERE is_active = TRUE');
        logger.debug(`Deactivated ${sessionResult.changes} user session rows.`);

        return {
            success: true,
            userChatChanges: userChatResult.changes,
            userSessionChanges: sessionResult.changes
        };
    }, []);
}

// Create or update the user in the database
async function upsertUser(uuid, username, color) {
    logger.info('Adding/updating user...' + uuid);

    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            await db.run('INSERT OR REPLACE INTO users (user_id, username, username_color, last_seen_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [uuid, username, color]);
            logger.debug('A user was upserted');
        } catch (err) {
            logger.error('Error writing user:', err);
        }
    }, [uuid, username, color]);
}

async function upsertUserRole(uuid, role) {

    logger.info('Adding/updating user role...' + uuid + ' ' + role);
    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            await db.run('INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)', [uuid, role]);
            logger.debug('A user role was upserted');
        } catch (err) {
            logger.error('Error writing user role:', err);
        }
    }, [uuid, role]);
}

// Create or update the character in the database
async function upsertChar(char_id, displayname, color) {
    logger.debug(`Adding/updating ${displayname} (${char_id})`);
    return queueDatabaseWrite(async (db) => {
        const existingRow = await db.get('SELECT displayname FROM characters WHERE char_id = ?', [char_id]);

        if (!existingRow) {
            // Case 1: Row with matching char_id doesn't exist, create a new row
            await db.run(
                'INSERT INTO characters (char_id, displayname, display_color, last_seen_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                [char_id, displayname, color]
            );
            logger.debug(`A new character was inserted, ${char_id}, ${displayname}`);
        } else if (existingRow.displayname !== displayname) {
            // Case 2: Row with matching char_id exists, but displayname is different, update displayname and last_seen_at
            await db.run(
                'UPDATE characters SET displayname = ?, last_seen_at = CURRENT_TIMESTAMP WHERE char_id = ?',
                [displayname, char_id]
            );
            logger.debug(`Updated displayname for character from ${existingRow.displayname} to ${displayname}`);
        } else {
            // Case 3: Row with matching char_id AND displayname exists, only update last_seen_at
            await db.run('UPDATE characters SET last_seen_at = CURRENT_TIMESTAMP WHERE char_id = ?', [char_id]);
            // logger.debug('Last seen timestamp was updated');
        }
    }, [char_id, displayname, color]); // Explicitly pass empty params array
}

// Retrieve the character with the most recent last_seen_at value
async function getLatestCharacter() {
    logger.debug('Retrieving the character with the most recent last_seen_at value');
    const db = await dbPromise;
    try {
        const character = await db.get('SELECT * FROM characters ORDER BY last_seen_at DESC LIMIT 1');
        return character;
    } catch (err) {
        logger.error('Error retrieving character:', err);
        return null;
    }
}

// Get user info from the database, including the role
async function getUser(uuid) {
    logger.debug('Getting user...' + uuid);
    const db = await dbPromise;
    try {
        return await db.get('SELECT u.user_id, u.username, u.username_color, u.created_at, u.last_seen_at, ur.role FROM users u LEFT JOIN user_roles ur ON u.user_id = ur.user_id WHERE u.user_id = ?', [uuid]);
    } catch (err) {
        logger.error('Error getting user:', err);
        throw err;
    }
}

// Read AI chat data from the SQLite database
async function readAIChat(sessionID = null) {
    const db = await dbPromise;
    let wasAutoDiscovered = false;

    if (!sessionID) {
        const activeSession = await db.get('SELECT session_id FROM sessions WHERE is_active = 1 LIMIT 1');
        if (!activeSession) return [JSON.stringify([]), null];
        sessionID = activeSession.session_id;
        wasAutoDiscovered = true;
    }

    const rows = await db.all(`
        SELECT 
            a.username,
            a.message,
            CASE
                WHEN u.user_id IS NULL THEN 
                    (SELECT c.display_color FROM characters c WHERE c.char_id = a.user_id)
                ELSE 
                    u.username_color
            END AS userColor,
            a.message_id,
            a.session_id,
            a.entity,
            ur.role AS userRole,
            a.timestamp
        FROM aichats a
        LEFT JOIN users u ON a.user_id = u.user_id
        LEFT JOIN user_roles ur ON a.user_id = ur.user_id
        WHERE a.session_id = ?
        ORDER BY a.timestamp ASC
    `, [sessionID]);

    const result = JSON.stringify(rows.map(row => ({
        username: row.username,
        content: row.message,
        userColor: row.userColor,
        sessionID: row.session_id,
        messageID: row.message_id,
        entity: row.entity,
        role: row.userRole ?? null,
        timestamp: row.timestamp
    })
    ));

    return [result, sessionID];
}

async function getNextMessageID() {
    const db = await dbPromise;
    try {
        const row = await db.get('SELECT MAX(message_id) AS maxMessageID FROM aichats');
        return (row?.maxMessageID ?? 0) + 1;
    } catch (err) {
        logger.error('Failed to get next message ID:', err);
        return 1; // fallback for empty DB
    }
}

async function getUserColor(UUID) {
    //logger.debug('Getting user color...' + UUID);
    const db = await dbPromise;
    try {
        const row = await db.get('SELECT username_color FROM users WHERE user_id = ?', [UUID]);
        if (row) {
            const userColor = row.username_color;
            return userColor;
        } else {
            logger.warn(`User not found for UUID: ${UUID}`);
            return null;
        }
    } catch (err) {
        logger.error('Error getting user color:', err);
        throw err;
    }
}

async function getCharacterColor(charName) {
    //logger.debug('Getting character color...' + charName);
    const db = await dbPromise;
    try {
        const row = await db.get('SELECT display_color FROM characters WHERE char_id = ?', [charName]);
        if (row) {
            const charColor = row.display_color;
            logger.debug(`Character color: ${charColor}`);
            return charColor;
        } else {
            logger.warn(`Character '${charName}' not found.`);
            return null;
        }
    } catch (err) {
        logger.error(`Error getting color for ${charName}: ${err}`);
        throw err;
    }
}

//currently userchats aren't editable, so we only look at aichats.
async function getMessage(messageID, sessionID) {
    logger.debug(`Getting AIChat message ${messageID}, sessionID: ${sessionID}`);
    const db = await dbPromise;
    try {
        logger.debug(`trying for message...`);
        let result = await db.get(
            'SELECT * FROM aichats WHERE message_id = ? AND session_id = ?',
            [messageID, sessionID]
        );
        if (!result) {
            logger.error(`Message not found for messageID ${messageID} and sessionID ${sessionID}. this is result: ${result}`);
            return null;
        }
        if (result) logger.debug(`Message found, returning message text.`); //: ${result.message}`);
        return result.message

    } catch (err) {
        logger.error('Error getting AI chat message:', err);
        throw err;
    }
}

async function editMessage(sessionID, mesID, newMessage) {
    logger.info('Editing AIChat message... ' + mesID);
    return queueDatabaseWrite(async (db, sessionID, mesID, newMessage) => {
        await db.run('UPDATE aichats SET message = ? WHERE message_id = ?', [newMessage, mesID]);
        logger.info(`Message ${mesID} was edited.`);
        //let sessionID = await getActiveChat()
        let proof = await getMessage(mesID, sessionID);
        console.info('edited message result: ', proof);
        return 'ok';
    }, [sessionID, mesID, newMessage]);
}


//takes an object with keys in this order: name, endpoint, key, type, claude, modelList (array), selectedModel
async function upsertAPI(apiData) {
    logger.info('Adding/updating API...');
    logger.trace(apiData)

    const { name, endpoint, key, type, claude, modelList, selectedModel } = apiData;
    logger.info('Adding/updating API...' + name);

    if (
        [name, endpoint, type, claude, modelList, selectedModel].some(
            (value) => value === undefined
        )
    ) {
        logger.error('New API has undefined datatypes; cannot register.');
        logger.error(apiData);
        return;
    }

    //const db = await dbPromise;
    return queueDatabaseWrite(async (db) => {
        try {
            await db.run(
                'INSERT OR REPLACE INTO apis (name, endpoint, key, type, claude, modelList, selectedModel) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    name,
                    endpoint,
                    key,
                    type,
                    claude,
                    JSON.stringify(modelList),
                    selectedModel,
                ]
            );
            logger.debug('An API was upserted');

            const nullRows = await db.get(
                'SELECT * FROM apis WHERE name IS NULL OR endpoint IS NULL OR name = "" OR endpoint = ""'
            );
            if (nullRows) {
                await db.run(
                    'DELETE FROM apis WHERE name IS NULL OR endpoint IS NULL OR name = "" OR endpoint = ""'
                );
                logger.debug('Cleaned up rows with no name or endpoint values');
            }
        } catch (err) {
            logger.error('Error writing API:', err);
        }
    }, [name, endpoint, key, type, claude, modelList, selectedModel])
}

async function getAPIs() {
    logger.debug('Getting API list.');
    const db = await dbPromise;
    try {
        const rows = await db.all('SELECT * FROM apis');
        const apis = rows.map(row => {
            try {
                row.modelList = JSON.parse(row.modelList);
            } catch (err) {
                logger.error(`Error parsing modelList for API ${row.name}:`, err);
                row.modelList = []; // Assign an empty array as the default value
            }
            row.claude == 1 ? row.claude = true : row.claude = false
            return row;
        });
        return apis;
    } catch (err) {
        logger.error('Error getting APIs:', err);
        throw err;
    }
}

async function getAPI(name) {
    const db = await dbPromise;
    try {
        let gotAPI = await db.get('SELECT * FROM apis WHERE name = ?', [name]);
        if (gotAPI) {
            try {
                gotAPI.modelList = JSON.parse(gotAPI.modelList);
            } catch (err) {
                logger.error(`Error parsing modelList for API ${gotAPI.name}:`, err);
                gotAPI.modelList = []; // Assign an empty array as the default value
            }
            gotAPI.claude == 1 ? gotAPI.claude = true : gotAPI.claude = false
            return gotAPI;
        } else {
            logger.error('API not found: "', name, '",returning Default instead.');
            let defaultAPI = await db.get('SELECT * FROM apis WHERE name = ?', ['Default']);
            console.warn(defaultAPI)
            return defaultAPI; // or handle the absence of the API in a different way
        }
    } catch (err) {
        logger.error('Error getting API:', err);
        throw err;
    }
}

//currently unused...exports a JSON object of all messages in a session
async function exportSession(sessionID) {
    logger.debug('Exporting session...' + sessionID);
    const db = await dbPromise;
    try {
        const rows = await db.all(`
            SELECT 
                a.username,
                a.message,
                CASE
                    WHEN u.user_id IS NULL THEN 
                        (SELECT c.display_color FROM characters c WHERE c.char_id = a.user_id)
                    ELSE 
                        u.username_color
                END AS userColor,
                a.message_id,
                a.entity
            FROM aichats a
            LEFT JOIN users u ON a.user_id = u.user_id
            WHERE a.session_id = ?
            ORDER BY a.timestamp ASC
        `, [sessionID]);

        const result = JSON.stringify(rows.map(row => ({
            username: row.username,
            content: row.message,
            userColor: row.userColor,
            messageID: row.message_id,
            entity: row.entity
        })));

        return result;

    } catch (err) {
        logger.error('An error occurred while reading from the database:', err);
        throw err;
    }
}

async function getAIChatMessageRow(messageID, sessionID) {
    const db = await dbPromise;
    try {
        const row = await db.get('SELECT * FROM aichats WHERE message_id = ? AND session_id = ?', [messageID, sessionID]);
        if (!row) {
            dbLogger.warn(`getAIChatMessageRow: No row for message_id ${messageID}, session ${sessionID}`);
        }
        return row || null;
    } catch (err) {
        dbLogger.error('getAIChatMessageRow error:', err);
        return null;
    }
}
    // return full AI chat message row (including username, entity, etc)}

ensureDatabaseSchema(schemaDictionary);

export default {
    writeUserChatMessage,
    writeAIChatMessage,
    newSession,
    upsertUser,
    getUser,
    readAIChat,
    readUserChat,
    upsertChar,
    removeLastAIChatMessage,
    getPastChats,
    deleteAIChatMessage,
    deleteUserChatMessage,
    getMessage,
    getAIChatMessageRow,
    deletePastChat,
    getUserColor,
    upsertUserRole,
    getCharacterColor,
    upsertAPI,
    getAPIs,
    getAPI,
    newUserChatSession,
    getLatestCharacter,
    deleteAPI,
    editMessage,
    getNextMessageID,
    setActiveChat,
    getActiveChat,
    exportSession
}
const sqlite3 = require('sqlite3');
const sqlite = require('sqlite');

// Connect to the SQLite database
const dbPromise = sqlite.open({
    filename: './stmp.db',
    driver: sqlite3.Database
});

async function createTables() {
    const db = await dbPromise;
    // Users table
    await db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id TEXT UNIQUE PRIMARY KEY,
        username TEXT,
        username_color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Characters table
    await db.run(`CREATE TABLE IF NOT EXISTS characters (
        char_id TEXT UNIQUE PRIMARY KEY,
        displayname TEXT,
        display_color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // AIChats table
    await db.run(`CREATE TABLE IF NOT EXISTS aichats (
        message_id INTEGER PRIMARY KEY,
        session_id INTEGER,
        user_id TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`);

    // UserChats table
    await db.run(`CREATE TABLE IF NOT EXISTS userchats (
        message_id INTEGER PRIMARY KEY,
        user_id TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`);

    // Sessions table
    await db.run(`CREATE TABLE IF NOT EXISTS sessions (
        session_id INTEGER PRIMARY KEY,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        is_active BOOLEAN DEFAULT TRUE
    )`);
}

async function writeUserChatMessage(userId, message) {
    console.log('Writing user chat message to database...');
    const db = await dbPromise;
    try {
        await db.run('INSERT INTO userchats (user_id, message) VALUES (?, ?)', [userId, message]);
        console.debug('A side chat message was inserted');
    } catch (err) {
        console.error('Error writing side chat message:', err);
    }
}

async function readUserChat() {
    console.log('Reading user chat...');
    const db = await dbPromise;
    try {
        const rows = await db.all(`
            SELECT u.username, u.username_color AS userColor, uc.message
            FROM userchats uc
            JOIN users u ON uc.user_id = u.user_id
            ORDER BY uc.timestamp ASC
        `);
        return JSON.stringify(rows.map(row => ({
            username: row.username,
            content: row.message,
            userColor: row.userColor
        })));
    } catch (err) {
        console.error('An error occurred while reading from the database:', err);
        throw err;
    }
}

// Write an AI chat message to the database
async function writeAIChatMessage(userId, message) {
    console.log('Writing AI chat message to database...');
    const db = await dbPromise;
    try {
        let sessionId;
        const row = await db.get('SELECT session_id FROM sessions WHERE is_active = TRUE');
        if (!row) {
            console.debug('No active session found, creating a new session...');
            await db.run('INSERT INTO sessions DEFAULT VALUES');
            sessionId = (await db.get('SELECT session_id FROM sessions WHERE is_active = TRUE')).session_id;
            console.debug(`A new session was created with session_id ${sessionId}`);
        } else {
            sessionId = row.session_id;
        }
        await db.run('INSERT INTO aichats (session_id, user_id, message) VALUES (?, ?, ?)', [sessionId, userId, message]);
        console.debug('An AI chat message was inserted');
    } catch (err) {
        console.error('Error writing AI chat message:', err);
    }
}

// Update all messages in the current session to a new session ID and clear the current session
async function newSession() {
    console.log('Creating a new session...');
    const db = await dbPromise;
    try {
        await db.run('UPDATE sessions SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP WHERE is_active = TRUE');
        await db.run('INSERT INTO sessions DEFAULT VALUES');
    } catch (error) {
        console.error('Error creating a new session:', error);
    }
}

// Create or update the user in the database
async function upsertUser(uuid, username, color) {
    console.log('Upserting user...');
    const db = await dbPromise;
    try {
        await db.run('INSERT OR REPLACE INTO users (user_id, username, username_color, last_seen_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [uuid, username, color]);
        console.debug('A user was upserted');
    } catch (err) {
        console.error('Error writing user:', err);
    }
}

// Create or update the character in the database
async function upsertChar(uuid, displayname, color) {
    console.log('Upserting character...');
    const db = await dbPromise;
    try {
        await db.run('INSERT OR REPLACE INTO characters (char_id, displayname, display_color, last_seen_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [uuid, displayname, color]);
        console.debug('A character was upserted');
    } catch (err) {
        console.error('Error writing character:', err);
    }
}

// Get user info from the database
async function getUser(uuid) {
    console.log('Getting user...');
    const db = await dbPromise;
    try {
        return await db.get('SELECT * FROM users WHERE user_id = ?', uuid);
    } catch (err) {
        console.error('Error getting user:', err);
        throw err;
    }
}

// Read AI chat data from the SQLite database
async function readAIChat() {
    console.log('Reading AI chat...');
    const db = await dbPromise;
    try {
        const rows = await db.all(`
            SELECT 
                CASE 
                    WHEN u.user_id IS NULL THEN 
                        (SELECT c.displayname FROM characters c WHERE c.char_id = a.user_id)
                    ELSE 
                        u.username
                END AS username,
                a.message,
                CASE
                    WHEN u.user_id IS NULL THEN 
                        (SELECT c.display_color FROM characters c WHERE c.char_id = a.user_id)
                    ELSE 
                        u.username_color
                END AS userColor
            FROM aichats a
            LEFT JOIN users u ON a.user_id = u.user_id
            WHERE a.session_id = (SELECT session_id FROM sessions WHERE is_active = TRUE)
            ORDER BY a.timestamp ASC
        `);
        console.log(rows);
        return JSON.stringify(rows.map(row => ({
            username: row.username,
            content: row.message,
            userColor: row.userColor
        })));
    } catch (err) {
        console.error('An error occurred while reading from the database:', err);
        throw err;
    }
}

createTables().catch(console.error);

module.exports = {
    writeUserChatMessage: writeUserChatMessage,
    writeAIChatMessage: writeAIChatMessage,
    newSession: newSession,
    upsertUser: upsertUser,
    getUser: getUser,
    readAIChat: readAIChat,
    readUserChat: readUserChat,
    upsertChar: upsertChar
};
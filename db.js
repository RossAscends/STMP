const sqlite3 = require('sqlite3').verbose();

// Connect to the SQLite database
const db = new sqlite3.Database('./stmp.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Create tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    uuid TEXT UNIQUE,
    username TEXT,
    username_color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

    // AIChats table
    db.run(`CREATE TABLE IF NOT EXISTS aichats (
    message_id INTEGER PRIMARY KEY,
    session_id INTEGER,
    user_id INTEGER,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  )`);

    // UserChats table
    db.run(`CREATE TABLE IF NOT EXISTS userchats (
    message_id INTEGER PRIMARY KEY,
    user_id INTEGER,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
  )`);

    // Sessions table
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
    session_id INTEGER PRIMARY KEY,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE
  )`);
});

function writeUserChatMessage(userId, message) {
    db.run('INSERT INTO userchats (user_id, message) VALUES (?, ?)', [userId, message], function (err) {
        if (err) {
            console.error('Error writing side chat message:', err);
        } else {
            console.debug(`A side chat message was inserted with message_id ${this.lastID}`);
        }
    });
}

// Write an AI chat message to the database, use the current active session, create a new session if needed
function writeAIChatMessage(userId, message) {
    // Create a new session if there is no active session
    db.get('SELECT session_id FROM sessions WHERE is_active = TRUE', (err, row) => {
        if (err) {
            console.error('Error getting active session:', err);
        } else if (row === undefined) {
            console.debug('No active session found, creating a new session...');
            db.run('INSERT INTO sessions DEFAULT VALUES', function (err) {
                if (err) {
                    console.error('Error creating a new session:', err);
                } else {
                    console.debug(`A new session was created with session_id ${this.lastID}`);
                    // Insert the AI chat message with the new session ID
                    db.run('INSERT INTO aichats (session_id, user_id, message) VALUES (?, ?, ?)', [this.lastID, userId, message], function (err) {
                        if (err) {
                            console.error('Error writing AI chat message:', err);
                        } else {
                            console.debug(`An AI chat message was inserted with message_id ${this.lastID}`);
                        }
                    });
                }
            });
        } else {
            // Insert the AI chat message with the active session ID
            db.run('INSERT INTO aichats (session_id, user_id, message) VALUES (?, ?, ?)', [row.session_id, userId, message], function (err) {
                if (err) {
                    console.error('Error writing AI chat message:', err);
                } else {
                    console.debug(`An AI chat message was inserted with message_id ${this.lastID}`);
                }
            });
        }
    });
}

//update all messages in the current session to a new session ID and clear the current session
function newSession() {
    db.run('UPDATE aichats SET session_id = (SELECT session_id FROM sessions WHERE is_active = TRUE) WHERE session_id = (SELECT session_id FROM sessions WHERE is_active = FALSE)')
    db.run('UPDATE sessions SET is_active = FALSE WHERE is_active = TRUE')
    db.run('INSERT INTO sessions DEFAULT VALUES')
}

// create or update the user in the database, adds last seen timestamp, color, and username
function upsertUser(uuid, username, color) {
    db.run('INSERT OR REPLACE INTO users (uuid, username, username_color, last_seen_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [uuid, username, color], function (err) {
        if (err) {
            console.error('Error writing user:', err);
        } else {
            console.debug(`A user was inserted with user_id ${this.lastID}`);
        }
    });
}

//get user info from the database
function getUser(uuid) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE uuid = ?', [uuid], (err, row) => {
            if (err) {
                console.error('Error getting user:', err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * Reads AI chat data from the SQLite database and formats it.
 * @returns {Promise<string>} A promise that resolves with the formatted chat data as a JSON string.
 */
async function readAIChat() {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT u.username, a.message, u.username_color AS userColor
            FROM aichats a
            JOIN users u ON a.user_id = u.user_id
            ORDER BY a.timestamp ASC
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('An error occurred while reading from the database:', err);
                reject(err);
            } else {
                // Map the rows to the desired JSON structure
                const formattedData = rows.map(row => ({
                    username: row.username,
                    content: row.message,
                    userColor: row.userColor
                }));
                resolve(JSON.stringify(formattedData));
            }
        });
    });
}

module.exports = {
    writeUserChatMessage: writeUserChatMessage,
    writeAIChatMessage: writeAIChatMessage,
    newSession: newSession,
    upsertUser: upsertUser,
    getUser: getUser,
    readAIChat: readAIChat
};
# Silly Tavern MultiPlayer (STMP)

A minimal AI chat interface with multiuser capabilities via websockets created from scratch by RossAscends.

## Installation

1. make sure Node JS is installed on your system and has access through your windows Firewall.
2. clone this github repo
3. Setup the API (see below)
4. run `STMP.bat` to install the required node modules and start the server.
5. On the first run the batch file will create an empty `secrets.json` as well as the `/api-presets/` and `/chats/` folders.
6. open `htttp://localhost:8181/` in your web browser.

## API Setup

Currently STMP supports Tabby and HordeAI, with Tabby active by default.

**NOTE:** The API parameters are set in `client.html`.

### Using Tabby

- `server.js` and `client.html` are both set to use Tabby by default.
- Obviously, the host must have Tabby installed and working on their device. Instructions for this can be found on the [TabbyAPI Github](https://github.com/theroyallab/tabbyAPI).
- STMP assumes the default server URL of `http://127.0.0.1:5000/v1/completions` for Tabby requests.
- Copy the TabbyAPI key from the Tabby console and paste it into `secrets.json`

### Using Horde

- Using Horde requires a SillyTavern server to be running on your local machine to handle the Horde requests.
- **IMPORTANT: ST must be running with CSRF turned off.**
- **IMPORTANT:** STMP assumes you have BasicAuthentication enabled on your ST server, and requires you to input your `username:pass` into the `server.js` code.
- STMP assumes the default ST server URL of `http://127.0.0.1:8000/api/horde/generate-text` for Horde requests.
- If you have a HordeID set in SillyTavern, those credentials and kudos will be used.

### Changing API

- The Host can click the emoji icon at the top left to change which API is used.
- cat = Tabby
- zombie = Horde

## Multiuser Setup

This must be done AFTER completing all installation steps above.

1. Run `Remote-Link.cmd` to download `cloudflared.exe` and get a randomly generated tunnel URL for your server.
2. Share the generated clourflared URL with the guest users.
3. User will be able to connect directly to your PC using the Cloudflare URL.

## Use

### Adding Characters

Place any SillyTavern compatible character card into the `/characters/` folder and refresh the page.
Character can be selected at the top left of the AI Chat panel.
If new characters are added while the server is running, the Host must refresh their browser page to see them in the selection.

### Changing Characters

- the AI character can be changed at any time without resetting the chat.

### Chatting

- Chatting can be done in either chat windows by typing into the appropriate box and then either pressing the Send button, or pressing Enter
- Shift+enter can be used to add newlines to the input.
- markdown formatting is respected
- pressing the retry button will remove the last chat message and prompt the AI character to give a new response.

### Hosting

The host will see controls at the top of the screen for:

- changing the AI character
- manually triggering an AI response without user Input
- clearing either chat windows

### Changing usernames

Use the text boxes at the top of the screen to change your username(s) at any time.
You can have a different name for the User Chat and AI Chat.

## Planned Features

### Core Functionality

- ~~Proper chat history for the AI~~
- ~~Saving user chat history for persistence across sessions~~
- ~~in-chat notification of when a user changes their username~~
- ~~unique colors for usernames in chat to make the chat easier to read at a glance.~~
- ~~set and respect API context limits~~
- ~~host-defined settings persist across sessions~~
- smarter retry logic (add entity metadata to each chat message; only remove the last AI response)
- ~~ability to save chat files when clearing the chat~~
- ability to load old chat files

### Host Controls

- Better generation parameter adjustments (likely via preset files, not individual sliders)
- ~~API swapping in UI without server restart~~
- ~~push selected character to user on connection~~
- ~~toggle for AI response timing: 1-to-1 with user input, or only on manual trigger from Host~~
- toggle for locking AI chat for users? (this is already kind of done with AutoResponse off)
- drag-sort list to set User Turn Order for AI chatting?
- ~~add AI chat clear button~~
- ~~ability to remove individual chat messages (at first this will be deleting from the bottom.)~~

### Low-priority but Nice-to-have Features

- Multiple AI characters active at once (group chats)
- exporting chat files as text or JSON?
- UI themes

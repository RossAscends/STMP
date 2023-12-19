# Silly Tavern MultiPlayer (STMP)

A minimal AI chat interface with multiuser capabilities via websockets created from scratch by RossAscends.

## Installation

1. make sure Node JS is installed on your system and has access through your windows Firewall.
2. clone this github repo
3. Setup the API (see below)
4. run `STMP.bat` to install the required node modules and start the server.
5. open `localhost:8181` in your web browser.

## API Setup

Currently STMP supports Tabby and HordeAI, and has Tabby active by default.

**NOTE:** The API parameters are set in `client.html`.

### Using Tabby

- `server.js` and `client.html` are both set to use Tabby by default.
- Obviously, the host must have Tabby installed and working on their device. Instructions for this can be found on the [TabbyAPI Github](https://github.com/theroyallab/tabbyAPI).
- STMP assumes the default server URL of `http://127.0.0.1:5000/v1/completions` for Tabby requests.
- Copy the TabbyAPI key from the Tabby console and paste it into secrets.json

### Using Horde

- Using Horde requires a SillyTavern server to be running on your local machine to handle the Horde requests.
- **IMPORTANT: ST must be running with CSRF turned off.**
- **IMPORTANT:** STMP assumes you have BasicAuthentication enabled on your ST server, and requires you to input your `username:pass` into the `server.js` code.
- STMP assumes the default ST server URL of `http://127.0.0.1:8000/api/horde/generate-text` for Horde requests.
- If you have a HordeID set in SillyTavern, those credentials and kudos will be used.

### Changing API

Currently the host must edit `server.js` to swap which API is used to generate responses in the AI Chat.
Search `server.js` for `AI_API_SELECTION_CODE` and comment/uncomment the appropriate line, and restart server.

- **NOTE:** The API Selected in `server.js` must match the API parameters sent by `client.html`, or the requests will not work.
- Search `client.html` for `API_PARAMS_FOR_HORDE` or `API_PARAMS_FOR_TABBY` to find them, and comment/uncomment the one that matches the API Selected in `server.js`
- User will need to refresh their browser page after this change takes place.

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

### Host Controls

The host will see controls at the top of the screen for changing the AI character and clearing the user chat.

### Changing usernames

Use the text boxes at the top of the screen to change your username(s) at any time.
You can have a different name for the User Chat and AI Chat.

## Planned Features

- Proper chat history for the AI (currently no chat history is sent, and AI response are based only on the latest user input)
- ~~Saving user chat history for persistence across sessions~~
- Better generation parameter adjustments (likely via preset files, not individual sliders)
- API swapping in UI without server restart
- Multiple AI characters active at once (group chats)
- ~~in-chat notification of when a user changes their username~~
- unique colors for usernames in chat to make the chat easier to read at a glance.

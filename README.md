# SillyTavern MultiPlayer (STMP)

SillyTavern MultiPlayer is an LLM chat interface that allows multiple users to chat together with an AI.

- Created by RossAscends.

## Support and Donations

If this software brings you and your friend's joy, donations to Ross can be made via:

<table style="width:500px">
  <tr>
    <td>
  <a href="https://ko-fi.com/rossascends" target="_blank"><img src="https://files.catbox.moe/ktbc70.png" style="height:3em;"></a><br>
<a href="https://ko-fi.com/rossascends" target="_blank">Ko-fi</a>
    </td>
    <td>
  <a href="https://www.patreon.com/RossAscends" target="_blank"><img src="https://files.catbox.moe/qqncsx.png" style="height:3em;"></a><br>
      <a href="https://www.patreon.com/RossAscends" target="_blank">Patreon</a>
    </td>
  </tr>
</table>

For tech support or to contact RossAscends directly, join the [SillyTavern Discord](https://discord.gg/sillytavern).

## Installation

### Typical

1. Make sure [Node JS](https://nodejs.org/) is installed on your system and has access through your firewall.
2. Clone this github repo. (`git clone https://github.com/RossAscends/STMP/` in a command line, or use a Github GUI like Github Desktop)
3. Setup the API (see below).
4. Run `STMP.bat` to install the required Node modules and start the server.
5. On the first run, the server will create an empty `secrets.json` and a default `config.json`, as well as the `/api-presets/` and `/chats/` folders.
6. Open `htttp://localhost:8181/` in your web browser.

### Docker

- STMP can also be installed via Docker, thanks to [city-unit](https://github.com/city-unit).
- The [Docker](https://www.docker.com) file can be found in `/utils/`

(instructions coming soon)

## Setup

Currently STMP supports Text Completions (TC) and HordeAI, with TC active by default.

### Using Text Completions or Chat Completions

1. In the Host Control Panel open the selector under the 'API' text and select `Add New ApI`.
2. Some inputs will be displayed.

- `Name` - the label you want to remember the API as
- `Full Endpoint URL` - this is the **FULL AND ENTIRE** endpoint URL, not just the base server URL.
- `Key` - If your API requires a key, put it in here.
- `Endpoint Type` - select from Text Completions or Chat Completions as appropriate for the API endpoint.

3. When all of these are filled out, press Save.

<!-- - Obviously, the host must have a Text Completions compatible backend installed and working on their device.
- [TabbyAPI](https://github.com/theroyallab/tabbyAPI) and [KoboldCPP](https://github.com/LostRuins/koboldcpp) are confirmed to work with STMP's TC API mode.
- STMP assumes the default server URL of `http://127.0.0.1:5000/v1/completions` for TC requests.
- **KoboldCPP should be run with the --multiUser flag enabled.**
- If your TC API requires a key, paste it into `secrets.json`.
- Other OpenAI-compatible TC APIs are being tested. -->

### Using Horde

- Using Horde requires a SillyTavern server to be running on your local machine to handle the Horde requests.

> **IMPORTANT: ST must be running with CSRF turned off.**

- the easiest way to do this is to make a new `.bat` or `.sh` file with the following contents:

```
cd c:\_path_\_to_your_\SillyTavern
call npm install --no-audit
node server.js --disableCsrf
pause
popd
```

> **IMPORTANT:** STMP assumes you have [BasicAuthentication enabled on your ST server](https://docs.sillytavern.app/usage/remoteconnections/#http-basic-authentication).

> Input your ST Authentication `username:pass` into `secrets.json` on the appropriate line between the quotation marks.

- STMP assumes the default ST server URL of `http://127.0.0.1:8000/api/horde/generate-text` for Horde requests.
- If you have a HordeID set in SillyTavern, those credentials and kudos will be used.

### Multiuser Setup

This must be done AFTER completing all installation steps above.

0. Make sure your STMP server is running.
1. Run `Remote-Link.cmd` to download `cloudflared.exe` (only one time, 57MB).
2. the Cloudflared server will auto-start and generate a random tunnel URL for your STMP server.
3. Copy the URL displayed in the middle of the large box in the center of the console window.

> ***DO NOT CLOSE THE CLOUDFLARE CONSOLE WINDOW***

4. Share the generated cloudflared URL with the guest users.
5. User will be able to directly and securely connect to your PC by opening the URL in their browser.

## Play

### Chatting

- User can change their display name at any time using either of the inputs at the top of the respective chat displays.
  - You can have a different name for the User Chat and AI Chat.
  - Usernames are stored in browser localStorage.
- Chatting can be done in either chat windows by typing into the appropriate box and then either pressing the Send button (✏️), or pressing Enter.
- `Shift+Enter` can be used to add newlines to the input.
- [Markdown formatting](https://github.com/showdownjs/showdown/wiki/Showdown%27s-Markdown-syntax) is respected.

## Hosting

The host will see the following controls:

### Control Panel (left side)

#### AI Controls

- `API` type
  - 📑 = Text Completions
  - 🧟 = Horde
- `Context` defines how long your API prompt should be. Longer = more chat history sent, but slower processing times.
- `Response` defines how many tokens long the AI response can be.
- `Sampler` sets the hyperparameter preset, which affects the response style.
- `Instruct` sets the type of instruct sequences to use when crafting the API prompt.
- `AutoAI` Toggle to determine whether the AI should respond to every user input, or only on command from the Host.
- `Final Instruction` textbox sets what to send as a system message at Depth 1 in the prompt.

#### Past Chats

- A list of past AI Chats, click to load one.
- (🔄) refreshes the Past AI Chats list (usually not necessary as it is auto-refreshed with each new AI chat message)

#### Crowd Controls

- (🤖⏳) sets the number of seconds delay between inputs to the AI Chat.
- (🧑⏳) does the same, but for the User-to-User chat.
- During the delay period the (✏️) for that chat will become (🚫), and no input will be possible.

#### Top Left

- The golden (◀️) toggles visibility of the Host Control Panel.
- (🖼️) toggles the chat windows between three modes: maximize AI chat >> maximize User Chat >> return to normal dual display.
  - **this is very helpful for mobile users!**
- (📜) toggles display of both User lists.

#### Top Right

- (▶️/⏸️) allows for manual disconnect/reconnect to the server.
- (🔑) opens a text box for input of the Host key in order to gain the Host role.
  - Once a vlid key has been entered, the page will automatically refresh to show the host controls.
  - **The Host key can be found in the server console at startup.**
  - After the user enters the key and presses Enter, their page will refresh and they will see the Host controls.
- (⛔) clears the saved Usernames and UniqueID from localStorage.

#### In the Chat Windows

- A selector to set the active AI character
- (🗑️) to clear either chat.

#### AI Chat Input Bar

- (🤖) Manually triggering an AI response without user Input
- (✂️) Deleting the last message in the AI Chat
- (🔄) Retry, i.e. Remove the last chat message and prompt the AI character to give a new response.

### Managing Characters

- Place any SillyTavern compatible character card into the `/characters/` folder and refresh the page.
- Character can be selected at the top of the AI Chat panel.
- If new characters are added while the server is running, the Host must refresh their browser page to see them.
- the AI character can be changed at any time without resetting the chat.

### Adding Presets

- If you want to add more presets for Instruct formats or hyperparameter Samplers, put the JSON file into the appropriate folder:
- Samplers go in `/public/api-presets/`
- Instruct formats go in`/public/instructFormats/`
- It's highly reccomended to review the structure of the default STMP preset files.
- SillyTavern preset files may not work, or may have unintended effects!

## Planned Features

### Core Functionality

- Smarter retry logic (add entity metadata to each chat message; only remove the last AI response)
- Custom OpenAI text completion compatible API endpoint selection

### Host Controls

- Toggle for locking AI chat for users? (this is already kind of done with AutoResponse off)
- Drag-sort list to set User Turn Order for AI chatting?
- Allow API key/Authentication information to be set via the UI.
- Ability to rename chats.
- ability to remove any message in the chat, not just the last.
- ability to edit the text of a chat
- ability for Host to edit a User's role from the UI
- ability to change the max length of chat inputs (currently 1000 characters)

### Low-priority but Nice-to-have Features

- Multiple AI characters active at once (group chats)
- Download chats as text, JSON, or SillyTavern-compatible JSONL?
- UI themes?
- Bridge extension for SillyTavern to enable intra-server communication.

# SillyTavern MultiPlayer (STMP)

SillyTavern MultiPlayer is an LLM chat interface that allows multiple users to chat together with an AI.
It also includes a sidebar chat for users only, and many tools for the Host to control the behavior of the AI and to moderate users.

Created by RossAscends

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
6. Open `http://localhost:8181/` in your web browser.

### Docker

- STMP can also be installed via Docker, thanks to [city-unit](https://github.com/city-unit).
- The [Docker](https://www.docker.com) file can be found in `/utils/`

(instructions coming soon)

<!-- - Obviously, the host must have a Text Completions compatible backend installed and working on their device.
- [TabbyAPI](https://github.com/theroyallab/tabbyAPI) and [KoboldCPP](https://github.com/LostRuins/koboldcpp) are confirmed to work with STMP's TC API mode.
- STMP assumes the default server URL of `http://127.0.0.1:5000/v1/completions` for TC requests.
- **KoboldCPP should be run with the --multiUser flag enabled.**
- If your TC API requires a key, paste it into `secrets.json`.
- Other OpenAI-compatible TC APIs are being tested. -->

### Using Horde

You can use Horde as an anonymous user, but that generally leads to slower queue times.

To use your Horde API key in STMP, add it to `secrets.json` like this (server should run at least once):

```js
{
    // some content
    "horde_key": "YourKeyHere",
    // some other content
}
```

Don't have one? Register [here](https://horde.koboldai.net/register) (it's free).

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
- Users with the Host role can hover over any chat message in either chats to see editing and deletion buttons.

## Hosting

The host will see the following controls:

### Control Panel (left side)

#### AI Controls

AI Config Section

- `Mode` can be clicked to switch between TC/CC mode, and HordeAI mode.
  - 📑 = Completions
  - 🧟 = Horde
- `Context` defines how long your API prompt should be. Longer = more chat history sent, but slower processing times.
- `Response` defines how many tokens long the AI response can be.
- `Streaming` togles streamed responses on or off.
- `AutoAI` Toggle to determine whether the AI should respond to every user input, or only on command from the Host.
- `Instruct` sets the type of instruct sequences to use when crafting the API prompt.
- `Sampler` sets the hyperparameter preset, which affects the response style.
- `API` selector to choose which LLM API to use, and an `Edit` button to change its configuration.
- `Models` allows selection of models served by the connected API.

Insertions Section

- `System Prompt` defines what will be placed at the very top of the prompt.
- `Author Note(D4)` defines what will be inserted as a system message at Depth 4 in the prompt.
- `Final Instruction(D1, "JB")` defines what to send as a system message at Depth 1 in the prompt. Not needed for TC APIs, but useful as a 'JB prompt' for CC APIs.

### Adding/Editing APIs

Currently STMP supports Text Completions (TC), Chat Completions (CC), and HordeAI via SillyTavern.

> External Text Completion and Chat Completion connections are currently a Work in Progress!
> We have tested connecting to OpenAI compatible APIs, as well as Anthropic's Claude.
> Most other LLM backends that provide an API in the same format should be compatible with STMP.

- [TabbyAPI](https://github.com/theroyallab/tabbyAPI) and [KoboldCPP](https://github.com/LostRuins/koboldcpp) are confirmed to work with STMP's TC API mode.
- [Oobabooga Textgeneration Webui](https://github.com/PygmalionAI/aphrodite-engine) works with their OpenAI-compatible CC API mode.
- [OpenRouter](https://openrouter.ai) is supported in CC mode.
- We suspect [Aphrodite](https://github.com/PygmalionAI/aphrodite-engine) should be compatible as well, but have not tested it yet.

1. select `Add new API` from the `API` selector to open the API Editing panel.
2. A new panel will be displayed with new inputs:

- `Name` - the label you want to remember the API as
- `Endpoint URL` - this is the base server URL for the LLM API. If the usual URL does not work, try adding `v1/` to the end.
- `Key` - If your API requires a key, put it in here.
- `Endpoint Type` - select from Text Completions or Chat Completions as appropriate for the API endpoint.
- `Claude` - select this if the API is based on Anthropic's Claude model, because it needs special prompt formatting.
- `Close` button will cancel the API editing/creating process and return you to the main AI Config panel.
- `Test` button sends a simple test message to the API to get a response. This may not work on all APIs.
- `Save` confirms the API addition/edit and saves it to the database.
- `Delete` removes the APi from the database.

3. When all of the fields are filled out, press `Save` to return to the main Control panel display.

#### Past Chats

- A list of past AI Chats, click one to load it.
- Information listed with each past session item:
  - AI characters in the chat history
  - number of messages in AI Chat
  - timestamp for the last message
- the list is ordered in reverse chronological (newest chats first)

### User List

- The right side of the screen contains two users lists, one for each of the chats.
- Users with the Host role will have a 🔑 next to their name.
- The AI Characters will have a 🤖 next to their names in the AI Chat User List.

#### Crowd Controls

- (🤖⏳) sets the number of seconds delay between inputs to the AI Chat.
- (🧑⏳) does the same, but for the User-to-User chat.
- During the delay period the (✏️) for that chat will become (🚫), and no input will be possible.

### Top Bar Controls

#### Left

- (🎛️) toggles visibility of the Host Control Panel.
- (🖼️) toggles the chat windows between three modes: maximize AI chat >> maximize User Chat >> return to normal dual display.
  - **this is very helpful for mobile users!**
- (📜) toggles display of both User lists.

#### Right

- (▶️/⏸️) allows for manual disconnect/reconnect to the server.
- (🛠️) opens a Profile management menu which contains:
  - Two text fields to change your displayed username in either the User Chat or AI Chat.
  - (🔑) opens a text box for input of the Host key in order to gain the Host role.
    - Once a vlid key has been entered, the page will automatically refresh to show the host controls.
    - **The Host key can be found in the server console at startup.**
    - After the user enters the key and presses Enter, their page will refresh and they will see the Host controls.
  - (⛔) clears the saved Usernames and UniqueID from localStorage.
    - If you are not the primary Host you will lose any roles you were given.
    - You will be asked to register a new username next time you sign in on the same browser.
  - (🔊) (only on mobile) will cause a 10 minute silent audio to play when you minimize the browser window, preventing the websocket from being disconnected while the window is minimized. This is played each time you minimize the app.

### In the Chat Windows

- AI Chat: a selector to set the active AI character
- Both chats: (🗑️) to clear either chat.
  - clearing the AI Chat will automatically create a new chat with the selected Character.

#### Above the AI Chat Input Bar

- (🤖) Manually triggering an AI response without user Input
- (✂️) Deleting the last message in the AI Chat
- (🔄) Retry, i.e. Remove the last chat message and prompt the AI character to give a new response.

### Managing Characters

- Place any SillyTavern compatible character card into the `/characters/` folder and restart the server.
  - We will add a way to add characters without restarting the server soon.
- Characters can be selected at the top of the AI Chat panel.
- Characters can be swapped at any time without resetting the chat, allowing you to manually simulate a group chat.

#### Editing Characters

- Hosts will see a (🧠) next to the Character Selector. This will open a popup with the character definitions.
- STMP only handles three types of character definitions:
  - `Name` - What is displayed as the character's name in the chat.
  - `Description` - What goes into the prompt at either the top, or at D4 if 'D4 Char Defs' box is checked.
  - `First Message` - What gets auto-inserted into a new chat with that character.
- `Save` will update the character definitions.
- `Close` will close the popup with no changes.

>What about Personality, Scenario, and Example Messages?

- Personality and Scenario are outdated distinctions without a meaningful purpose, and should be incorporated into the Description.
- Example Message can also be incorporated into the Description. We recommend doing so in the form of [AliChat](https://discord.com/channels/553948136629075968/1137875580457590884/1198559176935354508).

>What about v2 Card Spec values?

STMP will read from the v2 spec values if they are present, but will only write to the v1 card spec space.

>What about embedded lorebooks?

Incorporating embedded lorebooks is under consideration.

### Adding Presets

- If you want to add more presets for Instruct formats or hyperparameter Samplers, put the JSON file into the appropriate folder:
- Samplers go in `/public/api-presets/`
- Instruct formats go in`/public/instructFormats/`
- **It's highly reccomended to review the structure of the default STMP preset files.**
- SillyTavern preset files may not work, or may have unintended effects!

## Planned Features

### Core Functionality

- Smarter retry logic (add entity metadata to each chat message; only remove the last AI response)

### Host Controls

- Toggle for locking AI chat for users? (this is already kind of done with AutoResponse off)
- Drag-sort list to set User Turn Order for AI chatting?
- Ability to rename chats.
- ability for Host to edit a User's role from the UI
- ability to change the max length of chat inputs (currently 1000 characters)
- make control for AI replying every X messages
- make control for host, to autoclear chat every X messages
- disallow names that are only spaces, punctuations, or non ASCII (non-Latin?) characters
  - require at least 3? A-Za-z characters
- disallow registering of names that are already in the DB

### Quality of Life

- make control for guests to clear DISPLAY of either chat (without affecting the chat database) to prevent browser lag
- highlight exact username matches in AI response with their color
- fade out users in user chat list who havent chatted in X minutes (add a css class with opacity 50%)
- fade out users in ai chat list who are no longer connected, or are faded out in user list (same)
- show which users in the User Chat are using which name in the AI Chat
- add a link to the User message that the AI is responding to at the top of each AI message.
- When an AI resposne is triggered by UserX's input, UserX sees that response highlighted in the chat

### Low-priority but Nice-to-have Features

- Multiple AI characters active at once (group chats)
- Download chats as text, JSON, or SillyTavern-compatible JSONL?
- UI themes?
- Bridge extension for SillyTavern to enable intra-server communication.

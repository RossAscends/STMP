# SillyTavern MultiPlayer (STMP)

SillyTavern MultiPlayer is a multiuser LLM chat interface created by RossAscends.

- Supporting donations are greatly appreaciated and can be made to either Ross's [Ko-fi](https://ko-fi.com/rossascends) or [Patreon](https://www.patreon.com/RossAscends).
- For support or to contact RossAscends directly, join the [SillyTavern Discord](https://discord.gg/sillytavern).

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

## API Setup

Currently STMP supports Tabby and HordeAI, with Tabby active by default.

**NOTE:** Initial API parameters are sent by the Client and processed in the Server.

### Using Tabby

- Obviously, the host must have Tabby installed and working on their device. Instructions for this can be found on the [TabbyAPI Github](https://github.com/theroyallab/tabbyAPI).
- STMP assumes the default server URL of `http://127.0.0.1:5000/v1/completions` for Tabby requests.
- Copy the TabbyAPI key from the Tabby console and paste it into `secrets.json`.

### Using Horde

- Using Horde requires a SillyTavern server to be running on your local machine to handle the Horde requests.
- **IMPORTANT: ST must be running with CSRF turned off.**
- **IMPORTANT:** STMP assumes you have BasicAuthentication enabled on your ST server, and requires you to input your `username:pass` into `secrets.json`.
- STMP assumes the default ST server URL of `http://127.0.0.1:8000/api/horde/generate-text` for Horde requests.
- If you have a HordeID set in SillyTavern, those credentials and kudos will be used.

### Changing API

- The Host can click the emoji icon at the top left to change which API is used.
- 🐈 = Tabby text completions
- 🧟 = Horde

## Multiuser Setup

This must be done AFTER completing all installation steps above.

1. Run `Remote-Link.cmd` to download (only one time, 57MB) and run `cloudflared.exe` to get a randomly generated tunnel URL for your server.
2. Share the generated clourflared URL with the guest users.
3. User will be able to directly and securely connect to your PC using the Cloudflare URL.

## Use

### Adding Characters

- Place any SillyTavern compatible character card into the `/characters/` folder and refresh the page.
- Character can be selected at the top left of the AI Chat panel.
- If new characters are added while the server is running, the Host must refresh their browser page to see them.

### Changing Characters

- the AI character can be changed at any time without resetting the chat.

### Chatting

- Chatting can be done in either chat windows by typing into the appropriate box and then either pressing the Send button (✏️), or pressing Enter.
- `Shift+Enter` can be used to add newlines to the input.
- [Markdown formatting](https://github.com/showdownjs/showdown/wiki/Showdown%27s-Markdown-syntax) is respected.
- Pressing the retry button (🔄) will remove the last chat message and prompt the AI character to give a new response.

### Hosting

The host will see controls on the left for:

- Changing API controls such as: API (Tabby(🐈) or horde(🧟)), context size, response length, Sampler presets, Instruct formats
- Changing the active AI character
- Manually triggering an AI response without user Input (🤖💬)
- Toggle to determine whether the AI should respond to every user input (AutoResponse)
- Clearing either chat windows (🗑️)
- Deleting the last message in the AI Chat (✂️)
- A text box to define the final Instruction to send as system at Depth 1 in the prompt.

### Changing usernames

Use the text boxes at the top of the screen to change your username(s) at any time.
You can have a different name for the User Chat and AI Chat.
Usernames are stored in browser localStorage, and can be cleared using the inverted pencil (✏️) button at the top right.

## Planned Features

### Core Functionality

- Smarter retry logic (add entity metadata to each chat message; only remove the last AI response)
- Ability to load old chat files

### Host Controls

- Toggle for locking AI chat for users? (this is already kind of done with AutoResponse off)
- Drag-sort list to set User Turn Order for AI chatting?
- Move API parameter creation fully into the server

### Low-priority but Nice-to-have Features

- Multiple AI characters active at once (group chats)
- Exporting chat files as text or JSON?
- UI themes

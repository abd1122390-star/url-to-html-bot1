# HTML Decoder Bot

Telegram bot for decoding the custom obfuscated HTML format used by the supplied sample.

## Supported format

The decoder expects these values inside the HTML:

- `_stdB64`
- `_emjList`
- `_pData`
- `_sA = 227`, `_sB = 35`, `_sC = 25`

It reverses the symbol mapping, Base64-decodes the payload, reverses the byte transform, and writes the resulting UTF-8 HTML.

The decoder never executes the decoded HTML.

## Run locally

1. Install Node.js 18+.
2. Create a Telegram bot with BotFather and copy its token.
3. Set `BOT_TOKEN`.
4. Run `npm start`.
5. Send the bot an `.html`/`.htm` file as a document.

## Railway

Create a Railway service from this repository and add the environment variable:

`BOT_TOKEN=your_bot_token`

The start command is already `node bot.js`.

## GitHub

Upload all project files to a new repository. Do not upload `.env` or your real bot token.

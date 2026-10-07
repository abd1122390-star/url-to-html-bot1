# HTML Decoder Bot

Install:
pip install -r requirements.txt

Set BOT_TOKEN to your BotFather token, then run:
python bot.py

The bot accepts HTML/HTM files and attempts:
- HTML entity decoding
- JavaScript \xNN / \uNNNN decoding
- Base64 string decoding
- common 64-symbol custom Base64 mappings
- basic JavaScript beautification

It cannot guarantee recovery of real encryption, secret-key protected data,
or server-side code.

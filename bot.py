import os, re, html, base64, tempfile
from pathlib import Path
from telegram import Update, InputFile
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters

BOT_TOKEN = os.getenv("BOT_TOKEN", "PUT_YOUR_BOT_TOKEN_HERE")
MAX_FILE_SIZE = 10 * 1024 * 1024

def decode_js_escapes(s):
    s = re.sub(r"\\x([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1),16)), s)
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1),16)), s)

def try_b64(s):
    s = re.sub(r"\s+", "", s)
    if len(s) < 16 or len(s) % 4 or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", s):
        return None
    try:
        out = base64.b64decode(s, validate=True).decode("utf-8")
        if out and sum(c.isprintable() or c in "\r\n\t" for c in out)/len(out) > .85:
            return out
    except Exception:
        pass
    return None

def symbol_maps(src):
    found = []
    pat = re.compile(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[(.*?)\]\s*;", re.S)
    for m in pat.finditer(src):
        vals = []
        for x in re.finditer(r'"((?:\\.|[^"\\])*)"|\'((?:\\.|[^\'\\])*)\'', m.group(2)):
            v = x.group(1) if x.group(1) is not None else x.group(2)
            try: v = bytes(v, "utf-8").decode("unicode_escape")
            except Exception: pass
            vals.append(v)
        if len(vals) == 64:
            alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
            found.append(dict(zip(vals, alphabet)))
    return found

def custom_decode(src):
    result = src
    for mp in symbol_maps(src):
        pat = re.compile(r'(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*"((?:\\.|[^"\\])*)"\s*;', re.S)
        for m in pat.finditer(src):
            value = m.group(1)
            if len(value) < 40: continue
            mapped = "".join(mp.get(c, c) for c in value)
            try:
                decoded = base64.b64decode(mapped, validate=False).decode("utf-8")
                if len(decoded) > 20:
                    result += "\n\n<!-- DECODER RECOVERED PAYLOAD -->\n" + decoded + "\n<!-- END RECOVERED PAYLOAD -->\n"
            except Exception:
                pass
    return result

def beautify_js(js):
    out, token, indent, quote, esc = [], [], 0, None, False
    def flush():
        t = "".join(token).strip()
        if t: out.append("    "*indent + t)
        token.clear()
    for ch in js:
        if quote:
            token.append(ch)
            if esc: esc = False
            elif ch == "\\": esc = True
            elif ch == quote: quote = None
        elif ch in "\"'`":
            quote = ch; token.append(ch)
        elif ch == "{":
            token.append(" {"); flush(); indent += 1
        elif ch == "}":
            flush(); indent = max(0, indent-1); out.append("    "*indent + "}")
        elif ch == ";":
            token.append(";"); flush()
        elif ch == "\n":
            flush()
        else: token.append(ch)
    flush()
    return "\n".join(out)

def decode_document(src):
    text = src
    for _ in range(3):
        new = html.unescape(text)
        if new == text: break
        text = new
    text = decode_js_escapes(text)
    text = custom_decode(text)

    def repl(m):
        dec = try_b64(m.group(2))
        return m.group(1) + dec + m.group(1) if dec else m.group(0)

    text = re.sub(r"([\"'])([A-Za-z0-9+/]{24,}={0,2})\1", repl, text)

    def script(m):
        return "<script>\n" + beautify_js(m.group(1)) + "\n</script>"

    return re.sub(r"<script\b[^>]*>(.*?)</script>", script, text, flags=re.I|re.S)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🔓 HTML Decoder Bot\n\n"
        "একটি .html/.htm ফাইল পাঠাও।\n"
        "HTML entity, JS escape, Base64, কিছু custom symbol mapping "
        "এবং basic JS beautification করার চেষ্টা করবে.\n\n"
        "⚠️ Real encryption বা secret-key/server-side protection থাকলে "
        "পুরো original source ফেরত পাওয়া নাও যেতে পারে."
    )

async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc.file_name.lower().endswith((".html", ".htm")):
        await update.message.reply_text("শুধু .html বা .htm ফাইল পাঠাও।")
        return
    if doc.file_size and doc.file_size > MAX_FILE_SIZE:
        await update.message.reply_text("ফাইল সর্বোচ্চ 10 MB হতে পারবে।")
        return

    msg = await update.message.reply_text("⏳ Decode/beautify করছি...")
    with tempfile.TemporaryDirectory() as td:
        inp = Path(td) / "input.html"
        out = Path(td) / ("decoded_" + Path(doc.file_name).name)
        tg = await context.bot.get_file(doc.file_id)
        await tg.download_to_drive(inp)
        try:
            decoded = decode_document(inp.read_text(encoding="utf-8", errors="replace"))
            out.write_text(decoded, encoding="utf-8")
            await msg.edit_text("✅ Done — decoded HTML পাঠাচ্ছি।")
            with out.open("rb") as fp:
                await update.message.reply_document(
                    document=InputFile(fp, filename=out.name),
                    caption="🔓 Decoded/beautified HTML"
                )
        except Exception as e:
            await msg.edit_text("❌ Error: " + str(e)[:500])

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        decoded = decode_document(update.message.text or "")
        if len(decoded) > 3900:
            decoded = decoded[:3900] + "\n[output truncated]"
        await update.message.reply_text(decoded)
    except Exception as e:
        await update.message.reply_text("❌ Decode error: " + str(e)[:500])

def main():
    if BOT_TOKEN == "PUT_YOUR_BOT_TOKEN_HERE":
        raise SystemExit("Set BOT_TOKEN environment variable first.")
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    print("HTML Decoder Bot is running...")
    app.run_polling()

if __name__ == "__main__":
    main()

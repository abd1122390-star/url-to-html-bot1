const http = require('http');
const { decodeObfuscatedHtml } = require('./decoder');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN environment variable is missing.');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;
let offset = 0;
let stopping = false;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `Telegram API error: ${method}`);
  return data.result;
}

async function downloadTelegramFile(filePath) {
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${filePath}`);
  if (!res.ok) throw new Error(`File download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function sendDocument(chatId, buffer, filename, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', new Blob([buffer], { type: 'text/html; charset=utf-8' }), filename);
  if (caption) form.append('caption', caption);
  const res = await fetch(`${API}/sendDocument`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'sendDocument failed');
  return data.result;
}

async function sendMessage(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text });
}

function isHtmlDocument(doc) {
  const name = (doc.file_name || '').toLowerCase();
  return name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.txt');
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  if (msg.text === '/start') {
    await sendMessage(chatId,
      'HTML Decoder Bot\n\nSend an obfuscated .html/.htm file as a document. I will decode the supported custom symbol + Base64 + byte-transform format and return the decoded HTML.\n\nThe file is decoded as data; it is never executed by the bot.'
    );
    return;
  }

  if (!msg.document) {
    await sendMessage(chatId, 'Please send the HTML file as a document (.html or .htm).');
    return;
  }

  if (!isHtmlDocument(msg.document)) {
    await sendMessage(chatId, 'Supported files: .html, .htm, or .txt');
    return;
  }

  const originalName = msg.document.file_name || 'input.html';
  const base = originalName.replace(/\.(html?|txt)$/i, '') || 'decoded';
  const outputName = `${base}_decoded.html`;

  await sendMessage(chatId, '🔄 Decoding started...');

  try {
    const file = await tg('getFile', { file_id: msg.document.file_id });
    const input = await downloadTelegramFile(file.file_path);
    const source = input.toString('utf8');
    const decoded = decodeObfuscatedHtml(source);
    const output = Buffer.from(decoded, 'utf8');

    await sendDocument(chatId, output, outputName,
      `✅ Decoded successfully\n${outputName}`
    );
  } catch (err) {
    console.error(err);
    await sendMessage(chatId,
      `❌ Decode failed.\n\n${err.message}\n\nThis bot currently supports the custom _stdB64 + _emjList + _pData format used by the sample decoder.`
    );
  }
}

async function poll() {
  while (!stopping) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        try { await handleUpdate(update); }
        catch (err) { console.error('Update error:', err); }
      }
    } catch (err) {
      console.error('Polling error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

const port = Number(process.env.PORT || 3000);
http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('HTML Decoder Bot is running.');
}).listen(port, () => console.log(`Health server listening on ${port}`));

process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });

poll();

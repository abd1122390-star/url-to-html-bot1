const fs = require('fs');

function extractQuoted(source, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`, 's');
  const m = source.match(re);
  if (!m) throw new Error(`Could not find ${name}`);
  return JSON.parse(m[1]);
}

function extractArray(source, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(\\[(?:\\\\.|[^\\[\\]\\\\]|\\n|\\r)*\\])\\s*;`, 's');
  const m = source.match(re);
  if (!m) throw new Error(`Could not find ${name}`);
  return JSON.parse(m[1]);
}

function decodeObfuscatedHtml(source) {
  const stdB64 = extractQuoted(source, '_stdB64');
  const emjList = extractArray(source, '_emjList');
  const pData = extractQuoted(source, '_pData');

  if (emjList.length !== stdB64.length) {
    throw new Error(`Mapping length mismatch: ${emjList.length} vs ${stdB64.length}`);
  }

  const map = new Map();
  for (let i = 0; i < emjList.length; i++) map.set(emjList[i], stdB64[i]);
  map.set('•', '=');

  let rawB64 = '';
  for (const ch of Array.from(pData)) rawB64 += map.get(ch) ?? ch;

  // Buffer is intentionally used instead of executing the HTML.
  const bin = Buffer.from(rawB64, 'base64');
  if (!bin.length) throw new Error('Decoded Base64 payload is empty or invalid.');

  const out = Buffer.alloc(bin.length);
  let curA = 227;
  let curB = 35;
  const curC = 25;

  for (let k = 0; k < bin.length; k++) {
    let val = bin[k];
    val = (val ^ (k & 255)) & 255;
    val = (val - curB + 256) & 255;
    val = (val ^ curA) & 255;
    out[k] = val;
    curA = (curA * 3 + curC) & 255;
    curB = (curB + 19) & 255;
  }

  return out.toString('utf8');
}

if (require.main === module) {
  const input = process.argv[2];
  const output = process.argv[3] || 'decoded.html';
  if (!input) {
    console.error('Usage: node decoder.js input.html [output.html]');
    process.exit(1);
  }
  try {
    const source = fs.readFileSync(input, 'utf8');
    const decoded = decodeObfuscatedHtml(source);
    fs.writeFileSync(output, decoded, 'utf8');
    console.log(`Decoded successfully: ${output} (${Buffer.byteLength(decoded, 'utf8')} bytes)`);
  } catch (err) {
    console.error(`Decode failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { decodeObfuscatedHtml };

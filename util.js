const { fetch } = require('cross-fetch');
const crypto = require('crypto');

const CAPTCHA_BASE_URL = "https://captcha.astralcredits.repl.co";

async function get_text_captcha() {
  let resp;
  try {
    resp = await fetch(CAPTCHA_BASE_URL+"/captcha");
  } catch (e) {
    console.log(e);
    return false;
  }
  resp = await resp.json();
  return {
    challenge_url: CAPTCHA_BASE_URL+"/challenge/"+resp.image+"?nonce="+resp.nonce,
    challenge_code: resp.code,
    challenge_nonce: resp.nonce
  };
}

async function verify_text_captcha(code, nonce, answer) {
  const params = new URLSearchParams({ code: code, nonce: nonce, guess: answer });
  let resp;
  try {
    resp = await fetch(CAPTCHA_BASE_URL+"/captcha", { method: 'POST', body: params });
  } catch (e) {
    console.log(e);
    return false;
  }
  return (await resp.json()).success;
}

function format_commas(amount) {
  if (isNaN(Number(amount))) {
    return amount;
  }
  let before_dec = String(amount).split('.')[0];
  let amount_mod = before_dec;
  //iterate the amount of commas there are
  for (let i=0; i < Math.floor((before_dec.length-1)/3); i++) {
    let position = amount_mod.length-3*(i+1)-i;
    amount_mod = amount_mod.substring(0, position)+","+amount_mod.substring(position, amount_mod.length);
  }
  if (String(amount).split('.')[1]) {
    amount_mod = amount_mod+"."+String(amount).split('.')[1];
  }
  return amount_mod;
}

function pad_hex(hex, desired) {
  if (hex.length < desired) {
    hex = "0".repeat(desired-hex.length)+hex;
  } else {
    return hex;
  }
}

//so apparently you can BigInt("0xff") but whatever
function hex_to_bigint(hex) {
  hex = hex.replace("0x", "");
  let chars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
  let total = BigInt(0);
  for (let i=0; i < hex.length; i++) {
    total += BigInt(chars.indexOf(hex[i].toUpperCase()))*BigInt(16)**BigInt(hex.length-i-1);
  }
  return total;
}

function bigint_to_hex(int) {
  let nibbles = BigInt(0);
  while (true) {
    nibbles++;
    if (int < BigInt(16)**nibbles) break;
  }
  let chars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
  let hex = "";
  for (let i=0; i < nibbles; i++) {
    //bigint automatically rounds down after division (equivalent to a Math.floor())
    let char_index = int/(BigInt(16)**(nibbles-BigInt(i+1)));
    hex += chars[char_index];
    //so despite what this looks like, it is not int -= int, because of the rounding down
    int -= char_index*BigInt(16)**(nibbles-BigInt(i+1));
  }
  return hex;
}

function uint8_to_hex(uint8) {
  let chars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
  let hex = "";
  //each uint8 element is a byte, and two hex chars is one byte, so...
  for (let i=0; i < uint8.length; i++) {
    hex += chars[Math.floor(uint8[i]/16)];
    hex += chars[uint8[i]%16];
  }
  return hex;
}

function hex_to_uint8(hex) {
  //get it to an even length
  if (hex.length%2 === 1) {
    hex = "0"+hex;
  }
  let chars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
  let uint = new Uint8Array(hex.length/2);
  for (let i=0; i < hex.length/2; i++) {
    uint[i] += chars.indexOf(hex[i*2])*16;
    uint[i] += chars.indexOf(hex[i*2+1]);
  }
  return uint;
}

function hash(hex) {
  let hash = crypto.createHash("sha256");
  hash.update(hex_to_uint8(hex));
  return hash.digest("hex").toUpperCase();
}

//16 bytes random nonce for coinflip
function gen_server_nonce() {
  return uint8_to_hex(new Uint8Array(crypto.randomBytes(16).buffer));
}

function valid_domain_name(domain) {
  if (
    domain.includes(".") ||
    domain.includes(" ") ||
    domain.includes("%") ||
    domain.includes("&") ||
    domain.includes("?") ||
    domain.includes("#") ||
    domain.includes("/") ||
    domain.includes(",") ||
    domain.includes("\\") || 
    domain.includes("­") || 
    domain.includes("	") || 
    domain.includes("͏") || 
    domain.includes("؜") || 
    domain.includes("܏") || 
    domain.includes("ᅟ") || 
    domain.includes("ᅠ") || 
    domain.includes(" ") || 
    domain.includes("឴") || 
    domain.includes("឵") || 
    domain.includes("᠎") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes("​") || 
    domain.includes("‌") || 
    domain.includes("‍") || 
    domain.includes("‎") || 
    domain.includes("‏") || 
    domain.includes(" ") || 
    domain.includes(" ") || 
    domain.includes("⁠") || 
    domain.includes("⁡") || 
    domain.includes("⁢") || 
    domain.includes("⁣") || 
    domain.includes("⁤") || 
    domain.includes("⁪") || 
    domain.includes("⁫") || 
    domain.includes("⁬") || 
    domain.includes("⁭") || 
    domain.includes("⁮") || 
    domain.includes("⁯") || 
    domain.includes("　") || 
    domain.includes("⠀") || 
    domain.includes("ㅤ") || 
    domain.includes("ﾠ") || 
    domain.includes("𑂱") || 
    domain.includes("𛲠") || 
    domain.includes("𛲡") || 
    domain.includes("𛲢") || 
    domain.includes("𛲣") || 
    domain.includes("𝅙") || 
    domain.includes("𝅳") || 
    domain.includes("𝅴") || 
    domain.includes("𝅵") || 
    domain.includes("𝅶") || 
    domain.includes("𝅷") || 
    domain.includes("𝅸") || 
    domain.includes("𝅹") || 
    domain.includes("𝅺") || 
    domain.includes("") || 
    domain.includes("") || 
    domain.includes("")
  ) {
    return false;
  } else {
    return true;
  }
}

module.exports = {
  get_text_captcha,
  verify_text_captcha,
  format_commas,
  hex_to_bigint,
  bigint_to_hex,
  uint8_to_hex,
  hex_to_uint8,
  pad_hex,
  hash,
  gen_server_nonce,
  valid_domain_name,
};

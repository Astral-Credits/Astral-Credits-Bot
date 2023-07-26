const { fetch } = require('cross-fetch');

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

module.exports = {
  get_text_captcha: get_text_captcha,
  verify_text_captcha: verify_text_captcha,
  format_commas: format_commas
};

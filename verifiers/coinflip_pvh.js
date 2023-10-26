/*
  First, let me explain how this player versus house coinflip works.
  1. The player inputs their selection of either "Heads" or "Tails", and chooses an amount to wager.
  2. The bot generates 16 random bytes as a server nonce. That nonce is hashed, and the hash is shown to everyone.
  3. Player clicks a button, which opens a modal, and they enter random input in.
  4. Once the player has submitted their random input, the bot hashes the player's random input, adds that to the server nonce, and hashes it.
  5. If the resulting hash (as a number from 0 to 2**256-1) is greater than or equal to 2**255, whoever is "Heads" wins, if the resulting hash is less than 2**255, than whoever is "Tails" wins.

  The random input of the player should prevent the house from rigging the coinflip.

  None of us are cryptographic experts so please let us know if you find any flaws. Here is some sample code that verifies the process:
*/

const crypto = require('crypto');

const server_nonce_hash = "fill in the server nonce hash here";

const server_nonce = "fill in the claimed server nonce here";

const player_random = "player 1 random here"; //copy the message id of the "... joined the bet!" message

const claimed_decimal = 0.50; //change this

const claimed_result = "heads"; //or "tails"

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

function hex_to_uint8(hex) {
  hex = hex.toUpperCase();
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

console.log(hash(server_nonce).toUpperCase(), server_nonce_hash);
if (hash(server_nonce).toUpperCase() === server_nonce_hash) {
  console.log("Verified server nonce hash");
} else {
  console.log("Could NOT verify server nonce hash");
  process.exit();
}

const cfpvh_number = hex_to_bigint(hash(Buffer.from(player_random).toString("hex")+server_nonce));

console.log(cfpvh_number);

const decimal_two_places = Number((cfpvh_number*BigInt(100))/(BigInt(2)**BigInt(256)))/100;
console.log(decimal_two_places, claimed_decimal);
if (decimal_two_places === claimed_decimal) {
  console.log("Verified the output (decimal two places matched)");
} else {
  console.log("Could NOT verify the output (decimal places did not match)");
  process.exit();
}

if (cfpvh_number < BigInt(2)**BigInt(255) && claimed_result === "tails") {
  console.log("Confirmed that result is tails.");
} else if (cfpvh_number < BigInt(2)**BigInt(255)) {
  console.log("Result should be tails, NOT heads");
  process.exit();
}

if (cfpvh_number >= BigInt(2)**BigInt(255) && claimed_result === "heads") {
  console.log("Confirmed that result is heads.");
} else if (cfpvh_number >= BigInt(2)**BigInt(255)) {
  console.log("Result should be heads, NOT tails");
  process.exit();
}

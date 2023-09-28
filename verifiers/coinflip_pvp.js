/*
  First, let me explain how this player versus player coinflip works.
  1. Player 1 inputs their selection of either "Heads" or "Tails", and chooses an amount to wager.
  2. The bot generates 16 random bytes as a server nonce. That nonce is hashed, and the hash is shown to everyone.
  3. Player 1 and 2, in any order, click a button.
  4. The bot sends a public message announcing each player's join. The two message's discord message id (a number) is recorded
  5. Once both players have clicked the button, the bot hashes player 1's message id, adds it to player 2's message id, adds that to the server nonce, and hashes it.
  6. If the resulting hash (as a number from 0 to 2**256-1) is greater than or equal to 2**255, whoever is "Heads" wins, if the resulting hash is less than 2**255, than whoever is "Tails" wins.

  Consider the following possible scenarios:
  - One player tries to rig the result. They cannot, because they do not know the server nonce, and therefore the output of the hash is unpredictable.
  - The bot tries to rig the result. The bot cannot rig the result by finding what the two message ids are, then changing it's server nonce, because it tells everyone the hash of the server nonce before it knows the two message ids. This means that anyone can prove that the bot did not change the nonce once it saw the two message ids.
  - Bot and Player X work together to rig result. Bot could secretly tell Player X what the server nonce is. Then, Player X could wait until the other player clicks the button, and see what their message id is. However since discord message ids have elements of randomness that neither player has control over, the message id from Player X's button click should not be able to be predicted, and so the result should not be able to be rigged.

  Notably, this scheme relies on the bot not being able to predict (and therefore decide) what the discord message ids are. Although discord message ids are not meant to be random (https://discord.com/developers/docs/reference#snowflakes), we think they are random enough for this purpose.

  None of us are cryptographic experts so please let us know if you find any flaws. Here is some sample code that verifies the process:
*/

const crypto = require('crypto');

const server_nonce_hash = "fill in the server nonce hash here";

const server_nonce = "fill in the claimed server nonce here";

const player1_message_id = "player 1 message id here"; //copy the message id of the "... joined the bet!" message

const player2_message_id = "player 2 message id here"; //copy the message id of the "... joined the bet!" message

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

console.log(hash(BigInt(player1_message_id).toString(16)+BigInt(player2_message_id).toString(16)+server_nonce), BigInt(player1_message_id).toString(16)+BigInt(player2_message_id).toString(16)+server_nonce)
const cfpvp_number = hex_to_bigint(hash(BigInt(player1_message_id).toString(16)+BigInt(player2_message_id).toString(16)+server_nonce));

console.log(cfpvp_number);

const decimal_two_places = Number((cfpvp_number*BigInt(100))/(BigInt(2)**BigInt(256)))/100;
console.log(decimal_two_places, claimed_decimal);
if (decimal_two_places === claimed_decimal) {
  console.log("Verified the output (decimal two places matched)");
} else {
  console.log("Could NOT verify the output (decimal places did not match)");
  process.exit();
}

if (cfpvp_number < BigInt(2)**BigInt(255) && claimed_result === "tails") {
  console.log("Confirmed that result is tails.");
} else if (cfpvp_number < BigInt(2)**BigInt(255)) {
  console.log("Result should be tails, NOT heads");
  process.exit();
}

if (cfpvp_number >= BigInt(2)**BigInt(255) && claimed_result === "heads") {
  console.log("Confirmed that result is heads.");
} else if (cfpvp_number >= BigInt(2)**BigInt(255)) {
  console.log("Result should be heads, NOT tails");
  process.exit();
}

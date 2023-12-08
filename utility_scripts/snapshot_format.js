const fs = require("fs");

let snapshot = JSON.parse(fs.readFileSync("snapshot.json"));

let formatted = "";

for (let i = 0; i < Object.keys(snapshot).length; i++) {
  let tipbot_address = Object.keys(snapshot)[i];
  formatted += `<@${snapshot[tipbot_address].user}>: ${tipbot_address}\n`;
}

fs.writeFileSync("snapshot_formatted.txt", formatted);

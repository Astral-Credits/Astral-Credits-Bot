const http = require("http");
const db = require("./db.js");

const MAX_CLAIMS_PER_MONTH = 11111;
//1678190400 is Tues 07MAR2023 12:00:00
//const FAUCET_OPEN_DATE = 1678190400;

let cache = {};

http.createServer(async function (req, res) {
  if (req.url === "/linked_websites.json") {
    res.writeHead(200, {
      'Content-Type': "application/json",
      'Access-Control-Allow-Origin': "https://www.astralcredits.xyz",
    });
    let all_linked;
    //one minute cache
    if (cache.all_linked && Date.now() < cache.all_linked.timestamp + 60 * 1000) {
      all_linked = cache.all_linked.content;
    } else {
      all_linked = await db.get_all_linked_websites();
      for (let i=0; i < all_linked.length; i++) {
        delete all_linked[i]._id;
        all_linked[i].address = all_linked[i].address.toLowerCase();
      }
      cache.all_linked = {
        content: all_linked,
        timestamp: Date.now(),
      };
    }
    res.write(JSON.stringify(all_linked));
  } else if (req.url === "/uses_left") {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': "https://www.astralcredits.xyz",
    });
    let uses_left;
    //one minute cache
    if (cache.uses_left && Date.now() < cache.uses_left.timestamp + 60 * 1000) {
      console.log("used cache")
      uses_left = cache.uses_left.content;
    } else {
      uses_left = String(MAX_CLAIMS_PER_MONTH - await db.get_claims_this_month());
      cache.uses_left = {
        content: uses_left,
        timestamp: Date.now(),
      };
    }
    res.write(uses_left);
  } else {
    res.write("Starting...");
    res.write("I'm alive. Nice!");
  }
  res.end();
}).listen(8080);

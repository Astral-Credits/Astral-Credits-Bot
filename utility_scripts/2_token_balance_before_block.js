/*
BlazeSwap sRIBBITS/WSGB:      0x0697996b603cb417c016c7cb599e6e0a1b1f656e
Oracleswap sRIBBITS/WSGB:     0x0257781e4a628274040e88ed1540d55058dd9f3b
FeatherSwap sRIBBITS/XAC:     0x27cc2efd60c20df64ac54ec163cf3eedfe5de085
Oracleswap sRIBBITS/SPRK:     0x559d1274959db5d2b7c0bc1f8b16dd727d306cd6
XenosSwap sRIBBITS/WSGB:      0xc36d0b3f7cc6e1b43a02d6266490384cf2dd52d6
OracleSwap sRIBBITS/Oracle:   0xe01c8a4ac28c7ae4b94ff03c6283f9f8cef0888c
OracleSwap PRO/sRIBBITS:      0x08948a3373338f81530d90475a280ed2a63f83ee
OracleSwap Liz/sRIBBITS:      0x0d358e61035072e4a8f68d0d04923f247d3d2693
OracleSwap sRIBBITS/OL:       0x657b01b500538b96f5640dd8f8248e6778fbb8cf
Blazeswap TsRIBBITS/sRIBBITS: 0xd1f8275bcc18d933f16e69f584c731b93a142c36
*/
(async () => {
  const { readFileSync, writeFileSync } = require("fs");

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const end_block = 69180974;

  const token_address = "0xd1f8275bcc18d933f16e69f584c731b93a142c36";

  let balances = {};

  const base = "https://songbird-explorer.flare.network";
  let next = `/token/${token_address}/token-transfers?type=JSON`;
   
  try {
    //why won't it let me do { balances, next } =
    const backup = JSON.parse(readFileSync(`./progress-${token_address}.json`, "utf-8"));
    balances = backup.balances;
    next = backup.next;
    console.log("restored progress from backup");
  } catch (e) {}

  let i = 0;

  while (true) {
    console.log(`New page ${base}${next} ${++i}`);
    const resp = await (await fetch(`${base}${next}`)).json();
    for (const item of resp.items) {
      const type = item.split("<span class=\"tile-label\">\n\n")[1].split("\n\n")[0];
      const hash = item.split("/tx/")[1].split("\"")[0];
      const amount = Number(item.split("<span class=\"tile-title\">\n\n")[1].split("\n <a data-test=\"token_link\"")[0].replaceAll(",", ""));
      const m = item.split("<a data-test=\"address_hash_link\" href=\"/address/");
      const from = m[1].split("/tokens")[0];
      const to = m[2].split("/tokens")[0];
      const block_num = item.split("/block/")[1].split("\"")[0];
      if (block_num >= end_block) {
        console.log("skipping");
        continue;
      }
      console.log(type, hash, amount, from, to);
      if (!balances[from]) balances[from] = 0;
      if (!balances[to]) balances[to] = 0;
      balances[to] += amount;
      if (type !== "Token Minting") {
        balances[from] -= amount;
      }
    }
    next = resp.next_page_path + "&type=JSON";
    await sleep(2000);
    if (resp.next_page_path === null) break;
    writeFileSync(`./progress-${token_address}.json`, JSON.stringify({
      balances,
      next,
    }, null, 2));
  }

  for (const owner of Object.keys(balances)) {
    if (balances[owner] < 0.5) delete balances[owner];
  }
  writeFileSync(`./rsnapshot-${token_address}.json`, JSON.stringify(balances, null, 2));
})();


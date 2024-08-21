pragma solidity 0.8.19;

interface IERC20 {
  function transferFrom(address sender, address recepient, uint256 amount) external returns (bool);
  function allowance(address owner, address spender) external view returns (uint256);
}

contract AstralCreditsAirdrop {
  struct Airdrop {
    address creator;
    address token_address; //0x0 if native send
    uint256 amount;
    uint8 max_participants; //no more than 255
    uint256 end_timestamp;
    address[] participants;
    bool ended; //ended and paid out
  }

  uint256 private counter = 0;
  mapping(uint256 => Airdrop) public airdrops;
  address public immutable signer_address;
 
  event AirdropStart(
    uint256 id
  );
  event AirdropEnd(
    uint256 id
  );

  constructor(address _signer_address) {
    signer_address = _signer_address;
  }

  function native_start(uint64 end_timestamp, uint8 max) external payable {
    counter++;
    address[] memory empty;
    airdrops[counter] = Airdrop(msg.sender, 0x0000000000000000000000000000000000000000, msg.value, max, end_timestamp, empty, false);
    emit AirdropStart(counter);
  }

  function token_start(uint64 end_timestamp, uint8 max, uint256 amount, address token_address) external returns (uint256) {
    require(amount > 0, "Cannot airdrop nothing");
    //check allowance (will need to be checked again at end but w/e)
    IERC20 pay_token = IERC20(token_address);
    require(pay_token.allowance(msg.sender, address(this)) >= amount, "Not enough allowance");
    pay_token.transferFrom(airdrop.creator, address(this), amount); //hold in custody. CEI shouldn't matter here because we getting da funds
    counter++;
    address[] memory empty;
    airdrops[counter] = Airdrop(msg.sender, token_address, amount, max, end_timestamp, empty, false);
    emit AirdropStart(counter);
    return counter;
  }

  function is_time(uint256 id) public view returns (bool) {
    return airdrops[id].end_timestamp <= block.timestamp;
  }

  //join: requires signature
  function join(uint256 id, uint8 _v, bytes32 _r, bytes32 _s) external {
    bytes memory prefix = "\x19Ethereum Signed Message:\n32";
    bytes32 hash = keccak256(abi.encodePacked(prefix, msg.sender, " is approved for ", id)); //mixed string and address
    //change r and s into bytes
    require(ecrecover(hash, _v, _r, _s) == signer_address, "Signature could not be verified");
    Airdrop memory airdrop = airdrops[id];
    require(!is_time(id), "Cannot join airdrop after it is over");
    for (uint i = 0; i < airdrop.participants.length; i++) {
      require(airdrop.participants[i] != msg.sender, "Already participating in this airdrop");
    }
    airdrops[id].participants.push(msg.sender);
  }

  //CEI or something
  //be careful here, we hold the funds
  function end(uint256 id) external {
    Airdrop memory airdrop = airdrops[id];
    require(is_time(id), "Airdrop has not finished yet");
    require(!airdrop.ended, "Airdrop has already ended and paid out"); 
    airdrops[id].ended = true;
    require(airdrop.participants.length > 0, "Need at least 1 participant");
    uint256 amount_each = airdrop.amount / airdrop.participants.length; //truncates
    require(amount_each > 0, "Cannot airdrop 0 units");
    if (airdrop.token_address == 0x0000000000000000000000000000000000000000) {
      for (uint i = 0; i < airdrop.participants.length; i++) {
        require(payable(airdrop.participants[i]).send(amount_each));
      }
    } else {
      IERC20 pay_token = IERC20(airdrop.token_address);
      for (uint i = 0; i < airdrop.participants.length; i++) {
        pay_token.transferFrom(airdrop.participants[i], amount_each);
      }
    }
    emit AirdropEnd(id);
  }
}

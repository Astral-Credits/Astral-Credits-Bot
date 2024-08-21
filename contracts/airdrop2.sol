pragma solidity 0.8.19;

interface IERC20 {
  function transfer(address recepient, uint256 amount) external returns (bool);
  function transferFrom(address sender, address recepient, uint256 amount) external returns (bool);
  function allowance(address owner, address spender) external view returns (uint256);
}

contract AstralCreditsAirdrop {
  struct Airdrop {
    address creator;
    address token_address; //0x0 if native send
    uint256 amount_each;
    uint256 max_participants; //why the fuck not at this point
    uint256 end_timestamp;
    address[] participants;
    bool refunded;
  }

  uint256 private counter = 0;
  mapping(uint256 => Airdrop) public airdrops;
  address public immutable signer_address;
 
  event AirdropStart(
    uint256 id
  );

  constructor(address _signer_address) {
    signer_address = _signer_address;
  }

  function native_start(uint64 end_timestamp, uint256 amount_each, uint256 max) external payable {
    require(amount_each * max == msg.value, "Sent too much or too little");
    counter++;
    address[] memory empty;
    airdrops[counter] = Airdrop(msg.sender, 0x0000000000000000000000000000000000000000, amount_each, max, end_timestamp, empty, false);
    emit AirdropStart(counter);
  }

  function token_start(uint64 end_timestamp, uint256 amount_each, uint256 max, address token_address) external returns (uint256) {
    require(amount_each > 0, "Cannot airdrop nothing");
    //check allowance
    IERC20 pay_token = IERC20(token_address);
    uint256 amount = amount_each * max;
    require(pay_token.allowance(msg.sender, address(this)) >= amount, "Not enough allowance");
    pay_token.transferFrom(msg.sender, address(this), amount); //hold in custody. CEI shouldn't matter here because we getting da funds
    counter++;
    address[] memory empty;
    airdrops[counter] = Airdrop(msg.sender, token_address, amount_each, max, end_timestamp, empty, false);
    emit AirdropStart(counter);
    return counter;
  }

  function is_time(uint256 id) public view returns (bool) {
    return airdrops[id].end_timestamp <= block.timestamp;
  }

  function verify_signature(uint256 id, uint8 _v, bytes32 _r, bytes32 _s) internal view returns (bool) {
    bytes memory prefix = "\x19Ethereum Signed Message:\n32";
    bytes32 hash = keccak256(abi.encodePacked(prefix, msg.sender, " is approved for ", id)); //mixed string and address
    //change r and s into bytes
    return ecrecover(hash, _v, _r, _s) == signer_address;
  }

  //claim: requires signature
  //CEI or something
  //be careful here, we hold the funds
  function claim(uint256 id, uint8 _v, bytes32 _r, bytes32 _s) external {
    require(verify_signature(id, _v, _r, _s), "Signature could not be verified");
    Airdrop memory airdrop = airdrops[id];
    require(!is_time(id), "Cannot join airdrop after it is over");
    require(airdrop.participants.length < airdrop.max_participants, "Already reached max participants");
    for (uint i = 0; i < airdrop.participants.length; i++) {
      require(airdrop.participants[i] != msg.sender, "Already participating in this airdrop");
    }
    airdrops[id].participants.push(msg.sender);
    if (airdrop.token_address == 0x0000000000000000000000000000000000000000) {
      require(payable(msg.sender).send(airdrop.amount_each));
    } else {
      IERC20 pay_token = IERC20(airdrop.token_address);
      pay_token.transfer(msg.sender, airdrop.amount_each);
    }
  }

  //refund any undistributed funds to creator
  function refund(uint256 id) external {
    Airdrop memory airdrop = airdrops[id];
    require(is_time(id), "Airdrop has not finished yet");
    require(!airdrop.refunded, "Airdrop has already ended and refunded"); 
    airdrops[id].refunded = true;
    require(airdrop.participants.length < airdrop.max_participants, "Nothing to refund, all claimed");
    uint256 refund_amount = (airdrop.max_participants - airdrop.participants.length) * airdrop.amount_each;
    if (airdrop.token_address == 0x0000000000000000000000000000000000000000) {
      require(payable(airdrop.creator).send(refund_amount));
    } else {
      IERC20 pay_token = IERC20(airdrop.token_address);
      pay_token.transfer(airdrop.creator, refund_amount);
    }
  }
}

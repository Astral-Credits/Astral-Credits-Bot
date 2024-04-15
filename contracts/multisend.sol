//SPDX-License-Identifier:  CC-PDDC
//I don't think this can be copyrighted anyhow

pragma solidity 0.8.19; //safemath no longer needed in solidity 0.8+, apparently

interface IERC20 {
  function transferFrom(address sender, address recepient, uint256 amount) external returns (bool);
  function allowance(address owner, address spender) external view returns (uint256);
}

contract AstralCreditsMultiSend {
  event NativeBatchSend(
    address[] tos,
    uint256 amount_each
  );

  event TokenBatchSend(
    address[] tos,
    uint256 amount_each
  );

  function native_batch_send(address[] calldata tos, uint256 amount_each) external payable {
    require(amount_each != 0);
    require(amount_each * tos.length == msg.value, "Amount sent to contract must match total amount to send");
    for (uint i = 0; i < tos.length; i++) {
      require(payable(tos[i]).send(amount_each));
    }
    emit NativeBatchSend(tos, amount_each);
  }

  function token_batch_send(address token_address, address[] calldata tos, uint256 amount_each) external {
    require(amount_each != 0);
    IERC20 pay_token = IERC20(token_address);
    require(pay_token.allowance(msg.sender, address(this)) >= amount_each * tos.length, "Not enough allowance");
    for (uint i = 0; i < tos.length; i++) {
      pay_token.transferFrom(msg.sender, tos[i], amount_each);
    }
    emit TokenBatchSend(tos, amount_each);
  }
}

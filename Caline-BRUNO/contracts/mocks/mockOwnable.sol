// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "contracts/Ownable.sol";

contract MockOwnable is Ownable {
    uint256 private _value;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setValue(uint256 newValue) external onlyOwner {
        _value = newValue;
    }

    function value() external view returns (uint256) {
        return _value;
    }
}

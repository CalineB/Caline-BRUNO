// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";

// Interface minimale de l'Identity Registry
interface IIdentityRegistry {
    function isVerified(address wallet) external view returns (bool);
}

contract IdentityRegistry is IIdentityRegistry, Ownable {
    mapping(address => bool) private _isVerified;

    event InvestorVerified(address indexed wallet);

    event InvestorRevoked(address indexed wallet);

    constructor(address platformOwner) Ownable(platformOwner) {}


    function verifyInvestor(address wallet) external onlyOwner {
        require(wallet != address(0), "IdentityRegistry: wallet is zero");
        require(!_isVerified[wallet], "IdentityRegistry: already verified");

        _isVerified[wallet] = true;
        emit InvestorVerified(wallet);
    }

    function revokeInvestor(address wallet) external onlyOwner {
        require(wallet != address(0), "IdentityRegistry: wallet is zero");
        require(_isVerified[wallet], "IdentityRegistry: not verified");

        _isVerified[wallet] = false;
        emit InvestorRevoked(wallet);
    }

    function isVerified(address wallet) external view override returns (bool) {
        return _isVerified[wallet];
    }
}

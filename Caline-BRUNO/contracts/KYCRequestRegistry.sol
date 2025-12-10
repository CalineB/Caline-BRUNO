// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";

// Preuve on-chain que l'utilisateur a soumis un KYC off-chain
contract KYCRequestRegistry is Ownable {
    struct Request {
        bytes32 kycHash;
        bool exists;
        bool approved;
        bool rejected;
    }

    mapping(address => Request) public requests;

    event KYCSubmitted(address indexed wallet, bytes32 kycHash);
    event KYCApproved(address indexed wallet);
    event KYCRejected(address indexed wallet);

    constructor(address platformOwner) Ownable(platformOwner) {}

    function submitKYC(bytes32 kycHash) external {
        require(kycHash != bytes32(0), "KYC: empty hash");
        require(!requests[msg.sender].exists, "KYC: already submitted");

        requests[msg.sender] = Request({
            kycHash: kycHash,
            exists: true,
            approved: false,
            rejected: false
        });

        emit KYCSubmitted(msg.sender, kycHash);
    }

    function approveKYC(address wallet) external onlyOwner {
        Request storage r = requests[wallet];
        require(r.exists, "KYC: request not found");
        require(!r.approved, "KYC: already approved");

        r.approved = true;
        r.rejected = false;

        emit KYCApproved(wallet);
    }

    function rejectKYC(address wallet) external onlyOwner {
        Request storage r = requests[wallet];
        require(r.exists, "KYC: request not found");

        r.approved = false;
        r.rejected = true;

        emit KYCRejected(wallet);
    }
}

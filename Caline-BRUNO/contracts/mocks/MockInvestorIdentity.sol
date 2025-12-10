// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../IdentityRegistry.sol";

// Exemple de contrat qui dépend de l'IdentityRegistry
contract MockIdentityConsumer{
    IIdentityRegistry public identityRegistry;

    address public lastCaller;

    constructor(address _identityRegistry) {
        require(_identityRegistry != address(0), "MockIdentityConsumer: registry is zero");
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function doRestrictedAction() external {
        require(identityRegistry.isVerified(msg.sender), "MockIdentityConsumer: caller not verified");

        lastCaller = msg.sender;
    }
}

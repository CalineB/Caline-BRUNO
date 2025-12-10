// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../HouseSecurityToken.sol";

// Contrat de test qui essaye d'interagir avec HouseSecurityToken
contract MockSecurityTokenCaller {
    function tryTransfer(
        address token,
        address to,
        uint256 amount
    ) external returns (bool) {
        return HouseSecurityToken(token).transfer(to, amount);
    }
}

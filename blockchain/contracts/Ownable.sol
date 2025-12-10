// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Gestion simple d'un propriétaire (admin)
// Utilisé pour contrôler l'accès aux fonctions sensibles des contrats de la plateforme.
contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Ownable: owner is zero");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

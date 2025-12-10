// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";
import "./IdentityRegistry.sol";
import "./HouseSecurityToken.sol";

// Crée un token de sécurité par maison / projet
contract TokenFactory is Ownable {
    address public immutable identityRegistry;

    address[] public allHouseTokens;

    mapping(address => address[]) public tokensByProjectOwner;

    event HouseTokenCreated(
        address indexed tokenAddress,
        address indexed projectOwner,
        string name,
        string symbol,
        uint256 maxSupply
    );

    constructor(address platformOwner, address _identityRegistry)
        Ownable(platformOwner)
    {
        require(_identityRegistry != address(0), "Factory: identityRegistry zero");
        identityRegistry = _identityRegistry;
    }

    function createHouseToken(
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        address projectOwner
    ) external onlyOwner returns (address tokenAddress) {
        require(bytes(name).length > 0, "Factory: name empty");
        require(bytes(symbol).length > 0, "Factory: symbol empty");
        require(projectOwner != address(0), "Factory: projectOwner zero");

        // Déploiement du token pour ce projet
        HouseSecurityToken token = new HouseSecurityToken(
            owner,
            projectOwner,
            name,
            symbol,
            maxSupply,
            identityRegistry
        );

        tokenAddress = address(token);

        allHouseTokens.push(tokenAddress);

        tokensByProjectOwner[projectOwner].push(tokenAddress);

        emit HouseTokenCreated(tokenAddress, projectOwner, name, symbol, maxSupply);
    }

    function getHouseTokenCount() external view returns (uint256) {
        return allHouseTokens.length;
    }

    function getTokensByProjectOwner(address _projectOwner)
        external
        view
        returns (address[] memory)
    {
        return tokensByProjectOwner[_projectOwner];
    }
}

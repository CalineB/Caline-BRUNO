// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";
import "./IdentityRegistry.sol";
import "./HouseSecurityToken.sol";

contract TokenFactory is Ownable {
    address public immutable identityRegistry;

    address public saleFactory;

    address[] public allHouseTokens;
    mapping(address => address[]) public tokensByProjectOwner;

    // ✅ Soft-delete / registry
    mapping(address => bool) public isHouseToken;
    mapping(address => bool) public isActive;

    event HouseTokenCreated(
        address indexed tokenAddress,
        address indexed projectOwner,
        string name,
        string symbol,
        uint256 maxSupply
    );

    event SaleFactoryUpdated(address indexed oldFactory, address indexed newFactory);

    // ✅ Soft-delete events
    event HouseTokenDeactivated(address indexed tokenAddress);
    event HouseTokenActivated(address indexed tokenAddress);

    constructor(address platformOwner, address _identityRegistry)
        Ownable(platformOwner)
    {
        require(_identityRegistry != address(0), "Factory: identityRegistry zero");
        identityRegistry = _identityRegistry;
    }

    // l’owner de la factory (platform) configure l'adresse de SaleFactory
    function setSaleFactory(address _saleFactory) external onlyOwner {
        require(_saleFactory != address(0), "Factory: saleFactory zero");
        emit SaleFactoryUpdated(saleFactory, _saleFactory);
        saleFactory = _saleFactory;
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

        HouseSecurityToken token = new HouseSecurityToken(
            owner,
            projectOwner,
            name,
            symbol,
            maxSupply,
            identityRegistry
        );

        tokenAddress = address(token);

        if (saleFactory != address(0)) {
            token.setSaleFactory(saleFactory);
        }

        allHouseTokens.push(tokenAddress);
        tokensByProjectOwner[projectOwner].push(tokenAddress);

        isHouseToken[tokenAddress] = true;
        isActive[tokenAddress] = true;

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

    // ✅ Soft-delete (ne supprime pas le contrat, mais le retire du listing)
    function deactivateHouseToken(address tokenAddress) external onlyOwner {
        require(isHouseToken[tokenAddress], "Factory: unknown token");
        require(isActive[tokenAddress], "Factory: already inactive");
        isActive[tokenAddress] = false;
        emit HouseTokenDeactivated(tokenAddress);
    }

    function activateHouseToken(address tokenAddress) external onlyOwner {
        require(isHouseToken[tokenAddress], "Factory: unknown token");
        require(!isActive[tokenAddress], "Factory: already active");
        isActive[tokenAddress] = true;
        emit HouseTokenActivated(tokenAddress);
    }
}

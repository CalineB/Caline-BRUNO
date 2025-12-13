// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";
import "./IdentityRegistry.sol";
import "./HouseSecurityToken.sol";

contract ReentrancyGuard {
    bool private _entered;

    modifier nonReentrant() {
        require(!_entered, "ReentrancyGuard: reentrant call");
        _entered = true;
        _;
        _entered = false;
    }
}

// Vente d'un HouseSecurityToken contre de l'ETH
contract HouseEthSale is Ownable, ReentrancyGuard {
    HouseSecurityToken public token;
    IIdentityRegistry public identityRegistry;

    uint256 public priceWeiPerToken;
    address public projectOwner;
    bool public saleActive;

    uint256 public totalEthRaised;
    mapping(address => uint256) public ethContributed;

    // ✅ Minimum investissement
    uint256 public constant MIN_INVEST_WEI = 0.05 ether;

    event TokensPurchased(address indexed buyer, uint256 ethPaid, uint256 tokensMinted);
    event SaleActivated();
    event SaleDeactivated();
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(
        address platformOwner,
        address _projectOwner,
        address _token,
        address _identityRegistry,
        uint256 _priceWeiPerToken
    ) Ownable(platformOwner) {
        require(_projectOwner != address(0), "Sale: projectOwner zero");
        require(_token != address(0), "Sale: token zero");
        require(_identityRegistry != address(0), "Sale: identityRegistry zero");
        require(_priceWeiPerToken > 0, "Sale: price is zero");

        projectOwner = _projectOwner;
        token = HouseSecurityToken(_token);
        identityRegistry = IIdentityRegistry(_identityRegistry);
        priceWeiPerToken = _priceWeiPerToken;
    }

    modifier onlyProjectOrPlatform() {
        require(msg.sender == projectOwner || msg.sender == owner, "Sale: caller not authorized");
        _;
    }

    function activateSale() external onlyProjectOrPlatform {
        saleActive = true;
        emit SaleActivated();
    }

    function deactivateSale() external onlyProjectOrPlatform {
        saleActive = false;
        emit SaleDeactivated();
    }

    function updatePrice(uint256 newPriceWei) external onlyProjectOrPlatform {
        require(newPriceWei > 0, "Sale: price zero");
        emit PriceUpdated(priceWeiPerToken, newPriceWei);
        priceWeiPerToken = newPriceWei;
    }

    function buyTokens() external payable nonReentrant {
        require(saleActive, "Sale: not active");
        require(msg.value > 0, "Sale: no ETH sent");

        // ✅ Minimum 0.05 ETH
        require(msg.value >= MIN_INVEST_WEI, "Sale: min 0.05 ETH");

        // KYC obligatoire
        require(identityRegistry.isVerified(msg.sender), "Sale: wallet not KYC");

        uint256 tokensToMint = msg.value / priceWeiPerToken;
        require(tokensToMint > 0, "Sale: ETH amount too low for 1 token");

        // Le cap 20% est check dans token.mint()
        token.mint(msg.sender, tokensToMint);

        uint256 totalCost = tokensToMint * priceWeiPerToken;
        uint256 refund = msg.value - totalCost;

        ethContributed[msg.sender] += totalCost;
        totalEthRaised += totalCost;

        if (refund > 0) {
            (bool success, ) = msg.sender.call{value: refund}("");
            require(success, "Sale: refund failed");
        }

        emit TokensPurchased(msg.sender, msg.value, tokensToMint);
    }

    function withdraw(address payable to, uint256 amount) external onlyProjectOrPlatform nonReentrant {
        require(to != address(0), "Sale: to zero");
        require(amount <= address(this).balance, "Sale: insufficient balance");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Sale: withdraw failed");

        emit Withdrawn(to, amount);
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getInvestorStats(address investor) external view returns (uint256 ethPaid, uint256 tokensOwned) {
        ethPaid = ethContributed[investor];
        tokensOwned = token.balanceOf(investor);
    }
}

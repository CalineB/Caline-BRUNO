const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HouseEthSale", function () {
  let deployer;
  let projectOwner;
  let investorKYC;
  let investorNotKYC;
  let IdentityRegistry;
  let registry;
  let Token;
  let token;
  let Sale;
  let sale;

  const PRICE_WEI = ethers.parseEther("0.01");
  const MAX_SUPPLY = 100n;

  const MIN_BUY = ethers.parseEther("0.05"); // ✅ min 0.05 ETH

  beforeEach(async function () {
    [deployer, projectOwner, investorKYC, investorNotKYC] =
      await ethers.getSigners();

    // 1) IdentityRegistry
    IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    registry = await IdentityRegistry.deploy(deployer.address);
    await registry.waitForDeployment();

    await registry.verifyInvestor(investorKYC.address);

    // 2) HouseSecurityToken
    Token = await ethers.getContractFactory("HouseSecurityToken");
    token = await Token.deploy(
      deployer.address,
      projectOwner.address,
      "Maison ETH 7% 2030",
      "METH7-30",
      MAX_SUPPLY,
      await registry.getAddress()
    );
    await token.waitForDeployment();

    // 3) HouseEthSale
    Sale = await ethers.getContractFactory("HouseEthSale");
    sale = await Sale.deploy(
      deployer.address,
      projectOwner.address,
      await token.getAddress(),
      await registry.getAddress(),
      PRICE_WEI
    );
    await sale.waitForDeployment();

    await token.setSaleContract(await sale.getAddress());
    await sale.connect(projectOwner).activateSale();
  });

  it("initialise correctement le contrat de sale", async function () {
    expect(await sale.owner()).to.equal(deployer.address);
    expect(await sale.projectOwner()).to.equal(projectOwner.address);
    expect(await sale.priceWeiPerToken()).to.equal(PRICE_WEI);
    expect(await sale.saleActive()).to.equal(true);
  });

  it("revert si la vente n'est pas active", async function () {
    await sale.connect(projectOwner).deactivateSale();

    await expect(
      sale.connect(investorKYC).buyTokens({ value: PRICE_WEI }) // valeur peu importe (saleActive check en premier)
    ).to.be.revertedWith("Sale: not active");
  });

  it("revert si aucun ETH n'est envoyé", async function () {
    await expect(
      sale.connect(investorKYC).buyTokens({ value: 0 })
    ).to.be.revertedWith("Sale: no ETH sent");
  });

  it("revert si montant < 0.05 ETH", async function () {
    await expect(
      sale.connect(investorKYC).buyTokens({ value: PRICE_WEI }) // 0.01
    ).to.be.revertedWith("Sale: min 0.05 ETH");
  });

  it("revert si le wallet n'est pas KYC", async function () {
    // ✅ pour atteindre le check KYC, il faut passer le min
    await expect(
      sale.connect(investorNotKYC).buyTokens({ value: MIN_BUY })
    ).to.be.revertedWith("Sale: wallet not KYC");
  });

  it("permet à un wallet KYC d'acheter des tokens contre de l'ETH", async function () {
    const ethToSend = ethers.parseEther("0.05");

    await sale.connect(investorKYC).buyTokens({ value: ethToSend });

    const balanceTokens = await token.balanceOf(investorKYC.address);
    expect(balanceTokens).to.equal(5n);

    const saleEthBalance = await ethers.provider.getBalance(
      await sale.getAddress()
    );
    expect(saleEthBalance).to.equal(ethToSend);
  });

  it("gère le refund si l'ETH ne correspond pas exactement à un multiple du prix", async function () {
    const ethToSend = ethers.parseEther("0.055"); // min ok

    const balanceBefore = await ethers.provider.getBalance(investorKYC.address);

    const tx = await sale.connect(investorKYC).buyTokens({ value: ethToSend });
    await tx.wait();

    const balanceAfter = await ethers.provider.getBalance(investorKYC.address);

    const tokens = await token.balanceOf(investorKYC.address);
    expect(tokens).to.equal(5n);

    const saleBalance = await ethers.provider.getBalance(await sale.getAddress());
    expect(saleBalance).to.equal(ethers.parseEther("0.05")); // 5 * 0.01

    const spent = balanceBefore - balanceAfter;
    expect(spent).to.be.greaterThanOrEqual(ethers.parseEther("0.05"));
  });

  it("revert si l'achat ferait dépasser le cap de 20% du projet", async function () {
    // 100 supply -> cap 20 tokens (20%)
    // 0.2 ETH -> 20 tokens (pile cap)
    const ethToSend = ethers.parseEther("0.2");
    await sale.connect(investorKYC).buyTokens({ value: ethToSend });

    // ✅ la 2e tentative doit respecter le min 0.05 ETH
    await expect(
      sale.connect(investorKYC).buyTokens({ value: ethers.parseEther("0.05") }) // +5 tokens => dépasse 20
    ).to.be.revertedWith("Token: exceeds 20% investor cap");
  });

  it("permet au projectOwner de withdraw l'ETH collecté", async function () {
    const ethToSend = ethers.parseEther("0.1");
    await sale.connect(investorKYC).buyTokens({ value: ethToSend });

    const balanceBefore = await ethers.provider.getBalance(projectOwner.address);

    const tx = await sale.connect(projectOwner).withdraw(projectOwner.address, ethToSend);
    await tx.wait();

    const balanceAfter = await ethers.provider.getBalance(projectOwner.address);

    const saleBalance = await ethers.provider.getBalance(await sale.getAddress());
    expect(saleBalance).to.equal(0n);

    const delta = balanceAfter - balanceBefore;
    expect(delta).to.be.lessThanOrEqual(ethToSend);
    expect(delta).to.be.greaterThan(ethToSend - ethers.parseEther("0.01"));
  });

  it("met à jour ethContributed, totalEthRaised et la balance du contrat", async function () {
    const ethToSend = ethers.parseEther("0.2"); // min ok

    await sale.connect(investorKYC).buyTokens({ value: ethToSend });

    const contributed = await sale.ethContributed(investorKYC.address);
    const totalRaised = await sale.totalEthRaised();
    const contractBalance = await sale.getContractBalance();
    const investorStats = await sale.getInvestorStats(investorKYC.address);

    expect(contributed).to.equal(ethers.parseEther("0.2"));
    expect(totalRaised).to.equal(ethers.parseEther("0.2"));
    expect(contractBalance).to.equal(ethers.parseEther("0.2"));
    expect(investorStats[0]).to.equal(ethers.parseEther("0.2"));
    expect(investorStats[1]).to.equal(20n); // 0.2 / 0.01 = 20 tokens
  });
});

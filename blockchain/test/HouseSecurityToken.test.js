const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HouseSecurityToken", function () {
  let deployer;
  let projectOwner;
  let investor1;
  let investor2;
  let notKYC;
  let registry;
  let token;

  beforeEach(async function () {
    [deployer, projectOwner, investor1, investor2, notKYC] =
      await ethers.getSigners();

    const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    registry = await IdentityRegistry.deploy(deployer.address);
    await registry.waitForDeployment();

    await registry.verifyInvestor(investor1.address);
    await registry.verifyInvestor(investor2.address);

    const Token = await ethers.getContractFactory("HouseSecurityToken");
    token = await Token.deploy(
      deployer.address,         // platform owner = owner()
      projectOwner.address,
      "Maison Paris 7% 2030",
      "MP7-30",
      100,
      await registry.getAddress()
    );
    await token.waitForDeployment();
  });

  it("mint autorisé pour projectOwner", async function () {
    await token.connect(projectOwner).mint(investor1.address, 10);
    expect(await token.balanceOf(investor1.address)).to.equal(10);
  });

  it("mint autorisé pour la plateforme (owner)", async function () {
    await token.connect(deployer).mint(investor1.address, 10);
    expect(await token.balanceOf(investor1.address)).to.equal(10);
  });

  it("revert mint si wallet pas KYC", async function () {
    await expect(
      token.connect(projectOwner).mint(notKYC.address, 10)
    ).to.be.revertedWith("Token: wallet not KYC");
  });

  it("transferts uniquement entre wallets KYC", async function () {
    await token.connect(projectOwner).mint(investor1.address, 10);

    await token.connect(investor1).transfer(investor2.address, 5);

    expect(await token.balanceOf(investor1.address)).to.equal(5);
    expect(await token.balanceOf(investor2.address)).to.equal(5);
  });

  it("revert transfert vers un wallet non KYC", async function () {
    await token.connect(projectOwner).mint(investor1.address, 10);

    await expect(
      token.connect(investor1).transfer(notKYC.address, 1)
    ).to.be.revertedWith("Token: wallet not KYC");
  });

  it("pause bloque les transferts", async function () {
    await token.connect(projectOwner).mint(investor1.address, 10);

    await token.connect(deployer).pause(); // ✅ onlyOwner = platform owner

    await expect(
      token.connect(investor1).transfer(investor2.address, 1)
    ).to.be.revertedWith("Token: transfers paused");
  });

  describe("Investor cap (20%)", function () {
    it("revert si un investisseur dépasse le cap de 20% lors du mint", async function () {
      await token.connect(projectOwner).mint(investor1.address, 20);

      await expect(
        token.connect(projectOwner).mint(investor1.address, 1)
      ).to.be.revertedWith("Token: exceeds 20% investor cap");
    });

    it("revert si un investisseur dépasse 20% via un transfert secondaire", async function () {
      await token.connect(projectOwner).mint(investor1.address, 20);
      await token.connect(projectOwner).mint(investor2.address, 10);

      await expect(
        token.connect(investor2).transfer(investor1.address, 1)
      ).to.be.revertedWith("Token: exceeds 20% investor cap");
    });
  });
});

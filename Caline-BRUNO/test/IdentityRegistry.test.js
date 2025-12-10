const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IdentityRegistry", function () {
  let deployer;
  let kycAdmin;
  let investor;
  let otherUser;
  let IdentityRegistry;
  let identityRegistry;
  let MockIdentityConsumer;
  let consumer;

  beforeEach(async function () {
    [deployer, kycAdmin, investor, otherUser] = await ethers.getSigners();

    IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    identityRegistry = await IdentityRegistry.deploy(kycAdmin.address);
    await identityRegistry.waitForDeployment();

    MockIdentityConsumer = await ethers.getContractFactory("MockIdentityConsumer");
    consumer = await MockIdentityConsumer.deploy(await identityRegistry.getAddress());
    await consumer.waitForDeployment();
  });

  it("définit correctement l'owner initial", async function () {
    const owner = await identityRegistry.owner();
    expect(owner).to.equal(kycAdmin.address);
  });

  it("permet à l'owner de vérifier un investisseur", async function () {
    await expect(identityRegistry.connect(kycAdmin).verifyInvestor(investor.address))
      .to.emit(identityRegistry, "InvestorVerified")
      .withArgs(investor.address);

    const isVerified = await identityRegistry.isVerified(investor.address);
    expect(isVerified).to.equal(true);
  });

  it("revert si un non-owner tente de vérifier un investisseur", async function () {
    await expect(
      identityRegistry.connect(otherUser).verifyInvestor(investor.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("revert si on essaie de vérifier deux fois le même investisseur", async function () {
    await identityRegistry.connect(kycAdmin).verifyInvestor(investor.address);

    await expect(
      identityRegistry.connect(kycAdmin).verifyInvestor(investor.address)
    ).to.be.revertedWith("IdentityRegistry: already verified");
  });

  it("permet à l'owner de révoquer un investisseur", async function () {
    await identityRegistry.connect(kycAdmin).verifyInvestor(investor.address);

    await expect(identityRegistry.connect(kycAdmin).revokeInvestor(investor.address))
      .to.emit(identityRegistry, "InvestorRevoked")
      .withArgs(investor.address);

    const isVerified = await identityRegistry.isVerified(investor.address);
    expect(isVerified).to.equal(false);
  });

  it("revert si on révoque un wallet non vérifié", async function () {
    await expect(
      identityRegistry.connect(kycAdmin).revokeInvestor(investor.address)
    ).to.be.revertedWith("IdentityRegistry: not verified");
  });

  it("revert si un non-owner tente de révoquer un investisseur", async function () {
    await identityRegistry.connect(kycAdmin).verifyInvestor(investor.address);

    await expect(
      identityRegistry.connect(otherUser).revokeInvestor(investor.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("empêche un wallet non KYC d'appeler une fonction protégée dans un contrat consommateur", async function () {
    await expect(
      consumer.connect(otherUser).doRestrictedAction()
    ).to.be.revertedWith("MockIdentityConsumer: caller not verified");
  });

  it("autorise un wallet KYC à appeler une fonction protégée dans un contrat consommateur", async function () {
    await identityRegistry.connect(kycAdmin).verifyInvestor(investor.address);

    await consumer.connect(investor).doRestrictedAction();

    const lastCaller = await consumer.lastCaller();
    expect(lastCaller).to.equal(investor.address);
  });
});

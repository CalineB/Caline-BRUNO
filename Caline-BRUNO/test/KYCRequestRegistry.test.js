const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KYCRequestRegistry", function () {
  let deployer;
  let user;
  let other;
  let Registry;
  let registry;

  beforeEach(async function () {
    [deployer, user, other] = await ethers.getSigners();

    Registry = await ethers.getContractFactory("KYCRequestRegistry");
    registry = await Registry.deploy(deployer.address);
    await registry.waitForDeployment();
  });

  it("définit correctement l'owner initial", async function () {
    const owner = await registry.owner();
    expect(owner).to.equal(deployer.address);
  });

  it("permet à un utilisateur de soumettre un KYC avec un hash valide", async function () {
    const kycHash = ethers.keccak256(ethers.toUtf8Bytes("dossier-user-1"));

    await expect(registry.connect(user).submitKYC(kycHash))
      .to.emit(registry, "KYCSubmitted")
      .withArgs(user.address, kycHash);

    const req = await registry.requests(user.address);
    expect(req.exists).to.equal(true);
    expect(req.kycHash).to.equal(kycHash);
    expect(req.approved).to.equal(false);
    expect(req.rejected).to.equal(false);
  });

  it("revert si le hash est vide", async function () {
    await expect(
      registry.connect(user).submitKYC(ethers.ZeroHash)
    ).to.be.revertedWith("KYC: empty hash");
  });

  it("revert si un utilisateur soumet deux fois un KYC", async function () {
    const kycHash = ethers.keccak256(ethers.toUtf8Bytes("dossier-user-1"));
    await registry.connect(user).submitKYC(kycHash);

    await expect(
      registry.connect(user).submitKYC(kycHash)
    ).to.be.revertedWith("KYC: already submitted");
  });

  it("permet à l'owner d'approuver un KYC existant", async function () {
    const kycHash = ethers.keccak256(ethers.toUtf8Bytes("dossier-user-1"));
    await registry.connect(user).submitKYC(kycHash);

    await expect(registry.connect(deployer).approveKYC(user.address))
      .to.emit(registry, "KYCApproved")
      .withArgs(user.address);

    const req = await registry.requests(user.address);
    expect(req.approved).to.equal(true);
    expect(req.rejected).to.equal(false);
  });

  it("revert si on tente d'approuver un KYC inexistant", async function () {
    await expect(
      registry.connect(deployer).approveKYC(user.address)
    ).to.be.revertedWith("KYC: request not found");
  });

  it("revert si un non-owner tente d'approuver", async function () {
    const kycHash = ethers.keccak256(ethers.toUtf8Bytes("dossier-user-1"));
    await registry.connect(user).submitKYC(kycHash);

    await expect(
      registry.connect(other).approveKYC(user.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("permet à l'owner de rejeter un KYC", async function () {
    const kycHash = ethers.keccak256(ethers.toUtf8Bytes("dossier-user-1"));
    await registry.connect(user).submitKYC(kycHash);

    await expect(registry.connect(deployer).rejectKYC(user.address))
      .to.emit(registry, "KYCRejected")
      .withArgs(user.address);

    const req = await registry.requests(user.address);
    expect(req.approved).to.equal(false);
    expect(req.rejected).to.equal(true);
  });
});

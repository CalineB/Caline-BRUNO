const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Ownable & MockOwnable", function () {
  let deployer;
  let otherUser;
  let OwnableMock;
  let mock;

  beforeEach(async function () {
    [deployer, otherUser] = await ethers.getSigners();

    OwnableMock = await ethers.getContractFactory("MockOwnable");
    mock = await OwnableMock.deploy(deployer.address);
    await mock.waitForDeployment();
  });

  it("définit correctement l'owner initial", async function () {
    const owner = await mock.owner();
    expect(owner).to.equal(deployer.address);
  });

  it("permet à l'owner de transférer l'ownership", async function () {
    await expect(mock.transferOwnership(otherUser.address))
      .to.emit(mock, "OwnershipTransferred")
      .withArgs(deployer.address, otherUser.address);

    const newOwner = await mock.owner();
    expect(newOwner).to.equal(otherUser.address);
  });

  it("revert si on essaye de transférer l'ownership vers address(0)", async function () {
    await expect(
      mock.transferOwnership(ethers.ZeroAddress)
    ).to.be.revertedWith("Ownable: new owner is zero");
  });

  it("revert si un non-owner tente de transférer l'ownership", async function () {
    await expect(
      mock.connect(otherUser).transferOwnership(otherUser.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("revert si un non-owner appelle une fonction protégée par onlyOwner", async function () {
    await expect(
      mock.connect(otherUser).setValue(42)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("permet à l'owner d'appeler une fonction protégée par onlyOwner", async function () {
    await mock.setValue(42);
    const value = await mock.value();
    expect(value).to.equal(42);
  });
});

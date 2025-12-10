const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenFactory", function () {
  let deployer;
  let projectOwner1;
  let projectOwner2;
  let otherUser;
  let IdentityRegistry;
  let registry;
  let Factory;
  let factory;

  beforeEach(async function () {
    [deployer, projectOwner1, projectOwner2, otherUser] =
      await ethers.getSigners();

    IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
    registry = await IdentityRegistry.deploy(deployer.address);
    await registry.waitForDeployment();

    Factory = await ethers.getContractFactory("TokenFactory");
    factory = await Factory.deploy(
      deployer.address,
      await registry.getAddress()
    );
    await factory.waitForDeployment();
  });

  it("initialise correctement l'owner et l'identityRegistry", async function () {
    const owner = await factory.owner();
    const regAddress = await factory.identityRegistry();

    expect(owner).to.equal(deployer.address);
    expect(regAddress).to.equal(await registry.getAddress());
  });

  it("permet à l'owner de créer un nouveau HouseSecurityToken", async function () {
    const tx = await factory.createHouseToken(
      "Maison Lyon 6% 2031",
      "MLY6-31",
      1000,
      projectOwner1.address
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) =>
        log.fragment &&
        log.fragment.name === "HouseTokenCreated"
    );

    const tokenAddress = event.args.tokenAddress;

    expect(tokenAddress).to.properAddress;

    const count = await factory.getHouseTokenCount();
    expect(count).to.equal(1);

    const storedTokenAddress = await factory.allHouseTokens(0);
    expect(storedTokenAddress).to.equal(tokenAddress);

    const Token = await ethers.getContractFactory("HouseSecurityToken");
    const token = Token.attach(tokenAddress);

    expect(await token.name()).to.equal("Maison Lyon 6% 2031");
    expect(await token.symbol()).to.equal("MLY6-31");
    expect(await token.maxSupply()).to.equal(1000);
    expect(await token.projectOwner()).to.equal(projectOwner1.address);
    expect(await token.identityRegistry()).to.equal(await registry.getAddress());
    expect(await token.owner()).to.equal(deployer.address); // platform owner
  });

  it("revert si un non-owner tente de créer un token", async function () {
    await expect(
      factory
        .connect(otherUser)
        .createHouseToken("Maison X", "MX", 1000, projectOwner1.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("indexe correctement les tokens par projectOwner", async function () {
    await factory.createHouseToken(
      "Maison A",
      "MA",
      1000,
      projectOwner1.address
    );

    await factory.createHouseToken(
      "Maison B",
      "MB",
      500,
      projectOwner1.address
    );

    await factory.createHouseToken(
      "Maison C",
      "MC",
      750,
      projectOwner2.address
    );

    const count = await factory.getHouseTokenCount();
    expect(count).to.equal(3);

    const tokensPO1 = await factory.getTokensByProjectOwner(
      projectOwner1.address
    );
    const tokensPO2 = await factory.getTokensByProjectOwner(
      projectOwner2.address
    );

    expect(tokensPO1.length).to.equal(2);
    expect(tokensPO2.length).to.equal(1);

    expect(tokensPO1[0]).to.properAddress;
    expect(tokensPO1[1]).to.properAddress;
    expect(tokensPO2[0]).to.properAddress;
  });

  it("revert si le projectOwner est address(0)", async function () {
    await expect(
      factory.createHouseToken("Maison Z", "MZ", 1000, ethers.ZeroAddress)
    ).to.be.revertedWith("Factory: projectOwner zero");
  });

  it("revert si le name est vide", async function () {
    await expect(
      factory.createHouseToken("", "SYM", 1000, projectOwner1.address)
    ).to.be.revertedWith("Factory: name empty");
  });

  it("revert si le symbol est vide", async function () {
    await expect(
      factory.createHouseToken("Maison Z", "", 1000, projectOwner1.address)
    ).to.be.revertedWith("Factory: symbol empty");
  });
});

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  const Contract = await hre.ethers.getContractFactory("BitcoinAutonomousWill");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("BitcoinAutonomousWill deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

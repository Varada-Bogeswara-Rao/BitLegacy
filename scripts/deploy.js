const hre = require("hardhat");

async function main() {
    const currentTimestampInSeconds = Math.round(Date.now() / 1000);
    const unlockTime = currentTimestampInSeconds + 60; // 1 minute from now

    const [deployer] = await hre.ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    const BitcoinAutonomousWill = await hre.ethers.getContractFactory("BitcoinAutonomousWill");
    const will = await BitcoinAutonomousWill.deploy();

    await will.waitForDeployment();

    console.log("BitcoinAutonomousWill deployed to:", await will.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

const hre = require("hardhat");

async function main() {
    console.log("Checking connection to Midl Regtest...");

    try {
        const provider = hre.ethers.provider;
        const network = await provider.getNetwork();
        console.log("Connected to chain ID:", network.chainId.toString());

        const [deployer] = await hre.ethers.getSigners();
        if (!deployer) {
            console.error("No deployer account found. Check .env PRIVATE_KEY.");
            return;
        }

        console.log("Deployer address:", deployer.address);
        const balance = await provider.getBalance(deployer.address);
        console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

        if (balance === 0n) {
            console.warn("WARNING: Deployer balance is 0. Deployment will fail.");
        } else {
            console.log("Ready to deploy.");
        }

    } catch (error) {
        console.error("Connection failed:", error.message);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

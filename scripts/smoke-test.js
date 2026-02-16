const hre = require("hardhat");
const { ethers } = hre;

async function main() {
    const contractAddress = "0xa859866FEB4A387a86fA0B33C31A0D5fC84802C6"; // Deployed address
    console.log(`Attaching to contract at ${contractAddress}...`);

    const contract = await ethers.getContractAt("BitcoinAutonomousWill", contractAddress);
    const [owner] = await ethers.getSigners();
    console.log("Interacting with account:", owner.address);

    // 1. Create Vault
    console.log("Creating vault...");
    const heirs = [
        { wallet: "0x1111111111111111111111111111111111111111", percentage: 60 },
        { wallet: "0x2222222222222222222222222222222222222222", percentage: 40 }
    ];

    const tx = await contract.createVault(
        heirs,
        1, // 1 day interval
        ethers.toUtf8Bytes("Smoke Test Message"),
        { value: ethers.parseEther("0.001") }
    );

    console.log("Tx sent:", tx.hash);
    await tx.wait();
    console.log("✅ Vault created confirmed");

    // 2. Verify Status
    console.log("Verifying status...");
    const status = await contract.getStatus(owner.address);
    console.log("Vault Active:", status.active);
    console.log("Vault Balance:", ethers.formatEther(status.balance));

    if (status.active === true && status.balance.toString() === ethers.parseEther("0.001").toString()) {
        console.log("✅ Smoke Test Passed: Vault is active with correct balance.");
    } else {
        console.error("❌ Smoke Test Failed: Status mismatch", status);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

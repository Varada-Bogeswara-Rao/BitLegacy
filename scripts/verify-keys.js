const { ethers } = require("ethers");
const hre = require("hardhat");

async function main() {
    const provider = hre.ethers.provider;
    console.log("Checking balances on Midl Regtest...");

    // 1. The key I mistakenly used in .env
    const wrongKey = "0x92a54972add05d68d1f7c5980459c0f9942a178ec6cd0e2920678d8a56286fa6";
    const w1 = new ethers.Wallet(wrongKey, provider);
    const bal1 = await provider.getBalance(w1.address);
    console.log(`Wrong Address (${w1.address}): ${ethers.formatEther(bal1)} ETH`);

    // 2. The CORRECT key derived from seed (Step 191)
    const correctKey = "0x2aed14ae5e68f659944d93c1647bbeb6a938d13f07c8474f961e88ba301278bd";
    const w2 = new ethers.Wallet(correctKey, provider);
    const bal2 = await provider.getBalance(w2.address);
    console.log(`Correct Derived Address (${w2.address}): ${ethers.formatEther(bal2)} ETH`);

    if (bal2 > 0n) {
        console.log("Funds found in CORRECT address!");
    } else {
        console.log("Both addresses are empty.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

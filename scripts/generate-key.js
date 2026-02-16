const { ethers } = require("ethers");

async function main() {
    const wallet = ethers.Wallet.createRandom();
    console.log("PRIVATE_KEY=" + wallet.privateKey);
    console.log("ADDRESS=" + wallet.address);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

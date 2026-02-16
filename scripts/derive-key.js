const { ethers } = require("ethers");

async function main() {
    const mnemonic = "element security squeeze glove camera afraid kidney ride plate fury system comic";
    const wallet = ethers.Wallet.fromPhrase(mnemonic);

    console.log("ADDRESS=" + wallet.address);
    console.log("PRIVATE_KEY=" + wallet.privateKey);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

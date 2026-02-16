module.exports = async (hre) => {
    try {
        const { midl } = hre;

        console.log("Initializing Midl SDK...");
        await midl.initialize();

        console.log("Queueing BitcoinAutonomousWill deployment...");
        // deploy(contractName, constructorArgs)
        await midl.deploy("BitcoinAutonomousWill", []);

        console.log("Executing deployment via Bitcoin L1...");
        await midl.execute();
        console.log("Deployment execution requested.");
    } catch (error) {
        console.error("DEPLOYMENT FAILED:", error);
        throw error;
    }
};

module.exports.tags = ["BitcoinAutonomousWill"];

const { midlRegtest } = require("@midl/executor");
const { MaestroSymphonyProvider, MempoolSpaceProvider } = require("@midl/core");

require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("hardhat-deploy");

// Conditionally load Midl plugin
if (process.env.ENABLE_MIDL) {
  require("@midl/hardhat-deploy");
}

require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  defaultNetwork: "regtest",
  midl: {
    path: "deployments",
    networks: {
      regtest: {
        mnemonic: process.env.MNEMONIC || "test test test test test test test test test test test junk",
        confirmationsRequired: 1,
        btcConfirmationsRequired: 1,
        hardhatNetwork: "regtest",
        network: {
          explorerUrl: "https://mempool.staging.midl.xyz",
          id: "regtest",
          network: "regtest",
        },

        runesProviderFactory: () =>
          new MaestroSymphonyProvider({
            regtest: "https://runes.staging.midl.xyz",
          }),
        providerFactory: () =>
          new MempoolSpaceProvider({
            regtest: "https://mempool.staging.midl.xyz",
          }),
      },
      hardhat: {
        mnemonic: "test test test test test test test test test test test junk",
        confirmationsRequired: 1,
        btcConfirmationsRequired: 1,
        hardhatNetwork: "hardhat",
        network: {
          explorerUrl: "http://localhost:8545",
          id: "hardhat",
          network: "hardhat",
        },
      },
    },
  },
  networks: {
    regtest: {
      url: midlRegtest.rpcUrls.default.http[0],
      chainId: midlRegtest.id,
      accounts: {
        mnemonic: process.env.MNEMONIC,
      }
    },
  },
};

import { createConfig as createMidlConfig, regtest } from "@midl/core";
import { MaestroSymphonyProvider } from "@midl/core";
import { xverseConnector } from "@midl/connectors";
import { midlRegtest } from "@midl/executor";
import { createConfig as createWagmiConfig, http } from "wagmi";
import { createPublicClient } from "viem";

const RPC_URL = midlRegtest.rpcUrls.default.http[0]; // https://rpc.staging.midl.xyz

// Midl config for Bitcoin / Xverse wallet (regtest)
export const midlConfig = createMidlConfig({
    networks: [regtest],
    connectors: [xverseConnector()],
    runesProvider: new MaestroSymphonyProvider({
        regtest: "https://runes.staging.midl.xyz",
    }),
    persist: true,
});

// Wagmi config for EVM interactions (uses regtest chain which has a valid RPC)
export const wagmiConfig = createWagmiConfig({
    chains: [midlRegtest],
    transports: {
        [midlRegtest.id]: http(RPC_URL),
    },
});

// Public client for reading contracts / gas estimation
export const publicClient = createPublicClient({
    chain: midlRegtest,
    transport: http(RPC_URL),
});

import { SignMessageProtocol, getDefaultAccount, waitForTransaction } from '@midl/core'
import { finalizeBTCTransaction, signIntention, getEVMAddress } from '@midl/executor'
import { keccak256 } from 'viem'
import { midlConfig, publicClient } from '../config'
import { regtest as midlRegtest } from '@midl/core'
import type { Account } from '@midl/core'

type TxIntention = {
    deposit?: { satoshis: number }
    evmTransaction?: {
        to: string
        data: string
        from: string | null
        value?: bigint
    }
}

/**
 * Execute the full Midl transaction flow:
 * 1. finalizeBTCTransaction - prepare + wallet-sign BTC tx
 * 2. signIntention - BIP322 sign each EVM tx
 * 3. sendBTCTransactions - broadcast BTC + signed EVM txs
 *
 * Returns immediately after broadcast. BTC/EVM confirmations
 * happen in the background (the dashboard auto-refreshes).
 */
export async function executeMidlTransaction(
    intentions: TxIntention[],
    paymentAccount: Account,
    onStatus: (status: string) => void,
): Promise<string[]> {
    // Step 1: Finalize BTC transaction (prompts wallet)
    onStatus('Sign the transaction in your wallet...')
    const btcTx = await finalizeBTCTransaction(
        midlConfig,
        intentions,
        publicClient as any,
    )

    // Step 2: Sign each EVM intention with BIP322
    onStatus('Signing EVM transactions...')
    const signedTransactions: string[] = []
    const evmTransactionsHashes: string[] = []

    for (const intention of intentions) {
        const signedTx = await signIntention(
            midlConfig,
            publicClient as any,
            intention,
            intentions,
            {
                txId: btcTx.tx.id,
                protocol: SignMessageProtocol.Bip322,
            },
        )
        const txId = keccak256(signedTx as `0x${string}`)
        evmTransactionsHashes.push(txId)
        signedTransactions.push(signedTx as string)
    }

    // Step 3: Broadcast BTC tx + signed EVM txs
    onStatus('Broadcasting transaction...')
    await (publicClient as any).sendBTCTransactions({
        btcTransaction: btcTx.tx.hex,
        serializedTransactions: signedTransactions,
    })

    // Don't block on BTC/EVM confirmation — the dashboard auto-refreshes
    // and will pick up the state change once confirmed.
    // Fire-and-forget the confirmation wait for logging purposes only.
    Promise.all([
        waitForTransaction(midlConfig, btcTx.tx.id, 1).catch(() => { }),
        ...evmTransactionsHashes.map((hash) =>
            (publicClient as any).waitForTransactionReceipt({
                hash,
                confirmations: 1,
            }).catch(() => { })
        ),
    ]).then(() => {
        console.log('[Midl] Transaction fully confirmed:', btcTx.tx.id)
    })

    return evmTransactionsHashes
}

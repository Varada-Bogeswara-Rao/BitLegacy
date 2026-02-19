
import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { useWallet } from '../context/WalletContext'
import { addTxIntention } from '@midl/executor'
import { midlConfig, publicClient } from '../config'
import { encodeFunctionData, formatEther } from 'viem'
import { executeMidlTransaction } from '../utils/midlTransaction'
import BitcoinAutonomousWillArtifact from '../abis/BitcoinAutonomousWill.json'

const CONTRACT_ADDRESS = BitcoinAutonomousWillArtifact.address as `0x${string} `
const ABI = BitcoinAutonomousWillArtifact.abi



export default function Claim() {
    const { isConnected: isWagmiConnected } = useAccount()
    const [ownerAddress, setOwnerAddress] = useState('')
    const [isSearching, setIsSearching] = useState(false)

    // Shared wallet context
    const {
        isXverseConnected, paymentAccount, evmAddress, connectedBtcAddress,
        xverseConnecting, xverseError, connectXverse,
    } = useWallet()

    const [txStatus, setTxStatus] = useState<string | null>(null)
    const [txError, setTxError] = useState<string | null>(null)
    const [txSuccess, setTxSuccess] = useState(false)

    const isConnected = isWagmiConnected || isXverseConnected

    const { data: statusData, refetch: refetchStatus } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getStatus',
        args: [ownerAddress as `0x${string} `],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const { data: heirsData } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getHeirs',
        args: [ownerAddress as `0x${string} `],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const { refetch: refetchVault } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'vaults',
        args: [ownerAddress as `0x${string} `],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const { data: pendingData } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPendingWithdrawal',
        args: [connectedBtcAddress],
        query: {
            enabled: isSearching && !!connectedBtcAddress,
        }
    })

    const { data: balanceData } = useBalance({
        address: evmAddress as `0x${string} `,
        query: {
            enabled: !!evmAddress,
            refetchInterval: 5000,
        }
    })

    const { data: hash, writeContract, error: writeError, isPending: isWritePending } = useWriteContract()
    const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

    if (isConfirmed) {
        refetchVault()
        refetchStatus()
    }

    const handleSearch = () => {
        if (ownerAddress) setIsSearching(true)
    }

    const isHeir = heirsData
        ? (heirsData as any[]).some(h => h.btcAddress === connectedBtcAddress)
        : false

    // Xverse transaction helper using full Midl flow
    const sendViaXverse = async (functionName: string, args: any[]) => {
        if (!paymentAccount) return
        setTxError(null)
        try {
            const data = encodeFunctionData({ abi: ABI, functionName, args })
            const intention = await addTxIntention(midlConfig, {
                evmTransaction: { to: CONTRACT_ADDRESS, data, from: evmAddress, value: 0n },
            }, paymentAccount.address)

            // Cast to any to bypass strict type mismatch between @midl/executor and local utility
            const hashes = await executeMidlTransaction([intention as any], paymentAccount, setTxStatus)

            // Wait for EVM transaction confirmation
            if (hashes.length > 0) {
                setTxStatus('Waiting for confirmation...')
                const receipt = await publicClient.waitForTransactionReceipt({
                    hash: hashes[0] as `0x${string} `
                })

                if (receipt.status === 'reverted') {
                    throw new Error('Transaction reverted on-chain. Please check your inputs.')
                }
            }

            setTxSuccess(true)
            setTxStatus('Syncing with blockchain...')

            // Poll for state update
            let attempts = 0
            const pollForUpdate = async () => {
                attempts++
                const { data } = await refetchVault()
                const v = data as any

                // If we claimed, wait for claimed flag.
                let done = false
                if (functionName === 'claimInheritance') {
                    if (v?.isClaimed) done = true
                } else {
                    // Withdraw or others don't strictly need this polling block for UI toggles, but good for balance
                    done = true
                }

                if (!done && attempts < 20) { // Try for ~40 seconds
                    setTimeout(pollForUpdate, 2000)
                } else {
                    setTxStatus(null)
                    refetchStatus()
                }
            }
            pollForUpdate()

        } catch (err: any) {
            console.error(err)
            const msg = err?.message || `${functionName} failed`
            if (msg.includes('No selected UTXOs') || msg.includes('UTXO')) {
                setTxError('Your Bitcoin wallet has no available UTXOs. You need some BTC in your wallet to pay the Midl transaction fee. Please fund your address and try again.')
            } else {
                setTxError(msg)
            }
            setTxStatus(null)
        }
    }

    const handleClaim = () => {
        if (isXverseConnected) {
            sendViaXverse('claimInheritance', [ownerAddress as `0x${string} `, connectedBtcAddress])
        } else {
            writeContract({
                address: CONTRACT_ADDRESS, abi: ABI,
                functionName: 'claimInheritance',
                args: [ownerAddress as `0x${string} `, connectedBtcAddress],
            })
        }
    }

    const handleWithdraw = () => {
        if (isXverseConnected) {
            sendViaXverse('withdraw', [connectedBtcAddress])
        }
    }

    const status = statusData as any
    const pendingAmount = pendingData as bigint | undefined
    const isPending = isWritePending || txStatus !== null

    // Treat vault as claimed if either on-chain status says so OR local claim succeeded
    const isClaimed = status?.claimed || txSuccess

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center space-y-6 p-10 bg-gray-800 rounded-xl">
                <h2 className="text-2xl font-bold">Connect Wallet to Claim</h2>
                <div className="w-full max-w-sm">
                    <p className="text-sm text-gray-400 mb-2 text-center">Bitcoin Wallet</p>
                    <button
                        onClick={connectXverse}
                        disabled={xverseConnecting}
                        className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold py-3 px-6 rounded-lg hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 transition-all"
                    >
                        {xverseConnecting ? 'Connecting...' : '🟠 Connect Xverse'}
                    </button>
                    {xverseError && <p className="text-red-400 text-xs mt-1 text-center">{xverseError}</p>}
                </div>
            </div>
        )
    }

    if (!isSearching) {
        return (
            <div className="bg-gray-800 p-8 rounded-xl shadow-xl border border-gray-700 text-center">
                <h2 className="text-3xl font-bold mb-6 text-amber-500">Claim Inheritance</h2>
                {connectedBtcAddress && (
                    <div className="mb-6 bg-gray-900/60 p-3 rounded-lg border border-gray-700">
                        <span className="text-xs text-gray-500">Your Bitcoin Address</span>
                        <p className="text-sm text-amber-400 font-mono break-all">{connectedBtcAddress}</p>
                    </div>
                )}
                <div className="max-w-md mx-auto">
                    <label className="block text-left text-sm font-medium text-gray-400 mb-1">Vault Owner's Midl Address</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={ownerAddress}
                            onChange={(e) => setOwnerAddress(e.target.value)}
                            placeholder="0x..."
                            className="flex-grow bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-amber-500 outline-none"
                        />
                        <button
                            onClick={handleSearch}
                            disabled={!ownerAddress}
                            className="bg-amber-500 text-black font-bold py-2 px-6 rounded hover:bg-amber-400 disabled:opacity-50"
                        >
                            Search
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Ask the vault creator for their Midl address (derived from their Bitcoin wallet).</p>
                </div>
            </div>
        )
    }

    if (!status || !status.exists) {
        return (
            <div className="bg-gray-800 p-8 rounded-xl text-center">
                <h2 className="text-2xl font-bold mb-4">No Vault Found</h2>
                <button onClick={() => setIsSearching(false)} className="text-amber-500 hover:text-amber-400">Search Again</button>
            </div>
        )
    }

    const canClaim = status.expired && status.active && isHeir

    return (
        <div className="bg-gray-800 p-8 rounded-xl shadow-xl border border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-amber-500">Claim Inheritance</h2>
                <button onClick={() => setIsSearching(false)} className="text-sm text-gray-400 hover:text-white">Change Address</button>
            </div>

            {connectedBtcAddress && (
                <div className="mb-6 bg-gray-900/60 p-3 rounded-lg border border-gray-700">
                    <span className="text-xs text-gray-500">Your Bitcoin Address</span>
                    <p className="text-sm text-amber-400 font-mono break-all mb-2">{connectedBtcAddress}</p>

                    {evmAddress && (
                        <>
                            <div className="border-t border-gray-700 my-2 pt-2">
                                <span className="text-xs text-gray-500">Your Midl EVM Address (for receiving funds)</span>
                                <p className="text-xs text-gray-400 font-mono break-all">{evmAddress}</p>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500">Current Balance</span>
                                <p className="text-sm text-white font-bold">
                                    {balanceData ? parseFloat(formatEther(balanceData.value)).toFixed(4) : '0.000'} BTC
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Vault Status</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`h - 3 w - 3 rounded - full ${status.active && !isClaimed ? 'bg-green-500' : isClaimed ? 'bg-blue-500' : 'bg-red-500'} `}></span>
                        <p className="font-bold text-white text-lg">
                            {isClaimed ? 'Claimed' : status.expired ? 'Expired (Ready)' : 'Active (Locked)'}
                        </p>
                    </div>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Your Status</p>
                    <p className={`font - bold text - lg ${isHeir ? 'text-green-400' : 'text-red-400'} `}>
                        {isHeir ? '✓ Beneficiary' : 'Not a Beneficiary'}
                    </p>
                </div>
            </div>

            {Array.isArray(heirsData) && heirsData.length > 0 && (
                <div className="mb-6 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-sm mb-2">Heirs</p>
                    {(heirsData as any[]).map((h: any, i: number) => (
                        <div key={i} className={`flex justify-between items-center py-1 ${h.btcAddress === connectedBtcAddress ? 'text-amber-400' : 'text-gray-300'}`}>
                            <span className="font-mono text-sm break-all">{h.btcAddress}</span>
                            <span className="text-sm ml-2">{String(h.percentage)}%</span>
                        </div>
                    ))}
                </div>
            )}

            {isClaimed ? (
                <div className="bg-gray-900 p-6 rounded-lg border border-gray-700 text-center">
                    <h3 className="text-xl font-bold mb-4 text-green-400">Funds Unlocked</h3>

                    <div className="mb-6">
                        {isHeir && pendingAmount && pendingAmount > 0n ? (
                            <div>
                                <p className="text-gray-300 mb-4">Your share is ready to withdraw.</p>
                                <p className="text-gray-400 text-sm mb-2">Pending Withdrawal: {String(pendingAmount)} wei</p>
                                <button
                                    onClick={handleWithdraw}
                                    disabled={isPending}
                                    className="bg-green-500 text-black font-bold py-3 px-8 rounded-lg hover:bg-green-400 w-full md:w-auto animate-bounce"
                                >
                                    {txStatus || 'Withdraw Funds'}
                                </button>
                            </div>
                        ) : (
                            <div className="p-3 bg-green-900/30 border border-green-500/30 rounded text-green-200">
                                <p>✅ Funds have been withdrawn to your EVM wallet.</p>
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-gray-500 mt-4">
                        {pendingAmount && pendingAmount > 0n ? 'Step 2 of 2: Withdraw Funds' : 'All steps completed'}
                    </p>
                </div>
            ) : canClaim ? (
                <div className="text-center">
                    <div className="bg-green-900/30 border border-green-500/30 p-6 rounded-lg mb-6">
                        <h3 className="text-xl font-bold text-green-400 mb-2">Inheritance Unlocked</h3>
                        <p className="text-gray-300 mb-4">The vault has expired and you are eligible to claim.</p>
                        <button
                            onClick={handleClaim}
                            disabled={isPending}
                            className="bg-green-500 text-black font-bold py-3 px-8 rounded-lg text-lg hover:bg-green-400 w-full md:w-auto"
                        >
                            {txStatus || (isWritePending ? 'Confirming...' : 'Claim Inheritance')}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">Step 1 of 2: Claim Inheritance</p>
                </div>
            ) : (
                <div className="text-center p-6 bg-gray-900/50 rounded-lg">
                    <p className="text-gray-400">Vault is still active. Please check back later.</p>
                    <div className="mt-2 text-sm text-gray-500">
                        Time Remaining: {String(status.timeRemaining)}s
                    </div>
                </div>
            )}

            {(writeError || txError) && (
                <div className="mt-4 bg-red-900/50 p-4 rounded text-red-200 text-sm break-words">
                    {writeError?.message || txError}
                </div>
            )}

            {txSuccess && (
                <div className="mt-4 bg-green-900/50 p-4 rounded text-green-200 text-sm text-center">
                    Transaction confirmed!
                </div>
            )}
        </div>
    )
}


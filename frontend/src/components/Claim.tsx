
import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { useWallet } from '../context/WalletContext'
import { addTxIntention } from '@midl/executor'
import { midlConfig, publicClient } from '../config'
import { encodeFunctionData, formatEther } from 'viem'
import { executeMidlTransaction } from '../utils/midlTransaction'
import TxLinks from './TxLinks'
import BitcoinAutonomousWillArtifact from '../abis/BitcoinAutonomousWill.json'

const CONTRACT_ADDRESS = BitcoinAutonomousWillArtifact.address as `0x${string}`
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
    const [activeAction, setActiveAction] = useState<'claim' | 'withdraw' | null>(null)
    const [evmTxHash, setEvmTxHash] = useState<string | null>(null)
    const [btcTxId, setBtcTxId] = useState<string | null>(null)

    const isConnected = isWagmiConnected || isXverseConnected

    const {
        data: statusData,
        refetch: refetchStatus,
        isLoading: isStatusLoading,
        isFetching: isStatusFetching,
        error: statusError,
    } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getStatus',
        args: [ownerAddress as `0x${string}`],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const {
        data: heirsData,
        error: heirsError,
    } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getHeirs',
        args: [ownerAddress as `0x${string}`],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const { refetch: refetchVault } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'vaults',
        args: [ownerAddress as `0x${string}`],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const {
        data: pendingData,
        refetch: refetchPending,
        isLoading: isPendingLoading,
        isFetching: isPendingFetching,
    } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getPendingWithdrawal',
        args: [connectedBtcAddress],
        query: {
            enabled: isSearching && !!connectedBtcAddress,
        }
    })

    const { data: balanceData } = useBalance({
        address: evmAddress as `0x${string}`,
        query: {
            enabled: !!evmAddress,
            refetchInterval: 5000,
        }
    })

    const { data: hash, writeContract, error: writeError, isPending: isWritePending } = useWriteContract()
    const { isSuccess: isConfirmed, isFetching: isConfirming } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (!isConfirmed) return
        setTxSuccess(true)
        setTxStatus(null)
        setActiveAction(null)
        refetchVault()
        refetchStatus()
        if (connectedBtcAddress) refetchPending()
    }, [connectedBtcAddress, isConfirmed, refetchPending, refetchStatus, refetchVault])

    const handleSearch = () => {
        if (ownerAddress) setIsSearching(true)
    }

    const isHeir = heirsData
        ? (heirsData as any[]).some(h => h.btcAddress === connectedBtcAddress)
        : false

    // Xverse transaction helper using full Midl flow
    const sendViaXverse = async (functionName: string, args: any[], action: 'claim' | 'withdraw') => {
        if (!paymentAccount) return
        setTxError(null)
        setTxSuccess(false)
        setEvmTxHash(null)
        setBtcTxId(null)
        setActiveAction(action)
        try {
            const data = encodeFunctionData({ abi: ABI, functionName, args })
            const intention = await addTxIntention(midlConfig, {
                evmTransaction: { to: CONTRACT_ADDRESS, data, from: evmAddress, value: 0n },
            }, paymentAccount.address)

            // Cast to any to bypass strict type mismatch between @midl/executor and local utility
            const result = await executeMidlTransaction([intention as any], setTxStatus)
            const hashes = result.evmTxHashes
            setBtcTxId(result.btcTxId)

            // Wait for EVM transaction confirmation
            if (hashes.length > 0) {
                setTxStatus('Waiting for confirmation...')
                setEvmTxHash(hashes[0])
                const receipt = await publicClient.waitForTransactionReceipt({
                    hash: hashes[0] as `0x${string}`
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
                const [vaultResponse, pendingResponse] = await Promise.all([
                    refetchVault(),
                    connectedBtcAddress ? refetchPending() : Promise.resolve({ data: undefined }),
                ])
                const v = vaultResponse.data as any
                const pending = pendingResponse.data as bigint | undefined

                // If we claimed, wait for claimed flag.
                let done = false
                if (functionName === 'claimInheritance') {
                    if (v?.isClaimed && typeof pending === 'bigint') done = true
                } else if (functionName === 'withdraw') {
                    if (typeof pending === 'bigint' && pending === 0n) done = true
                } else {
                    done = true
                }

                if (!done && attempts < 20) { // Try for ~40 seconds
                    setTimeout(pollForUpdate, 2000)
                } else {
                    setTxStatus(null)
                    setActiveAction(null)
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
            setActiveAction(null)
        }
    }

    const handleClaim = () => {
        setTxError(null)
        setTxSuccess(false)
        setEvmTxHash(null)
        setBtcTxId(null)
        if (isXverseConnected) {
            sendViaXverse('claimInheritance', [ownerAddress as `0x${string}`, connectedBtcAddress], 'claim')
        } else {
            setActiveAction('claim')
            writeContract({
                address: CONTRACT_ADDRESS, abi: ABI,
                functionName: 'claimInheritance',
                args: [ownerAddress as `0x${string}`, connectedBtcAddress],
            })
        }
    }

    const handleWithdraw = () => {
        setTxError(null)
        setTxSuccess(false)
        setEvmTxHash(null)
        setBtcTxId(null)
        if (isXverseConnected) {
            sendViaXverse('withdraw', [connectedBtcAddress], 'withdraw')
        } else {
            setActiveAction('withdraw')
            writeContract({
                address: CONTRACT_ADDRESS, abi: ABI,
                functionName: 'withdraw',
                args: [connectedBtcAddress],
            })
        }
    }

    const status = statusData as any
    const pendingAmount = pendingData as bigint | undefined
    const pendingKnown = typeof pendingAmount === 'bigint'
    const pendingLoading = isPendingLoading || isPendingFetching
    const hasPending = pendingKnown && pendingAmount > 0n
    const isPending = isWritePending || isConfirming || txStatus !== null
    const evmTxLinkHash = evmTxHash ?? (hash ? String(hash) : null)
    const timeRemaining = typeof status?.timeRemaining === 'bigint'
        ? status.timeRemaining
        : BigInt(status?.timeRemaining ?? 0)
    const inGracePeriod = status && !status.expired && timeRemaining === 0n

    // Treat vault as claimed if either on-chain status says so OR local claim succeeded
    const isClaimed = status?.claimed || txSuccess

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center space-y-6 p-10 bg-surface rounded-2xl border border-border shadow-soft">
                <h2 className="text-2xl font-display">Connect Wallet to Claim</h2>
                <div className="w-full max-w-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2 text-center">Bitcoin Wallet</p>
                    <button
                        onClick={connectXverse}
                        disabled={xverseConnecting}
                        className="w-full border border-ink/20 text-ink font-semibold py-3 px-6 rounded-lg hover:bg-ink/5 disabled:opacity-50 transition-colors"
                    >
                        {xverseConnecting ? 'Connecting...' : 'Connect Xverse'}
                    </button>
                    {xverseError && <p className="text-brick text-xs mt-2 text-center">{xverseError}</p>}
                </div>
            </div>
        )
    }

    if (!isSearching) {
        return (
            <div className="bg-surface p-8 rounded-2xl shadow-soft border border-border text-center">
                <h2 className="text-3xl font-display mb-6">Claim Inheritance</h2>
                {connectedBtcAddress && (
                    <div className="mb-6 bg-paper p-3 rounded-lg border border-border">
                        <span className="text-xs uppercase tracking-[0.2em] text-muted">Your Bitcoin Address</span>
                        <p className="text-sm text-ink font-mono break-all">{connectedBtcAddress}</p>
                    </div>
                )}
                <div className="max-w-md mx-auto">
                    <label className="block text-left text-xs uppercase tracking-[0.2em] text-muted mb-2">Vault Owner's Midl Address</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={ownerAddress}
                            onChange={(e) => setOwnerAddress(e.target.value)}
                            placeholder="0x..."
                            className="flex-grow bg-paper border border-border rounded p-2 text-ink placeholder:text-muted focus:border-ink/30 outline-none"
                        />
                        <button
                            onClick={handleSearch}
                            disabled={!ownerAddress}
                            className="bg-ink text-paper font-semibold py-2 px-6 rounded hover:bg-ink/90 disabled:opacity-50"
                        >
                            Search
                        </button>
                    </div>
                    <p className="text-xs text-muted mt-2">Ask the vault creator for their Midl address (derived from their Bitcoin wallet).</p>
                </div>
            </div>
        )
    }

    if (statusError || heirsError) {
        return (
            <div className="bg-surface p-8 rounded-2xl text-center border border-border shadow-soft">
                <h2 className="text-2xl font-display mb-4">Unable to Load Vault</h2>
                <p className="text-muted text-sm break-words">
                    {(statusError || heirsError) instanceof Error
                        ? (statusError || heirsError as Error).message
                        : 'RPC read failed.'}
                </p>
                <button
                    onClick={() => refetchStatus()}
                    className="mt-6 border border-ink/20 text-ink font-semibold py-2 px-6 rounded-lg hover:bg-ink/5 transition-colors"
                >
                    Retry
                </button>
            </div>
        )
    }

    if (isStatusLoading || isStatusFetching) {
        return (
            <div className="bg-surface p-8 rounded-2xl text-center border border-border shadow-soft">
                <h2 className="text-2xl font-display mb-2">Loading Vault</h2>
                <p className="text-muted text-sm">Fetching on-chain state...</p>
            </div>
        )
    }

    if (!status || !status.exists) {
        return (
            <div className="bg-surface p-8 rounded-2xl text-center border border-border shadow-soft">
                <h2 className="text-2xl font-display mb-4">No Vault Found</h2>
                <button onClick={() => setIsSearching(false)} className="text-accent hover:text-accent/80">Search Again</button>
            </div>
        )
    }

    const canClaim = status.expired && status.active && isHeir

    return (
        <div className="bg-surface p-8 rounded-2xl shadow-soft border border-border">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-display">Claim Inheritance</h2>
                <button onClick={() => setIsSearching(false)} className="text-sm text-muted hover:text-ink">Change Address</button>
            </div>

            {connectedBtcAddress && (
                <div className="mb-6 bg-paper p-3 rounded-lg border border-border">
                    <span className="text-xs uppercase tracking-[0.2em] text-muted">Your Bitcoin Address</span>
                    <p className="text-sm text-ink font-mono break-all mb-2">{connectedBtcAddress}</p>

                    {evmAddress && (
                        <>
                            <div className="border-t border-border my-2 pt-2">
                                <span className="text-xs uppercase tracking-[0.2em] text-muted">Your Midl EVM Address (for receiving funds)</span>
                                <p className="text-xs text-muted font-mono break-all">{evmAddress}</p>
                            </div>
                            <div>
                                <span className="text-xs uppercase tracking-[0.2em] text-muted">Current Balance</span>
                                <p className="text-sm text-ink font-semibold">
                                    {balanceData ? parseFloat(formatEther(balanceData.value)).toFixed(4) : '0.000'} BTC
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-paper p-4 rounded-lg border border-border">
                    <p className="text-muted text-sm">Vault Status</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span
                            className={`h-3 w-3 rounded-full ${status.active && !isClaimed
                                ? 'bg-sage'
                                : isClaimed
                                    ? 'bg-slate'
                                    : 'bg-brick'}`}
                        ></span>
                        <p className="font-display text-lg">
                            {isClaimed ? 'Claimed' : status.expired ? 'Expired (Ready)' : 'Active (Locked)'}
                        </p>
                    </div>
                </div>
                <div className="bg-paper p-4 rounded-lg border border-border">
                    <p className="text-muted text-sm">Your Status</p>
                    <p className={`font-display text-lg ${isHeir ? 'text-sage' : 'text-brick'}`}>
                        {isHeir ? '✓ Beneficiary' : 'Not a Beneficiary'}
                    </p>
                </div>
            </div>

            {Array.isArray(heirsData) && heirsData.length > 0 && (
                <div className="mb-6 bg-paper p-4 rounded-lg border border-border">
                    <p className="text-muted text-sm mb-2">Heirs</p>
                    {(heirsData as any[]).map((h: any, i: number) => (
                        <div key={i} className={`flex justify-between items-center py-1 ${h.btcAddress === connectedBtcAddress ? 'text-accent' : 'text-ink'}`}>
                            <span className="font-mono text-sm break-all">{h.btcAddress}</span>
                            <span className="text-sm ml-2">{String(h.percentage)}%</span>
                        </div>
                    ))}
                </div>
            )}

            {txStatus && (
                <div className="mb-4 bg-paper border border-border rounded-lg p-3 text-sm text-muted flex items-center justify-center gap-2 animate-pulse">
                    <span className="inline-block h-2 w-2 rounded-full bg-ink/40"></span>
                    {txStatus}
                </div>
            )}

            <TxLinks className="mb-4" evmTxHash={evmTxLinkHash} btcTxId={btcTxId} />

            {isClaimed ? (
                <div className="bg-paper p-6 rounded-lg border border-border text-center">
                    <h3 className="text-xl font-display mb-4 text-sage">Funds Unlocked</h3>

                    <div className="mb-6">
                        {isHeir ? (
                            hasPending ? (
                                <div>
                                    <p className="text-muted mb-4">Your share is ready to withdraw.</p>
                                    <p className="text-muted text-sm mb-2">Pending Withdrawal: {String(pendingAmount)} wei</p>
                                    <button
                                        onClick={handleWithdraw}
                                        disabled={isPending || pendingLoading}
                                        className="bg-ink text-paper font-semibold py-3 px-8 rounded-lg hover:bg-ink/90 w-full md:w-auto disabled:opacity-50"
                                    >
                                        {activeAction === 'withdraw' && txStatus ? txStatus : 'Withdraw Funds'}
                                    </button>
                                </div>
                            ) : pendingKnown ? (
                                <div className="p-3 bg-sage/10 border border-sage/30 rounded text-sage">
                                    <p>Funds have been withdrawn to your EVM wallet.</p>
                                </div>
                            ) : (
                                <div className="p-3 bg-paper border border-border rounded text-muted">
                                    <p>Syncing your withdrawal amount...</p>
                                </div>
                            )
                        ) : (
                            <div className="p-3 bg-paper border border-border rounded text-muted">
                                <p>Your BTC address is not listed as a beneficiary for this vault.</p>
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-muted mt-4">
                        {isHeir && (!pendingKnown || pendingLoading || hasPending)
                            ? 'Step 2 of 2: Withdraw Funds'
                            : 'All steps completed'}
                    </p>
                </div>
            ) : canClaim ? (
                <div className="text-center">
                    <div className="bg-sage/10 border border-sage/30 p-6 rounded-lg mb-6">
                        <h3 className="text-xl font-display text-sage mb-2">Inheritance Unlocked</h3>
                        <p className="text-muted mb-4">The vault has expired and you are eligible to claim.</p>
                        <button
                            onClick={handleClaim}
                            disabled={isPending}
                            className="bg-ink text-paper font-semibold py-3 px-8 rounded-lg text-base hover:bg-ink/90 w-full md:w-auto"
                        >
                            {activeAction === 'claim' && txStatus ? txStatus : (isWritePending ? 'Confirming...' : 'Claim Inheritance')}
                        </button>
                    </div>
                    <p className="text-xs text-muted">Step 1 of 2: Claim Inheritance</p>
                </div>
            ) : (
                <div className="text-center p-6 bg-paper rounded-lg border border-border">
                    {!isHeir && (
                        <p className="text-muted">Your BTC address is not listed as a beneficiary for this vault.</p>
                    )}
                    {isHeir && !status.expired && (
                        <p className="text-muted">
                            {inGracePeriod
                                ? 'Grace period in progress (about 5 minutes). Claim opens after it ends.'
                                : 'Vault is still active. Claim opens after expiry.'}
                        </p>
                    )}
                    <div className="mt-2 text-sm text-muted">
                        Time Remaining: {String(status.timeRemaining)}s
                    </div>
                </div>
            )}

            {(writeError || txError) && (
                <div className="mt-4 bg-brick/10 p-4 rounded text-brick text-sm break-words border border-brick/30">
                    {writeError?.message || txError}
                </div>
            )}

            {txSuccess && (
                <div className="mt-4 bg-sage/10 p-4 rounded text-sage text-sm text-center border border-sage/30">
                    Transaction confirmed!
                </div>
            )}
        </div>
    )
}

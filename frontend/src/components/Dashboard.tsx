import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useWallet } from '../context/WalletContext'
import { addTxIntention } from '@midl/executor'
import { midlConfig, publicClient } from '../config'
import { formatEther, encodeFunctionData } from 'viem'
import { executeMidlTransaction } from '../utils/midlTransaction'
import TxLinks from './TxLinks'
import BitcoinAutonomousWillArtifact from '../abis/BitcoinAutonomousWill.json'

const CONTRACT_ADDRESS = BitcoinAutonomousWillArtifact.address as `0x${string}`
const ABI = BitcoinAutonomousWillArtifact.abi

export default function Dashboard() {
    const { isConnected: isWagmiConnected, address: wagmiAddress } = useAccount()

    // Shared wallet context
    const {
        isXverseConnected, paymentAccount, evmAddress, connectedBtcAddress,
        xverseConnecting, xverseError, connectXverse,
    } = useWallet()

    const [txStatus, setTxStatus] = useState<string | null>(null)
    const [txError, setTxError] = useState<string | null>(null)
    const [evmTxHash, setEvmTxHash] = useState<string | null>(null)
    const [btcTxId, setBtcTxId] = useState<string | null>(null)

    const isConnected = isWagmiConnected || isXverseConnected
    const address = isXverseConnected ? (evmAddress || wagmiAddress) : (wagmiAddress || evmAddress)

    const {
        data: statusData,
        refetch,
        isLoading: isStatusLoading,
        isFetching: isStatusFetching,
        error: statusError,
    } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getStatus',
        args: [address],
        query: {
            enabled: !!address,
        }
    })

    const { data: heirsData } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getHeirs',
        args: [address],
        query: {
            enabled: !!address,
        }
    })

    const status = statusData as any
    const heirs = Array.isArray(heirsData) ? (heirsData as any[]) : []
    const [localRemaining, setLocalRemaining] = useState<number | null>(null)
    const [endAt, setEndAt] = useState<number | null>(null)
    const [graceEndsAt, setGraceEndsAt] = useState<number | null>(null)

    const { data: hash, writeContract, error: writeError, isPending: isWritePending } = useWriteContract()
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

    useEffect(() => {
        if (isConfirmed) refetch()
    }, [isConfirmed, refetch])

    // Xverse transaction helper using full Midl flow
    const sendViaXverse = async (functionName: string, args: any[] = [], value?: bigint) => {
        if (!paymentAccount) throw new Error('No payment account')
        setTxError(null)
        setEvmTxHash(null)
        setBtcTxId(null)
        try {
            const data = encodeFunctionData({ abi: ABI, functionName, args })
            const intention = await addTxIntention(midlConfig, {
                ...(value ? { deposit: { satoshis: Number(value) } } : {}),
                evmTransaction: {
                    to: CONTRACT_ADDRESS,
                    data,
                    from: evmAddress,
                    ...(value ? { value } : {}),
                },
            }, paymentAccount.address)

            const result = await executeMidlTransaction([intention], setTxStatus)
            const [firstHash] = result.evmTxHashes
            setBtcTxId(result.btcTxId)
            if (firstHash) {
                setEvmTxHash(firstHash)
                setTxStatus('Waiting for confirmation...')
                const receipt = await publicClient.waitForTransactionReceipt({
                    hash: firstHash as `0x${string}`,
                    confirmations: 1,
                })
                if (receipt.status === 'reverted') {
                    throw new Error('Transaction reverted on-chain.')
                }
            }
            setTxStatus(null)
            refetch()
        } catch (err: any) {
            setTxError(err?.message || `${functionName} failed`)
            setTxStatus(null)
        }
    }

    const handleCheckIn = () => {
        setBtcTxId(null)
        setEvmTxHash(null)
        if (isXverseConnected) {
            sendViaXverse('checkIn')
        } else {
            writeContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'checkIn' })
        }
    }

    const handleCancel = () => {
        setBtcTxId(null)
        setEvmTxHash(null)
        if (isXverseConnected) {
            sendViaXverse('cancelVault')
        } else {
            writeContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'cancelVault' })
        }
    }

    const isPending = isWritePending || txStatus !== null

    const hasStatus = !!status && !!status.exists
    const evmTxLinkHash = evmTxHash ?? (hash ? String(hash) : null)

    useEffect(() => {
        if (!hasStatus) {
            setLocalRemaining(null)
            setEndAt(null)
            setGraceEndsAt(null)
            return
        }
        const remaining = Number(status.timeRemaining ?? 0)
        const now = Math.floor(Date.now() / 1000)
        const end = now + Math.max(remaining, 0)
        setLocalRemaining(Math.max(remaining, 0))
        setEndAt(end)
        setGraceEndsAt(end + 300)
    }, [hasStatus, status?.timeRemaining])

    useEffect(() => {
        if (!endAt) return
        const tick = () => {
            const now = Math.floor(Date.now() / 1000)
            const remaining = Math.max(endAt - now, 0)
            setLocalRemaining(remaining)
        }
        tick()
        const interval = setInterval(tick, 1000)
        return () => clearInterval(interval)
    }, [endAt])

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center space-y-6 p-10 bg-surface rounded-2xl border border-border shadow-soft">
                <h2 className="text-2xl font-display">Connect Wallet to View Dashboard</h2>
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

    if (statusError) {
        return (
            <div className="bg-surface p-8 rounded-2xl text-center border border-border shadow-soft">
                <h2 className="text-2xl font-display mb-4">Unable to Load Vault</h2>
                <p className="text-muted text-sm break-words">
                    {statusError instanceof Error ? statusError.message : 'RPC read failed.'}
                </p>
                {address && (
                    <p className="text-xs text-muted mt-4 font-mono break-all">Querying: {address}</p>
                )}
                <button
                    onClick={() => refetch()}
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
                {address && (
                    <p className="text-xs text-muted mt-4 font-mono break-all">Querying: {address}</p>
                )}
            </div>
        )
    }

    if (!hasStatus) {
        return (
            <div className="bg-surface p-8 rounded-2xl text-center border border-border shadow-soft">
                <h2 className="text-2xl font-display mb-4">No Vault Found</h2>
                <p className="text-muted">You haven't created a vault yet.</p>
                {address && (
                    <p className="text-xs text-muted mt-4 font-mono break-all">Querying: {address}</p>
                )}
                {connectedBtcAddress && (
                    <p className="text-xs text-muted mt-4 font-mono break-all">Connected: {connectedBtcAddress}</p>
                )}
                {evmAddress && (
                    <p className="text-xs text-muted mt-1 font-mono break-all">EVM: {evmAddress}</p>
                )}
            </div>
        )
    }

    const totalInterval = Number(status.interval ?? 0)
    const remaining = localRemaining ?? Number(status.timeRemaining ?? 0)
    const progress = totalInterval > 0 ? ((totalInterval - Math.min(remaining, totalInterval)) / totalInterval) * 100 : 0
    const clampedProgress = Math.min(Math.max(progress, 0), 100)
    const isExpiredLocal = status.expired || (graceEndsAt !== null && Math.floor(Date.now() / 1000) >= graceEndsAt)

    // Format time remaining — show minutes and seconds if < 1 day
    const days = Math.floor(remaining / 86400)
    const hours = Math.floor((remaining % 86400) / 3600)
    const mins = Math.floor((remaining % 3600) / 60)
    const secs = remaining % 60
    const timeDisplay = days > 0
        ? `${days}d ${hours}h ${mins}m`
        : hours > 0
            ? `${hours}h ${mins}m ${secs}s`
            : `${mins}m ${secs}s`

    return (
        <div className="bg-surface p-8 rounded-2xl shadow-soft border border-border">
            <h2 className="text-3xl font-display mb-6">Vault Dashboard</h2>

            {connectedBtcAddress && (
                <div className="mb-6 bg-paper p-3 rounded-lg border border-border">
                    <span className="text-xs uppercase tracking-[0.2em] text-muted">Your Bitcoin Address</span>
                    <p className="text-sm text-ink font-mono break-all">{connectedBtcAddress}</p>
                    {evmAddress && (
                        <>
                            <span className="text-xs uppercase tracking-[0.2em] text-muted mt-2 block">Derived EVM Address</span>
                            <p className="text-xs text-muted font-mono break-all">{evmAddress}</p>
                        </>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-paper p-4 rounded-lg border border-border">
                    <p className="text-muted text-sm">Vault Balance</p>
                    <p className="text-2xl font-display">{formatEther(status.balance)} BTC</p>
                </div>
                <div className="bg-paper p-4 rounded-lg border border-border">
                    <p className="text-muted text-sm">Status</p>
                    <div className="flex items-center gap-2">
                        <span
                            className={`h-3 w-3 rounded-full ${status.claimed
                                ? 'bg-slate'
                                : isExpiredLocal
                                    ? 'bg-brick'
                                    : status.active
                                        ? 'bg-sage'
                                        : 'bg-slate'}`}
                        ></span>
                        <p className="text-xl font-display">
                            {status.claimed ? 'Claimed' : isExpiredLocal ? 'Expired' : status.active ? 'Active' : 'Inactive'}
                        </p>
                    </div>
                </div>
            </div>

            {heirs.length > 0 && (
                <div className="mb-6 bg-paper p-4 rounded-lg border border-border">
                    <p className="text-muted text-sm mb-2">Heirs (Bitcoin Addresses)</p>
                    {heirs.map((h: any, i: number) => (
                        <div key={i} className="flex justify-between items-center py-1 text-ink">
                            <span className="font-mono text-sm break-all">{h.btcAddress}</span>
                            <span className="text-sm ml-2">{String(h.percentage)}%</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="mb-8">
                <div className="flex justify-between mb-2">
                    <p className="text-muted">Time Until Expiry</p>
                    <p className="text-ink font-mono">{timeDisplay}</p>
                </div>
                <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                    <div
                        className={`h-full ${remaining < 60 ? 'bg-brick' : remaining < 300 ? 'bg-accent' : 'bg-sage'}`}
                        style={{ width: `${100 - clampedProgress}%` }}
                    ></div>
                </div>
                <p className="text-xs text-muted mt-2 text-right">Check-in resets this timer.</p>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={handleCheckIn}
                    disabled={!status.active || status.claimed || isExpiredLocal || isPending || isConfirming}
                    className="flex-1 bg-ink text-paper font-semibold py-3 px-6 rounded-lg transition-colors hover:bg-ink/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {txStatus || (isWritePending ? 'Confirming...' : 'Check In')}
                </button>

                <button
                    onClick={handleCancel}
                    disabled={!status.active || isExpiredLocal || isPending || isConfirming}
                    className="flex-1 border border-brick/40 text-brick font-semibold py-3 px-6 rounded-lg transition-colors hover:bg-brick/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Cancel Vault
                </button>
            </div>

            <TxLinks className="mt-4" evmTxHash={evmTxLinkHash} btcTxId={btcTxId} />

            {(writeError || txError) && (
                <div className="mt-4 bg-brick/10 p-4 rounded text-brick text-sm break-words border border-brick/30">
                    {writeError?.message || txError}
                </div>
            )}

            {isConfirmed && (
                <div className="mt-4 bg-sage/10 p-4 rounded text-sage text-sm text-center border border-sage/30">
                    Transaction confirmed!
                </div>
            )}
        </div>
    )
}

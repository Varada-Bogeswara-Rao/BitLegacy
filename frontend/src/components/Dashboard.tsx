import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useWallet } from '../context/WalletContext'
import { addTxIntention } from '@midl/executor'
import { midlConfig } from '../config'
import { formatEther, encodeFunctionData } from 'viem'
import { executeMidlTransaction } from '../utils/midlTransaction'
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

    const isConnected = isWagmiConnected || isXverseConnected
    const address = wagmiAddress || evmAddress

    const { data: statusData, refetch } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getStatus',
        args: [address],
        query: {
            enabled: !!address,
            refetchInterval: 5000,
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

    const { data: hash, writeContract, error: writeError, isPending: isWritePending } = useWriteContract()
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

    if (isConfirmed) {
        refetch()
    }

    // Xverse transaction helper using full Midl flow
    const sendViaXverse = async (functionName: string, args: any[] = [], value?: bigint) => {
        if (!paymentAccount) throw new Error('No payment account')
        setTxError(null)
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

            await executeMidlTransaction([intention], paymentAccount, setTxStatus)
            setTxStatus(null)
            refetch()
        } catch (err: any) {
            setTxError(err?.message || `${functionName} failed`)
            setTxStatus(null)
        }
    }

    const handleCheckIn = () => {
        if (isXverseConnected) {
            sendViaXverse('checkIn')
        } else {
            writeContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'checkIn' })
        }
    }

    const handleCancel = () => {
        if (isXverseConnected) {
            sendViaXverse('cancelVault')
        } else {
            writeContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'cancelVault' })
        }
    }

    const isPending = isWritePending || txStatus !== null

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center space-y-6 p-10 bg-gray-800 rounded-xl">
                <h2 className="text-2xl font-bold">Connect Wallet to View Dashboard</h2>
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

    if (!status || !status.exists) {
        return (
            <div className="bg-gray-800 p-8 rounded-xl text-center">
                <h2 className="text-2xl font-bold mb-4">No Vault Found</h2>
                <p className="text-gray-400">You haven't created a vault yet.</p>
                {connectedBtcAddress && (
                    <p className="text-xs text-gray-500 mt-4 font-mono break-all">Connected: {connectedBtcAddress}</p>
                )}
                {evmAddress && (
                    <p className="text-xs text-gray-500 mt-1 font-mono break-all">EVM: {evmAddress}</p>
                )}
            </div>
        )
    }

    const totalInterval = Number(status.interval)
    const remaining = Number(status.timeRemaining)
    const progress = totalInterval > 0 ? ((totalInterval - remaining) / totalInterval) * 100 : 0
    const clampedProgress = Math.min(Math.max(progress, 0), 100)

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
        <div className="bg-gray-800 p-8 rounded-xl shadow-xl border border-gray-700">
            <h2 className="text-3xl font-bold mb-6 text-amber-500">Vault Dashboard</h2>

            {connectedBtcAddress && (
                <div className="mb-6 bg-gray-900/60 p-3 rounded-lg border border-gray-700">
                    <span className="text-xs text-gray-500">Your Bitcoin Address</span>
                    <p className="text-sm text-amber-400 font-mono break-all">{connectedBtcAddress}</p>
                    {evmAddress && (
                        <>
                            <span className="text-xs text-gray-500 mt-1 block">Derived EVM Address</span>
                            <p className="text-xs text-gray-400 font-mono break-all">{evmAddress}</p>
                        </>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Vault Balance</p>
                    <p className="text-2xl font-bold text-white">{formatEther(status.balance)} BTC</p>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Status</p>
                    <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${status.active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        <p className="text-xl font-bold text-white">
                            {status.claimed ? 'Claimed' : status.expired ? 'Expired' : status.active ? 'Active' : 'Inactive'}
                        </p>
                    </div>
                </div>
            </div>

            {heirsData && (heirsData as any[]).length > 0 && (
                <div className="mb-6 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-sm mb-2">Heirs (Bitcoin Addresses)</p>
                    {(heirsData as any[]).map((h: any, i: number) => (
                        <div key={i} className="flex justify-between items-center py-1 text-gray-300">
                            <span className="font-mono text-sm break-all">{h.btcAddress}</span>
                            <span className="text-sm ml-2">{String(h.percentage)}%</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="mb-8">
                <div className="flex justify-between mb-2">
                    <p className="text-gray-400">Time Until Expiry</p>
                    <p className="text-white font-mono">{timeDisplay}</p>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                    <div
                        className={`h-full ${remaining < 60 ? 'bg-red-500' : remaining < 300 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${100 - clampedProgress}%` }}
                    ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-right">Check-in resets this timer.</p>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={handleCheckIn}
                    disabled={!status.active || status.claimed || isPending || isConfirming}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {txStatus || (isWritePending ? 'Confirming...' : 'Check In')}
                </button>

                <button
                    onClick={handleCancel}
                    disabled={!status.active || status.expired || isPending || isConfirming}
                    className="flex-1 bg-red-900/50 hover:bg-red-900 text-red-300 border border-red-800 font-bold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Cancel Vault
                </button>
            </div>

            {(writeError || txError) && (
                <div className="mt-4 bg-red-900/50 p-4 rounded text-red-200 text-sm break-words">
                    {writeError?.message || txError}
                </div>
            )}

            {isConfirmed && (
                <div className="mt-4 bg-green-900/50 p-4 rounded text-green-200 text-sm text-center">
                    Transaction confirmed!
                </div>
            )}
        </div>
    )
}

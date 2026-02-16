import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useWallet } from '../context/WalletContext'
import { addTxIntention } from '@midl/executor'
import { midlConfig } from '../config'
import { hexToString, encodeFunctionData } from 'viem'
import { executeMidlTransaction } from '../utils/midlTransaction'
import BitcoinAutonomousWillArtifact from '../abis/BitcoinAutonomousWill.json'

const CONTRACT_ADDRESS = BitcoinAutonomousWillArtifact.address as `0x${string}`
const ABI = BitcoinAutonomousWillArtifact.abi

type VaultStruct = {
    createdAt: bigint
    lastCheckIn: bigint
    checkInInterval: bigint
    messageHash: string
    encryptedMessage: string
    isActive: boolean
    isClaimed: boolean
    claimInitiated: boolean
    messageRevealed: boolean
}

export default function Claim() {
    const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount()
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
        args: [ownerAddress as `0x${string}`],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const { data: heirsData } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getHeirs',
        args: [ownerAddress as `0x${string}`],
        query: {
            enabled: isSearching && !!ownerAddress,
        }
    })

    const { data: vaultData, refetch: refetchVault } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'vaults',
        args: [ownerAddress as `0x${string}`],
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

    const { data: hash, writeContract, error: writeError, isPending: isWritePending } = useWriteContract()
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

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
                evmTransaction: { to: CONTRACT_ADDRESS, data, from: evmAddress },
            }, paymentAccount.address)

            await executeMidlTransaction([intention], paymentAccount, setTxStatus)
            setTxStatus(null)
            setTxSuccess(true)
            refetchVault()
            refetchStatus()
        } catch (err: any) {
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
            sendViaXverse('claimInheritance', [ownerAddress as `0x${string}`, connectedBtcAddress])
        } else {
            writeContract({
                address: CONTRACT_ADDRESS, abi: ABI,
                functionName: 'claimInheritance',
                args: [ownerAddress as `0x${string}`, connectedBtcAddress],
            })
        }
    }

    const handleWithdraw = () => {
        if (isXverseConnected) {
            sendViaXverse('withdraw', [connectedBtcAddress])
        }
    }

    const handleReveal = () => {
        if (isXverseConnected) {
            sendViaXverse('revealMessage', [ownerAddress as `0x${string}`, connectedBtcAddress])
        } else {
            writeContract({
                address: CONTRACT_ADDRESS, abi: ABI,
                functionName: 'revealMessage',
                args: [ownerAddress as `0x${string}`, connectedBtcAddress],
            })
        }
    }

    const vault = vaultData as any as VaultStruct
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
    const isMessageRevealed = vault?.messageRevealed
    const messageBytes = vault?.encryptedMessage
    const revealedMessage = (isMessageRevealed && messageBytes) ? hexToString(messageBytes as `0x${string}`) : ''

    return (
        <div className="bg-gray-800 p-8 rounded-xl shadow-xl border border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-amber-500">Claim Inheritance</h2>
                <button onClick={() => setIsSearching(false)} className="text-sm text-gray-400 hover:text-white">Change Address</button>
            </div>

            {connectedBtcAddress && (
                <div className="mb-4 bg-gray-900/60 p-3 rounded-lg border border-gray-700">
                    <span className="text-xs text-gray-500">Your Bitcoin Address</span>
                    <p className="text-sm text-amber-400 font-mono break-all">{connectedBtcAddress}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Vault Status</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`h-3 w-3 rounded-full ${status.active && !isClaimed ? 'bg-green-500' : isClaimed ? 'bg-blue-500' : 'bg-red-500'}`}></span>
                        <p className="font-bold text-white text-lg">
                            {isClaimed ? 'Claimed' : status.expired ? 'Expired (Ready)' : 'Active (Locked)'}
                        </p>
                    </div>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Your Status</p>
                    <p className={`font-bold text-lg ${isHeir ? 'text-green-400' : 'text-red-400'}`}>
                        {isHeir ? '✓ Beneficiary' : 'Not a Beneficiary'}
                    </p>
                </div>
            </div>

            {heirsData && (heirsData as any[]).length > 0 && (
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
                    <h3 className="text-xl font-bold mb-4 text-purple-400">✨ Final Message ✨</h3>
                    {isMessageRevealed ? (
                        <div className="p-4 bg-black/30 rounded border border-purple-500/30 font-serif italic text-lg text-gray-200">
                            "{revealedMessage}"
                        </div>
                    ) : (
                        <button
                            onClick={handleReveal}
                            disabled={isPending}
                            className="bg-purple-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-purple-400 mb-4"
                        >
                            {txStatus || (isWritePending ? 'Revealing...' : 'Reveal Message')}
                        </button>
                    )}

                    {isHeir && pendingAmount && pendingAmount > 0n && (
                        <div className="mt-4">
                            <p className="text-gray-400 text-sm mb-2">Pending Withdrawal: {String(pendingAmount)} wei</p>
                            <button
                                onClick={handleWithdraw}
                                disabled={isPending}
                                className="bg-green-500 text-black font-bold py-2 px-6 rounded-lg hover:bg-green-400"
                            >
                                {txStatus || 'Withdraw Funds'}
                            </button>
                        </div>
                    )}

                    <p className="text-xs text-gray-500 mt-4">Funds have been distributed. Connect your Bitcoin wallet to withdraw.</p>
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

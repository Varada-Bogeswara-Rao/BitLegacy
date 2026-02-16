import { useState } from 'react'
import { useAccount, useConnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useWallet } from '../context/WalletContext'
import { addTxIntention, weiToSatoshis } from '@midl/executor'
import { midlConfig } from '../config'
import { encodeFunctionData, parseEther, stringToHex } from 'viem'
import { executeMidlTransaction } from '../utils/midlTransaction'
import BitcoinAutonomousWillArtifact from '../abis/BitcoinAutonomousWill.json'

const CONTRACT_ADDRESS = BitcoinAutonomousWillArtifact.address as `0x${string}`
const ABI = BitcoinAutonomousWillArtifact.abi

type Heir = {
    btcAddress: string
    percentage: string
}

export default function CreateVault() {
    const { isConnected: isWagmiConnected, address: wagmiAddress } = useAccount()
    const { connectors, connect: wagmiConnect } = useConnect()
    const { data: hash, writeContract, error: writeError, isPending: isWritePending } = useWriteContract()
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

    // Shared wallet context
    const {
        isXverseConnected, paymentAccount, evmAddress, connectedBtcAddress,
        xverseConnecting, xverseError, connectXverse,
    } = useWallet()

    const [heirs, setHeirs] = useState<Heir[]>([{ btcAddress: '', percentage: '100' }])
    const [interval, setInterval] = useState('1')
    const [message, setMessage] = useState('')
    const [fundingAmount, setFundingAmount] = useState('0.0001')
    const [txStatus, setTxStatus] = useState<string | null>(null)
    const [txError, setTxError] = useState<string | null>(null)
    const [txSuccess, setTxSuccess] = useState(false)

    const isConnected = isWagmiConnected || isXverseConnected
    const connectedAddress = connectedBtcAddress || wagmiAddress || ''
    const totalPercentage = heirs.reduce((sum, h) => sum + (parseInt(h.percentage) || 0), 0)
    const isValidTotal = totalPercentage === 100

    const addHeir = () => setHeirs([...heirs, { btcAddress: '', percentage: '0' }])
    const removeHeir = (index: number) => setHeirs(heirs.filter((_, i) => i !== index))
    const updateHeir = (index: number, field: keyof Heir, value: string) => {
        const newHeirs = [...heirs]
        newHeirs[index][field] = value
        setHeirs(newHeirs)
    }

    const handleCreateViaXverse = async () => {
        if (!isValidTotal || !paymentAccount) return
        setTxStatus('Preparing transaction...')
        setTxError(null)

        try {
            const formattedHeirs = heirs.map(h => ({
                btcAddress: h.btcAddress,
                percentage: BigInt(h.percentage),
            }))
            const intervalMinutes = BigInt(interval)
            const encryptedMessage = stringToHex(message)
            const value = parseEther(fundingAmount)

            const data = encodeFunctionData({
                abi: ABI,
                functionName: 'createVault',
                args: [formattedHeirs, intervalMinutes, encryptedMessage],
            })

            // Create the intention
            const intention = await addTxIntention(midlConfig, {
                deposit: { satoshis: Number(weiToSatoshis(value)) },
                evmTransaction: {
                    to: CONTRACT_ADDRESS,
                    data: data,
                    value: value,
                    from: evmAddress,
                },
            }, paymentAccount.address)

            // Full Midl flow: sign → broadcast → wait for BTC + EVM confirmation
            await executeMidlTransaction([intention], paymentAccount, setTxStatus)

            setTxStatus(null)
            setTxSuccess(true)
        } catch (err: any) {
            console.error('[Xverse] Create vault error:', err)
            setTxError(err?.message || 'Transaction failed')
            setTxStatus(null)
        }
    }

    const handleCreateViaWagmi = async () => {
        if (!isValidTotal) return
        const formattedHeirs = heirs.map(h => ({
            btcAddress: h.btcAddress,
            percentage: BigInt(h.percentage),
        }))
        writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'createVault',
            args: [formattedHeirs, BigInt(interval), stringToHex(message)],
            value: parseEther(fundingAmount),
        })
    }

    const handleCreate = isXverseConnected ? handleCreateViaXverse : handleCreateViaWagmi
    const isPending = isWritePending || txStatus !== null

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center space-y-6 p-10 bg-gray-800 rounded-xl">
                <h2 className="text-2xl font-bold">Connect Wallet to Create Vault</h2>
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
                <div className="w-full max-w-sm">
                    <p className="text-sm text-gray-400 mb-2 text-center">EVM Wallets</p>
                    <div className="flex flex-col gap-2">
                        {connectors.map((connector) => (
                            <button
                                key={connector.uid}
                                onClick={() => wagmiConnect({ connector })}
                                className="w-full bg-gray-700 text-white font-bold py-2 px-6 rounded-lg hover:bg-gray-600 transition-colors"
                            >
                                {connector.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    const showSuccess = isConfirmed || txSuccess

    return (
        <div className="bg-gray-800 p-8 rounded-xl shadow-xl border border-gray-700">
            <h2 className="text-3xl font-bold mb-6 text-amber-500">Create Your Will</h2>

            <div className="mb-6 bg-gray-900/60 p-3 rounded-lg border border-gray-700 flex items-center justify-between">
                <div>
                    <span className="text-xs text-gray-500">Connected as</span>
                    <p className="text-sm text-amber-400 font-mono break-all">{connectedAddress}</p>
                </div>
                <span className="text-green-400 text-xs font-bold px-2 py-1 bg-green-900/40 rounded">
                    {isXverseConnected ? '🟠 Xverse' : '🔵 EVM'}
                </span>
            </div>

            {showSuccess ? (
                <div className="bg-green-900/50 p-6 rounded-lg border border-green-500 text-center">
                    <h3 className="text-2xl font-bold text-green-400 mb-2">Vault Created Successfully!</h3>
                    <p className="text-gray-300">Your legacy is secured on Bitcoin.</p>
                    {hash && <div className="mt-4 text-sm text-gray-400 break-all">Tx: {hash}</div>}
                </div>
            ) : (
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Funding Amount (BTC)</label>
                        <input
                            type="number"
                            value={fundingAmount}
                            onChange={(e) => setFundingAmount(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-amber-500 outline-none"
                            step="0.0001"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Check-in Interval (Minutes)</label>
                        <input
                            type="number"
                            value={interval}
                            onChange={(e) => setInterval(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-amber-500 outline-none"
                            min="1"
                        />
                        <p className="text-xs text-gray-500 mt-1">If you don't check in within this time, heirs can claim. Use 1 for quick testing.</p>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-400">Heirs</label>
                            <span className={`text-sm font-bold ${isValidTotal ? 'text-green-400' : 'text-red-400'}`}>
                                Total: {totalPercentage}%
                            </span>
                        </div>
                        <div className="space-y-3">
                            {heirs.map((heir, index) => (
                                <div key={index} className="flex gap-2 items-start">
                                    <input
                                        type="text"
                                        placeholder="Bitcoin Address (tb1q..., bc1q...)"
                                        value={heir.btcAddress}
                                        onChange={(e) => updateHeir(index, 'btcAddress', e.target.value)}
                                        className="flex-grow bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm focus:border-amber-500 outline-none"
                                    />
                                    <div className="relative w-24">
                                        <input
                                            type="number"
                                            value={heir.percentage}
                                            onChange={(e) => updateHeir(index, 'percentage', e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm focus:border-amber-500 outline-none pr-6"
                                        />
                                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                                    </div>
                                    {heirs.length > 1 && (
                                        <button onClick={() => removeHeir(index)} className="text-red-400 hover:text-red-300 p-2">✕</button>
                                    )}
                                </div>
                            ))}
                            <button onClick={addHeir} disabled={heirs.length >= 10} className="text-sm text-amber-500 hover:text-amber-400 font-medium">
                                + Add Heir
                            </button>
                        </div>
                        {!isValidTotal && <p className="text-red-400 text-xs mt-1">Total percentage must equal 100%.</p>}
                        <p className="text-gray-500 text-xs mt-2">💡 Heirs connect their Bitcoin wallet to claim. Enter their Bitcoin address here.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Final Message</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="A secret message to be revealed..."
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white h-24 focus:border-amber-500 outline-none resize-none"
                            maxLength={500}
                        />
                    </div>

                    <button
                        onClick={handleCreate}
                        disabled={!isValidTotal || isPending || !isConnected}
                        className={`w-full py-3 rounded-lg font-bold text-lg transition-colors ${!isValidTotal || isPending
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-amber-500 text-black hover:bg-amber-400'
                            }`}
                    >
                        {txStatus || (isWritePending ? 'Confirm in Wallet...' : isConfirming ? 'Creating Vault...' : 'Create Vault')}
                    </button>

                    {(writeError || txError) && (
                        <div className="bg-red-900/50 p-4 rounded text-red-200 text-sm break-words">
                            {writeError?.message || txError}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

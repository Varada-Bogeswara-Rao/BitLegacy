import { useState } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useWallet } from '../context/WalletContext'
import { addTxIntention, weiToSatoshis } from '@midl/executor'
import { midlConfig, publicClient } from '../config'
import { encodeFunctionData, formatEther, parseEther } from 'viem'
import { executeMidlTransaction } from '../utils/midlTransaction'
import TxLinks from './TxLinks'
import BitcoinAutonomousWillArtifact from '../abis/BitcoinAutonomousWill.json'

const CONTRACT_ADDRESS = BitcoinAutonomousWillArtifact.address as `0x${string}`
const ABI = BitcoinAutonomousWillArtifact.abi

type Heir = {
    btcAddress: string
    percentage: string
}

type CreateVaultProps = {
    onNavigate?: (view: 'landing' | 'create' | 'dashboard' | 'claim') => void
}

export default function CreateVault({ onNavigate }: CreateVaultProps) {
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
    const [fundingAmount, setFundingAmount] = useState('0.0001')
    const [txStatus, setTxStatus] = useState<string | null>(null)
    const [txError, setTxError] = useState<string | null>(null)
    const [txSuccess, setTxSuccess] = useState(false)
    const [evmTxHash, setEvmTxHash] = useState<string | null>(null)
    const [btcTxId, setBtcTxId] = useState<string | null>(null)

    const isConnected = isWagmiConnected || isXverseConnected
    const connectedAddress = connectedBtcAddress || wagmiAddress || ''
    const ownerAddress = isXverseConnected ? (evmAddress || wagmiAddress) : (wagmiAddress || evmAddress)
    const ownerArg = (ownerAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`

    const { data: statusData } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'getStatus',
        args: [ownerArg],
        query: {
            enabled: !!ownerAddress,
        }
    })
    const totalPercentage = heirs.reduce((sum, h) => sum + (parseInt(h.percentage) || 0), 0)
    const isValidTotal = totalPercentage === 100
    const status = statusData as any
    const rawBalance = status?.balance ?? status?.[4] ?? 0n
    const balance = typeof rawBalance === 'bigint' ? rawBalance : BigInt(rawBalance ?? 0)
    const hasEscrow = balance > 0n
    const isClaimed = status?.claimed ?? status?.[3]
    const isExpired = status?.expired ?? status?.[2]
    const isActive = status?.active ?? status?.[1]
    const statusLabel = isClaimed ? 'Claimed' : isExpired ? 'Expired' : isActive ? 'Active' : 'Inactive'

    const addHeir = () => setHeirs([...heirs, { btcAddress: '', percentage: '0' }])
    const removeHeir = (index: number) => setHeirs(heirs.filter((_, i) => i !== index))
    const updateHeir = (index: number, field: keyof Heir, value: string) => {
        const newHeirs = [...heirs]
        newHeirs[index][field] = value
        setHeirs(newHeirs)
    }

    const handleCreateViaXverse = async () => {
        if (!isValidTotal || !paymentAccount || !evmAddress) {
            setTxError('Missing EVM address. Reconnect Xverse and try again.')
            return
        }
        if (hasEscrow) {
            setTxError('A vault already exists for this owner. Check in, cancel, or let heirs claim before creating a new vault.')
            return
        }
        setTxStatus('Preparing transaction...')
        setTxError(null)
        setEvmTxHash(null)
        setBtcTxId(null)

        try {
            const formattedHeirs = heirs.map(h => ({
                btcAddress: h.btcAddress,
                percentage: BigInt(h.percentage),
            }))
            const intervalMinutes = BigInt(interval)
            const value = parseEther(fundingAmount)

            const data = encodeFunctionData({
                abi: ABI,
                functionName: 'createVault',
                args: [formattedHeirs, intervalMinutes],
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

            // Full Midl flow: sign → broadcast
            const result = await executeMidlTransaction([intention], setTxStatus)
            const [firstHash] = result.evmTxHashes
            setBtcTxId(result.btcTxId)
            if (firstHash) {
                setEvmTxHash(firstHash)
                setTxStatus('Waiting for EVM confirmation...')
                const receipt = await publicClient.waitForTransactionReceipt({
                    hash: firstHash as `0x${string}`,
                    confirmations: 1,
                })
                if (receipt.status === 'reverted') {
                    throw new Error('EVM transaction reverted. Please check inputs and try again.')
                }
            }

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
        if (hasEscrow) {
            setTxError('A vault already exists for this owner. Check in, cancel, or let heirs claim before creating a new vault.')
            return
        }
        setBtcTxId(null)
        setEvmTxHash(null)
        const formattedHeirs = heirs.map(h => ({
            btcAddress: h.btcAddress,
            percentage: BigInt(h.percentage),
        }))
        writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'createVault',
            args: [formattedHeirs, BigInt(interval)],
            value: parseEther(fundingAmount),
        })
    }

    const handleCreate = isXverseConnected ? handleCreateViaXverse : handleCreateViaWagmi
    const isPending = isWritePending || txStatus !== null
    const evmTxLinkHash = evmTxHash ?? (hash ? String(hash) : null)

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center space-y-6 p-10 bg-surface rounded-2xl border border-border shadow-soft">
                <h2 className="text-2xl font-display">Connect Wallet to Create Vault</h2>
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
                <div className="w-full max-w-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2 text-center">EVM Wallets</p>
                    <div className="flex flex-col gap-2">
                        {connectors.map((connector) => (
                            <button
                                key={connector.uid}
                                onClick={() => wagmiConnect({ connector })}
                                className="w-full border border-ink/20 text-ink font-semibold py-2 px-6 rounded-lg hover:bg-ink/5 transition-colors"
                            >
                                {connector.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (hasEscrow) {
        return (
            <div className="bg-surface p-8 rounded-2xl shadow-soft border border-border">
                <h2 className="text-3xl font-display mb-6">Vault Already Exists</h2>

                <div className="mb-6 bg-paper p-3 rounded-lg border border-border">
                    <span className="text-xs uppercase tracking-[0.2em] text-muted">Connected as</span>
                    <p className="text-sm text-ink font-mono break-all">{connectedAddress}</p>
                    {evmAddress && (
                        <>
                            <span className="text-xs uppercase tracking-[0.2em] text-muted mt-2 block">Vault Owner (EVM)</span>
                            <p className="text-xs text-muted font-mono break-all">{evmAddress}</p>
                        </>
                    )}
                </div>

                <div className="bg-paper p-4 rounded-lg border border-border">
                    <p className="text-muted text-sm">Vault Balance</p>
                    <p className="text-2xl font-display">{formatEther(balance)} BTC</p>
                    <p className="text-xs text-muted mt-2">Status: {statusLabel}</p>
                </div>

                <p className="text-muted text-sm mt-4">
                    {isExpired
                        ? 'This vault is expired. Check in first, then cancel to create a new vault.'
                        : 'Cancel the existing vault to create a new one, or let heirs claim if you want to execute inheritance.'}
                </p>

                {onNavigate && (
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="mt-6 border border-ink/20 text-ink font-semibold py-2 px-6 rounded-lg hover:bg-ink/5 transition-colors"
                    >
                        Go to Dashboard
                    </button>
                )}
            </div>
        )
    }

    const showSuccess = isConfirmed || txSuccess

    return (
        <div className="bg-surface p-8 rounded-2xl shadow-soft border border-border">
            <h2 className="text-3xl font-display mb-6">Create Your Will</h2>

            <div className="mb-6 bg-paper p-3 rounded-lg border border-border flex items-center justify-between gap-6">
                <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-muted">Connected as</span>
                    <p className="text-sm text-ink font-mono break-all">{connectedAddress}</p>
                    {isXverseConnected && evmAddress && (
                        <>
                            <span className="text-xs uppercase tracking-[0.2em] text-muted mt-2 block">Vault Owner (EVM)</span>
                            <p className="text-xs text-muted font-mono break-all">{evmAddress}</p>
                        </>
                    )}
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded border border-slate/30 text-slate bg-slate/10">
                    {isXverseConnected ? 'Xverse' : 'EVM'}
                </span>
            </div>

            {showSuccess ? (
                <div className="bg-sage/10 p-6 rounded-lg border border-sage/30 text-center">
                    <h3 className="text-2xl font-display text-sage mb-2">Vault Created Successfully!</h3>
                    <p className="text-muted">Your legacy is secured on Bitcoin.</p>
                    <TxLinks className="mt-4 justify-center" evmTxHash={evmTxLinkHash} btcTxId={btcTxId} />
                </div>
            ) : (
                <div className="space-y-6">
                    <div>
                        <label className="block text-xs uppercase tracking-[0.2em] text-muted mb-2">Funding Amount (BTC)</label>
                        <input
                            type="number"
                            value={fundingAmount}
                            onChange={(e) => setFundingAmount(e.target.value)}
                            className="w-full bg-paper border border-border rounded p-2 text-ink placeholder:text-muted focus:border-ink/30 outline-none"
                            step="0.0001"
                        />
                    </div>

                    <div>
                        <label className="block text-xs uppercase tracking-[0.2em] text-muted mb-2">Check-in Interval (Minutes)</label>
                        <input
                            type="number"
                            value={interval}
                            onChange={(e) => setInterval(e.target.value)}
                            className="w-full bg-paper border border-border rounded p-2 text-ink placeholder:text-muted focus:border-ink/30 outline-none"
                            min="1"
                        />
                        <p className="text-xs text-muted mt-2">If you don't check in within this time, heirs can claim. Use 1 for quick testing.</p>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs uppercase tracking-[0.2em] text-muted">Heirs</label>
                            <span className={`text-sm font-semibold ${isValidTotal ? 'text-sage' : 'text-brick'}`}>
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
                                        className="flex-grow bg-paper border border-border rounded p-2 text-ink text-sm placeholder:text-muted focus:border-ink/30 outline-none"
                                    />
                                    <div className="relative w-24">
                                        <input
                                            type="number"
                                            value={heir.percentage}
                                            onChange={(e) => updateHeir(index, 'percentage', e.target.value)}
                                            className="w-full bg-paper border border-border rounded p-2 text-ink text-sm placeholder:text-muted focus:border-ink/30 outline-none pr-6"
                                        />
                                        <span className="absolute right-2 top-2 text-muted">%</span>
                                    </div>
                                    {heirs.length > 1 && (
                                        <button onClick={() => removeHeir(index)} className="text-brick hover:text-brick/80 p-2">✕</button>
                                    )}
                                </div>
                            ))}
                            <button onClick={addHeir} disabled={heirs.length >= 10} className="text-sm text-accent hover:text-accent/80 font-medium">
                                + Add Heir
                            </button>
                        </div>
                        {!isValidTotal && <p className="text-brick text-xs mt-2">Total percentage must equal 100%.</p>}
                        <p className="text-muted text-xs mt-2">Heirs connect their Bitcoin wallet to claim. Enter their Bitcoin address here.</p>
                    </div>

                    <button
                        onClick={handleCreate}
                        disabled={!isValidTotal || isPending || !isConnected || hasEscrow}
                        className={`w-full py-3 rounded-lg font-semibold text-base tracking-wide transition-colors ${!isValidTotal || isPending || hasEscrow
                            ? 'bg-border text-muted cursor-not-allowed'
                            : 'bg-ink text-paper hover:bg-ink/90'
                            }`}
                    >
                        {txStatus || (isWritePending ? 'Confirm in Wallet...' : isConfirming ? 'Creating Vault...' : 'Create Vault')}
                    </button>

                    <TxLinks evmTxHash={evmTxLinkHash} btcTxId={btcTxId} />

                    {(writeError || txError) && (
                        <div className="bg-brick/10 p-4 rounded text-brick text-sm break-words border border-brick/30">
                            {writeError?.message || txError}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

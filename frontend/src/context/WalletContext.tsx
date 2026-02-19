import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { connect as midlConnect, AddressPurpose, regtest } from '@midl/core'
import type { Account } from '@midl/core'
import { getEVMAddress } from '@midl/executor'
import { regtest as midlRegtest } from '@midl/core'
import { midlConfig } from '../config'

type WalletContextType = {
    xverseAccounts: Account[] | null
    isXverseConnected: boolean
    paymentAccount: Account | undefined
    evmAddress: string | null
    connectedBtcAddress: string
    xverseConnecting: boolean
    xverseError: string | null
    connectXverse: () => Promise<void>
}

const WalletContext = createContext<WalletContextType | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
    const [xverseAccounts, setXverseAccounts] = useState<Account[] | null>(null)
    const [xverseConnecting, setXverseConnecting] = useState(false)
    const [xverseError, setXverseError] = useState<string | null>(null)

    const isXverseConnected = xverseAccounts !== null && xverseAccounts.length > 0
    const paymentAccount = xverseAccounts?.find(a => a.purpose === 'payment')
    const evmAddress = paymentAccount ? getEVMAddress(paymentAccount, midlRegtest) : null
    const connectedBtcAddress = paymentAccount?.address || ''

    const connectXverse = useCallback(async () => {
        setXverseConnecting(true)
        setXverseError(null)

        const xverseProvider = typeof window !== 'undefined' && (
            (window as any).BitcoinProvider ||
            (window as any).btc_providers?.find((p: any) => p.name?.includes('Xverse'))
        )
        if (!xverseProvider) {
            setXverseError('Xverse wallet extension not detected. Please install it from xverse.app')
            setXverseConnecting(false)
            return
        }

        try {
            const accounts = await midlConnect(midlConfig, {
                purposes: [AddressPurpose.Payment, AddressPurpose.Ordinals],
                network: regtest,
            })
            setXverseAccounts(accounts)
        } catch (err: any) {
            setXverseError(err?.message || 'Failed to connect Xverse')
        } finally {
            setXverseConnecting(false)
        }
    }, [])

    // Auto-reconnect on page load if Xverse is available
    useEffect(() => {
        const tryReconnect = async () => {
            const xverseProvider = typeof window !== 'undefined' && (
                (window as any).BitcoinProvider ||
                (window as any).btc_providers?.find((p: any) => p.name?.includes('Xverse'))
            )
            if (!xverseProvider) return

            try {
                const accounts = await midlConnect(midlConfig, {
                    purposes: [AddressPurpose.Payment, AddressPurpose.Ordinals],
                    network: regtest,
                })
                setXverseAccounts(accounts)
            } catch {
                // Silent fail — user didn't approve or wallet not ready
            }
        }

        // Small delay to let Xverse extension inject
        const timer = setTimeout(tryReconnect, 500)

        // Listen for account changes
        const handleAccountsChanged = () => {
            // Re-run connection logic to update accounts
            tryReconnect()
        }

        const xverseProvider = typeof window !== 'undefined' && (
            (window as any).BitcoinProvider ||
            (window as any).btc_providers?.find((p: any) => p.name?.includes('Xverse'))
        )

        if (xverseProvider) {
            // Try standard event (EIP-1193 style if supported) or specific Xverse events
            // Xverse often emits 'accountsChanged' on the provider object
            xverseProvider.on?.('accountsChanged', handleAccountsChanged)
        }

        return () => {
            clearTimeout(timer)
            if (xverseProvider) {
                xverseProvider.removeListener?.('accountsChanged', handleAccountsChanged)
            }
        }
    }, [])

    return (
        <WalletContext.Provider value={{
            xverseAccounts,
            isXverseConnected,
            paymentAccount,
            evmAddress,
            connectedBtcAddress,
            xverseConnecting,
            xverseError,
            connectXverse,
        }}>
            {children}
        </WalletContext.Provider>
    )
}

export function useWallet() {
    const ctx = useContext(WalletContext)
    if (!ctx) throw new Error('useWallet must be used within WalletProvider')
    return ctx
}


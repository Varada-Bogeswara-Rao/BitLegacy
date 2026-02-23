type TxLinksProps = {
    evmTxHash?: string | null
    btcTxId?: string | null
    className?: string
}

const BLOCKSCOUT_BASE = 'https://blockscout.staging.midl.xyz'
const MEMPOOL_BASE = 'https://mempool.staging.midl.xyz'

const shortHash = (value: string) => {
    if (value.length <= 12) return value
    return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export default function TxLinks({ evmTxHash, btcTxId, className }: TxLinksProps) {
    if (!evmTxHash && !btcTxId) return null

    return (
        <div className={`text-xs text-muted flex flex-wrap gap-3 ${className ?? ''}`}>
            {evmTxHash && (
                <a
                    href={`${BLOCKSCOUT_BASE}/tx/${evmTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-ink"
                >
                    View EVM tx <span className="font-mono">{shortHash(evmTxHash)}</span>
                </a>
            )}
            {btcTxId && (
                <a
                    href={`${MEMPOOL_BASE}/tx/${btcTxId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-ink"
                >
                    View BTC tx <span className="font-mono">{shortHash(btcTxId)}</span>
                </a>
            )}
        </div>
    )
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from './config'
import { useState } from 'react'
import { WalletProvider } from './context/WalletContext'
import CreateVault from './components/CreateVault'
import Dashboard from './components/Dashboard'
import Claim from './components/Claim'

const queryClient = new QueryClient()

function App() {
  const [view, setView] = useState<'landing' | 'create' | 'dashboard' | 'claim'>('landing')
  const faqs = [
    {
      q: 'How does BitLegacy work?',
      a: 'You create a vault and fund it. If you stop checking in and the interval plus grace period expires, beneficiaries can claim. Funds are split on-chain by the percentages you set.',
    },
    {
      q: 'What wallets do I need?',
      a: 'You can use a regular EVM wallet or Xverse for the full Midl flow. Beneficiaries typically use their Bitcoin wallet address, and funds are received on their Midl EVM address.',
    },
    {
      q: 'When can beneficiaries claim?',
      a: 'After the check-in interval ends and the grace period expires. Until then, the vault stays locked.',
    },
    {
      q: 'What fees are involved?',
      a: 'There are on-chain transaction fees when you create a vault, check in, claim, or withdraw. The BTC step may also require a small UTXO to cover network fees.',
    },
  ]

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <div className="min-h-screen bg-paper text-ink px-6 py-8 font-body selection:bg-ink/10 selection:text-ink">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-6 mb-10">
              <button
                className="text-2xl md:text-3xl font-display tracking-tight text-ink hover:text-ink/80 transition-colors"
                onClick={() => setView('landing')}
              >
                BitLegacy
              </button>
              <nav className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.2em] text-muted">
                <button
                  className={`transition-colors ${view === 'create' ? 'text-ink' : 'hover:text-ink'}`}
                  onClick={() => setView('create')}
                >
                  Create Vault
                </button>
                <button
                  className={`transition-colors ${view === 'dashboard' ? 'text-ink' : 'hover:text-ink'}`}
                  onClick={() => setView('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  className={`transition-colors ${view === 'claim' ? 'text-ink' : 'hover:text-ink'}`}
                  onClick={() => setView('claim')}
                >
                  Claim
                </button>
              </nav>
            </header>

            <main className="max-w-4xl mx-auto">
              {view === 'landing' && (
                <div className="py-16 md:py-20">
                  <div className="text-center">
                    <h2 className="text-5xl md:text-7xl font-display mb-6 leading-tight">
                      Secure Your Legacy
                    </h2>
                    <p className="text-lg md:text-xl text-muted mb-12 max-w-2xl mx-auto leading-relaxed">
                      The first trustless inheritance protocol on Bitcoin. Split assets automatically when claimed.
                      <br /><span className="text-accent">No lawyers. Just code.</span>
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                      <button
                        className="bg-ink text-paper font-semibold py-4 px-10 rounded-full text-base tracking-wide transition-transform duration-200 hover:-translate-y-0.5"
                        onClick={() => setView('create')}
                      >
                        Start Now
                      </button>
                      <button
                        className="border border-ink/20 text-ink font-semibold py-4 px-10 rounded-full text-base tracking-wide transition-colors hover:bg-ink/5"
                        onClick={() => setView('claim')}
                      >
                        I'm a Beneficiary
                      </button>
                    </div>
                  </div>

                  <section className="mt-14 md:mt-16">
                    <div className="rounded-2xl border border-border bg-gradient-to-br from-sage/10 via-surface to-accent/10 p-6 md:p-10 shadow-soft">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">How It Works</p>
                          <h3 className="text-3xl md:text-4xl font-display">Set it once. It enforces itself.</h3>
                          <p className="text-muted mt-3 max-w-2xl leading-relaxed">
                            Create a vault, define heirs, and choose a check-in interval. If check-ins stop, the protocol
                            unlocks inheritance automatically and splits funds on-chain.
                          </p>
                        </div>
                        <div className="bg-paper/80 backdrop-blur border border-border rounded-xl p-4 text-sm">
                          <p className="text-ink font-semibold mb-1">Guarded by time</p>
                          <p className="text-muted">
                            Missed check-ins trigger expiry + grace period before claims open.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                        <div className="bg-paper border border-border rounded-xl p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">01</p>
                          <h4 className="text-lg font-display mb-2">Create & Fund</h4>
                          <p className="text-sm text-muted leading-relaxed">
                            Set heirs and percentages, then deposit BTC into the escrow vault.
                          </p>
                        </div>
                        <div className="bg-paper border border-border rounded-xl p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">02</p>
                          <h4 className="text-lg font-display mb-2">Stay Active</h4>
                          <p className="text-sm text-muted leading-relaxed">
                            Check in on your schedule to keep the vault locked.
                          </p>
                        </div>
                        <div className="bg-paper border border-border rounded-xl p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">03</p>
                          <h4 className="text-lg font-display mb-2">Claim & Withdraw</h4>
                          <p className="text-sm text-muted leading-relaxed">
                            After expiry, beneficiaries claim and withdraw their share to their EVM address.
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="mt-16 md:mt-20 bg-surface rounded-2xl border border-border shadow-soft p-6 md:p-10">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">FAQ</p>
                        <h3 className="text-3xl md:text-4xl font-display">Questions, answered</h3>
                      </div>
                      <button
                        className="text-sm text-accent hover:text-accent/80"
                        onClick={() => setView('create')}
                      >
                        Create a vault →
                      </button>
                    </div>
                    <div className="space-y-3">
                      {faqs.map((item) => (
                        <details
                          key={item.q}
                          className="group bg-paper border border-border rounded-xl px-4 py-3"
                        >
                          <summary className="cursor-pointer list-none flex items-center justify-between text-ink font-semibold">
                            <span>{item.q}</span>
                            <span className="text-muted group-open:rotate-45 transition-transform">+</span>
                          </summary>
                          <p className="text-muted text-sm mt-3 leading-relaxed">{item.a}</p>
                        </details>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {view === 'create' && <CreateVault onNavigate={setView} />}
              {view === 'dashboard' && <Dashboard />}
              {view === 'claim' && <Claim />}
            </main>

            <footer className="mt-20 text-center text-muted text-sm py-8 border-t border-border">
              BitLegacy - Built on Midl
            </footer>
          </div>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App

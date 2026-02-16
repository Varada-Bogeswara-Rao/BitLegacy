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

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <div className="min-h-screen bg-gray-900 text-white p-4 font-sans selection:bg-amber-500/30">
            <header className="flex flex-col md:flex-row justify-between items-center mb-12 py-4 border-b border-gray-800">
              <h1
                className="text-2xl font-bold cursor-pointer text-amber-500 hover:text-amber-400 transition-colors"
                onClick={() => setView('landing')}
              >
                Bitcoin Autonomous Will
              </h1>
              <nav className="space-x-6 mt-4 md:mt-0">
                <button
                  className={`transition-colors ${view === 'create' ? 'text-amber-500 font-bold' : 'text-gray-400 hover:text-amber-400'}`}
                  onClick={() => setView('create')}
                >
                  Create Vault
                </button>
                <button
                  className={`transition-colors ${view === 'dashboard' ? 'text-amber-500 font-bold' : 'text-gray-400 hover:text-amber-400'}`}
                  onClick={() => setView('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  className={`transition-colors ${view === 'claim' ? 'text-amber-500 font-bold' : 'text-gray-400 hover:text-amber-400'}`}
                  onClick={() => setView('claim')}
                >
                  Claim
                </button>
              </nav>
            </header>

            <main className="max-w-4xl mx-auto">
              {view === 'landing' && (
                <div className="text-center py-20 animate-fade-in-up">
                  <h2 className="text-5xl md:text-7xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600">
                    Secure Your Legacy
                  </h2>
                  <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                    The first trustless inheritance protocol on Bitcoin. Split assets automatically and reveal a final message when claimed.
                    <br /><span className="text-amber-500/80">No lawyers. Just code.</span>
                  </p>
                  <div className="flex justify-center gap-4">
                    <button
                      className="bg-amber-500 text-black font-bold py-4 px-10 rounded-full text-lg hover:bg-amber-400 transition-all hover:scale-105 shadow-lg shadow-amber-500/20"
                      onClick={() => setView('create')}
                    >
                      Start Now
                    </button>
                    <button
                      className="bg-gray-800 text-white font-bold py-4 px-10 rounded-full text-lg hover:bg-gray-700 transition-all border border-gray-700"
                      onClick={() => setView('claim')}
                    >
                      I'm a Beneficiary
                    </button>
                  </div>
                </div>
              )}

              {view === 'create' && <CreateVault />}
              {view === 'dashboard' && <Dashboard />}
              {view === 'claim' && <Claim />}
            </main>

            <footer className="mt-20 text-center text-gray-600 text-sm py-8 border-t border-gray-800">
              Bitcoin Autonomous Will - Built on Midl
            </footer>
          </div>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App


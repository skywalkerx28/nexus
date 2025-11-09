'use client'

export default function SymbolTiles() {
  // Mock data for Phase 0
  const symbols = [
    { symbol: 'AAPL', bid: 178.23, ask: 178.25, spread: 0.02, last: 178.24, volume: 45230 },
    { symbol: 'MSFT', bid: 412.45, ask: 412.48, spread: 0.03, last: 412.46, volume: 32100 },
    { symbol: 'SPY', bid: 498.12, ask: 498.14, spread: 0.02, last: 498.13, volume: 89450 },
  ]

  return (
    <div className="bg-nexus-dark border border-gray-700 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Symbol Tiles</h2>
      
      <div className="space-y-3">
        {symbols.map((sym) => (
          <div
            key={sym.symbol}
            className="bg-nexus-darker border border-gray-800 rounded-lg p-4 hover:border-nexus-blue transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-bold text-nexus-blue">{sym.symbol}</span>
              <span className="text-xs text-gray-500">Vol: {sym.volume.toLocaleString()}</span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Bid</div>
                <div className="text-nexus-green font-mono">{sym.bid.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Ask</div>
                <div className="text-nexus-red font-mono">{sym.ask.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Spread</div>
                <div className="text-gray-300 font-mono">{sym.spread.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="mt-2 pt-2 border-t border-gray-800">
              <div className="text-xs text-gray-500">
                Last: <span className="text-gray-300 font-mono">{sym.last.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          Phase 0: Mock data • Phase 1: Live L1 book data
        </p>
      </div>
    </div>
  )
}


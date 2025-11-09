'use client'

import { useEffect, useState } from 'react'
import HealthStatus from '@/components/HealthStatus'
import LatencyMetrics from '@/components/LatencyMetrics'
import SymbolTiles from '@/components/SymbolTiles'
import LogTail from '@/components/LogTail'

export default function Home() {
  const [apiConnected, setApiConnected] = useState(false)

  useEffect(() => {
    // Check API connectivity
    const checkApi = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
        setApiConnected(response.ok)
      } catch (error) {
        console.error('API connection failed:', error)
        setApiConnected(false)
      }
    }

    checkApi()
    const interval = setInterval(checkApi, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <main className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-nexus-blue mb-2">
          Nexus Observatory
        </h1>
        <p className="text-gray-400">
          Phase 0 - Foundation • Real-time monitoring and control
        </p>
      </header>

      {!apiConnected && (
        <div className="bg-nexus-red/20 border border-nexus-red rounded-lg p-4 mb-6">
          <p className="text-nexus-red font-semibold">
            Observability API disconnected
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Ensure the API is running at {process.env.NEXT_PUBLIC_API_URL}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <HealthStatus />
        <LatencyMetrics />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SymbolTiles />
        <LogTail />
      </div>
    </main>
  )
}


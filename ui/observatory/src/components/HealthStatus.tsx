'use client'

import { useEffect, useState } from 'react'

interface HealthData {
  status: string
  timestamp: string
  version: string
  uptime_seconds: number
}

export default function HealthStatus() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
        const data = await response.json()
        setHealth(data)
        setLoading(false)
      } catch (error) {
        console.error('Failed to fetch health:', error)
        setLoading(false)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-nexus-dark border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">System Health</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  const isHealthy = health?.status === 'healthy'

  return (
    <div className="bg-nexus-dark border border-gray-700 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">System Health</h2>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Status</span>
          <span className={`font-semibold ${isHealthy ? 'text-nexus-green' : 'text-nexus-red'}`}>
            {health?.status || 'Unknown'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Version</span>
          <span className="font-mono text-sm">{health?.version || 'N/A'}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Uptime</span>
          <span className="font-mono text-sm">
            {health?.uptime_seconds ? `${Math.floor(health.uptime_seconds)}s` : 'N/A'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Last Update</span>
          <span className="font-mono text-xs text-gray-500">
            {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-nexus-green' : 'bg-nexus-red'} animate-pulse`} />
          <span className="text-sm text-gray-400">
            {isHealthy ? 'All systems operational' : 'System degraded'}
          </span>
        </div>
      </div>
    </div>
  )
}


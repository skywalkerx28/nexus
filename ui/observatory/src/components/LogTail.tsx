'use client'

import { useEffect, useState } from 'react'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  module?: string
}

export default function LogTail() {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Observatory UI initialized',
      module: 'ui',
    },
    {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Observability API connection established',
      module: 'api',
    },
  ])

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return 'text-nexus-red'
      case 'WARN':
      case 'WARNING':
        return 'text-nexus-yellow'
      case 'INFO':
        return 'text-nexus-blue'
      case 'DEBUG':
        return 'text-gray-500'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="bg-nexus-dark border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Log Tail</h2>
        <button className="text-xs text-gray-400 hover:text-white transition-colors">
          Clear
        </button>
      </div>
      
      <div className="space-y-2 font-mono text-xs max-h-96 overflow-y-auto">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className="flex items-start space-x-2 p-2 bg-nexus-darker rounded border border-gray-800 hover:border-gray-700 transition-colors"
          >
            <span className="text-gray-500 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className={`${getLevelColor(log.level)} font-semibold shrink-0 w-12`}>
              {log.level}
            </span>
            {log.module && (
              <span className="text-gray-600 shrink-0">[{log.module}]</span>
            )}
            <span className="text-gray-300 break-all">{log.message}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          Phase 0: Mock logs • Phase 1: Live log streaming via WebSocket
        </p>
      </div>
    </div>
  )
}


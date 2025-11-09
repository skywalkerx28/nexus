'use client'

export default function LatencyMetrics() {
  // Mock data for Phase 0 - will be populated from real metrics in Phase 1
  const metrics = [
    { name: 'Data→Book', p50: 1.2, p99: 8.5, target: 10, unit: 'ms' },
    { name: 'Book→Features', p50: 0.8, p99: 3.2, target: 5, unit: 'ms' },
    { name: 'Features→Decision', p50: 1.5, p99: 7.8, target: 10, unit: 'ms' },
    { name: 'Decision→Submit', p50: 1.1, p99: 6.9, target: 10, unit: 'ms' },
  ]

  return (
    <div className="bg-nexus-dark border border-gray-700 rounded-lg p-6 lg:col-span-2">
      <h2 className="text-xl font-semibold mb-4">Latency SLOs</h2>
      
      <div className="space-y-4">
        {metrics.map((metric) => {
          const p99Status = metric.p99 < metric.target ? 'good' : 'warning'
          
          return (
            <div key={metric.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-medium">{metric.name}</span>
                <div className="flex items-center space-x-4 text-sm">
                  <span className="text-gray-400">
                    p50: <span className="text-nexus-green font-mono">{metric.p50}{metric.unit}</span>
                  </span>
                  <span className="text-gray-400">
                    p99: <span className={`font-mono ${p99Status === 'good' ? 'text-nexus-green' : 'text-nexus-yellow'}`}>
                      {metric.p99}{metric.unit}
                    </span>
                  </span>
                  <span className="text-gray-500 text-xs">
                    target: {metric.target}{metric.unit}
                  </span>
                </div>
              </div>
              
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${p99Status === 'good' ? 'bg-nexus-green' : 'bg-nexus-yellow'}`}
                  style={{ width: `${Math.min((metric.p99 / metric.target) * 100, 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          Phase 0: Mock data • Phase 1: Live metrics from Observability API
        </p>
      </div>
    </div>
  )
}


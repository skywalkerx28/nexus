"use client";

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { Sidebar } from '@/components/Sidebar';

/**
 * Development Page - Nexus Platform Development Timeline & Status
 * Shows phases, milestones, component status, and roadmap progress
 */

type ComponentStatus = 'online' | 'in-progress' | 'planned' | 'blocked';
type PhaseStatus = 'complete' | 'in-progress' | 'planned';

interface Component {
  name: string;
  status: ComponentStatus;
  phase: string;
  description: string;
  progress: number;
  dependencies?: string[];
}

interface Phase {
  id: string;
  number: number;
  name: string;
  status: PhaseStatus;
  progress: number;
  startDate?: string;
  completionDate?: string;
  description: string;
  deliverables: string[];
  exitCriteria: string[];
}

export default function DevelopmentPage() {
  const { theme } = useTheme();
  const { sidebarWidth } = useSidebar();
  
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Phases data based on VISION.md
  const phases: Phase[] = [
    {
      id: 'phase0',
      number: 0,
      name: 'Foundations',
      status: 'complete',
      progress: 100,
      startDate: '2025-01-01',
      completionDate: '2025-01-09',
      description: 'Monorepo, CI, EventLog, Time utils, Observability API, UI scaffold',
      deliverables: [
        'EventLog (Parquet writer/reader)',
        'Time utilities (monotonic + wall-clock)',
        'Observatory UI skeleton (Next.js)',
        'Observability API (FastAPI)',
        'Configuration system (Pydantic)',
        'CI/CD pipeline',
      ],
      exitCriteria: [
        'CI green across C++/Python/UI',
        'Unit coverage ≥70% for /ingest & /book',
        'UI skeleton builds',
        'Auth stub operational',
      ],
    },
    {
      id: 'phase1',
      number: 1,
      name: 'Ingestion & L1 Book',
      status: 'in-progress',
      progress: 75,
      startDate: '2025-01-10',
      description: 'IBKR adapter, L1 OrderBook, zero-loss capture, live UI data',
      deliverables: [
        'C++ IBKR FeedAdapter for quotes/trades',
        'Sustained capture (10-20 symbols) without loss',
        'C++ L1 OrderBook + invariants',
        'Deterministic replay parity',
        'Live system health & latency SLOs in UI',
        'Per-symbol tiles: L1 snapshot, spread, trades',
        'Log tail with filter/search',
      ],
      exitCriteria: [
        'Zero-loss capture for 24+ hours',
        'Deterministic L1 replay parity',
        'UI shows live health & symbol tiles',
      ],
    },
    {
      id: 'phase2',
      number: 2,
      name: 'Tick-by-Tick, L2 & Features',
      status: 'planned',
      progress: 0,
      description: 'Top-5 depth, feature kernels (microprice, OFI, imbalance)',
      deliverables: [
        'Tick-by-tick + L2 top-5 depth',
        'Feature kernels: microprice, OFI, imbalance, depth slope',
        'Mini LOB visualizer in UI',
        'Imbalance gauges',
        'Per-module latency histograms',
      ],
      exitCriteria: [
        'No crossed book',
        'Snapshot ≡ delta',
        'UI renders L2/feature widgets real-time',
      ],
    },
    {
      id: 'phase3',
      number: 3,
      name: 'Simulator',
      status: 'planned',
      progress: 0,
      description: 'Discrete-event LOB sim, queue/kill models, mark-out calculator',
      deliverables: [
        'Discrete-event LOB simulator',
        'Queue/kill models',
        'Mark-out calculator',
        'Replay viewer in UI',
        'Incident timeline',
      ],
      exitCriteria: [
        'Full-day replay < 30 min',
        'Sim tracks live within tolerance',
        'UI replay tooling operational',
      ],
    },
    {
      id: 'phase4',
      number: 4,
      name: 'Strategies + OMS & Risk',
      status: 'planned',
      progress: 0,
      description: 'Baselines (A-S), C++ OMS, Risk Gate with limits',
      deliverables: [
        'Avellaneda-Stoikov baseline',
        'C++ OMS + idempotent state machine',
        'Risk Gate (bands, caps, cancel-rate, kill-switch)',
        'Order lifecycle views in UI',
        'Risk posture dashboard',
      ],
      exitCriteria: [
        'Restart safety',
        'No ghost orders',
        'Deterministic backtests',
        'UI shows OMS/risk state live',
      ],
    },
    {
      id: 'phase5',
      number: 5,
      name: 'Paper Trading',
      status: 'planned',
      progress: 0,
      description: 'Paper integration, TCA dashboards, symbol scheduler',
      deliverables: [
        'Paper trading integration',
        'Symbol scheduler (IBKR pacing)',
        'TCA dashboards (mark-outs, spread)',
        'Daily TCA report generation',
        'Feature drift monitors',
      ],
      exitCriteria: [
        '5 stable paper days',
        'Positive avg 1s mark-out',
        'UI is sole operational window',
      ],
    },
    {
      id: 'phase6',
      number: 6,
      name: 'Tiny Live',
      status: 'planned',
      progress: 0,
      description: 'Live at de-minimis size, SMART routing baseline',
      deliverables: [
        'Live trading at minimum size',
        'SMART baseline routing',
        'Kill-switch button (multi-party confirm)',
        'Pause/resume symbol groups',
        'Alert center (SLO breaches, rejects)',
      ],
      exitCriteria: [
        'Positive realized spread over 20 sessions',
        'Mid-session restart drill success',
        'UI used for all ops responses',
      ],
    },
    {
      id: 'phase7',
      number: 7,
      name: 'Hardening & Scale',
      status: 'planned',
      progress: 0,
      description: 'SIMD optimization, lock-free queues, symbol expansion',
      deliverables: [
        'SIMD hot loops',
        'Lock-free queues',
        'NUMA pinning',
        'Multi-venue views',
        'RBAC (Ops/Research/ReadOnly)',
      ],
      exitCriteria: [
        'p99 variance reduced 30-50%',
        'Replay regression suite green',
        'One-click strategy rollback',
      ],
    },
    {
      id: 'phase8',
      number: 8,
      name: 'Low-Latency Track',
      status: 'planned',
      progress: 0,
      description: 'Vendor/direct feeds, proximity/colo dossier',
      deliverables: [
        'Vendor/direct feed parsers',
        'Mock FIX/native gateway',
        'Proximity/colo dossier',
        'Adapter health boards',
        'Per-adapter latency tracking',
      ],
      exitCriteria: [
        'Synthetic line-rate loop with headroom',
        'Docs to cut one venue < 2 weeks',
        'UI supports adapter cutover',
      ],
    },
    {
      id: 'phase9',
      number: 9,
      name: 'Global Multi-Asset',
      status: 'planned',
      progress: 0,
      description: 'FX, futures, options via DMA; alt-data expansion',
      deliverables: [
        'Multi-asset support (FX, futures, options)',
        'Region expansion',
        'Alt-data scale-up (sentiment, web crawling)',
        'Cross-asset dashboards',
        'Sentiment surprise heatmaps',
      ],
      exitCriteria: [
        'Breadth × turnover with stable risk',
        'Unified feature registry',
        'UI remains only control surface',
      ],
    },
  ];

  // Core components status
  const components: Component[] = [
    {
      name: 'EventLog (Parquet)',
      status: 'online',
      phase: 'Phase 0',
      description: 'Append-only storage with deterministic replay',
      progress: 100,
    },
    {
      name: 'Time Utilities',
      status: 'online',
      phase: 'Phase 0',
      description: 'Monotonic + wall-clock timestamps',
      progress: 100,
    },
    {
      name: 'Observatory UI',
      status: 'online',
      phase: 'Phase 0',
      description: 'Real-time monitoring dashboard',
      progress: 100,
    },
    {
      name: 'Observability API',
      status: 'online',
      phase: 'Phase 0',
      description: 'FastAPI metrics/logs/events endpoint',
      progress: 100,
    },
    {
      name: 'IBKR Live Feed',
      status: 'online',
      phase: 'Phase 1',
      description: 'Real-time market data ingestion',
      progress: 100,
    },
    {
      name: 'L1 OrderBook',
      status: 'in-progress',
      phase: 'Phase 1',
      description: 'Level 1 order book with invariants',
      progress: 60,
    },
    {
      name: 'L2 OrderBook (Top-5)',
      status: 'planned',
      phase: 'Phase 2',
      description: 'Full depth book with top-5 levels',
      progress: 0,
      dependencies: ['L1 OrderBook'],
    },
    {
      name: 'Feature Kernels',
      status: 'planned',
      phase: 'Phase 2',
      description: 'Microprice, OFI, imbalance, depth slope',
      progress: 0,
      dependencies: ['L2 OrderBook (Top-5)'],
    },
    {
      name: 'LOB Simulator',
      status: 'planned',
      phase: 'Phase 3',
      description: 'Discrete-event simulation engine',
      progress: 0,
      dependencies: ['L2 OrderBook (Top-5)', 'Feature Kernels'],
    },
    {
      name: 'Mark-out Models',
      status: 'planned',
      phase: 'Phase 4',
      description: 'Short-horizon price prediction (100ms-1s)',
      progress: 0,
      dependencies: ['LOB Simulator', 'Feature Kernels'],
    },
    {
      name: 'Fill-hazard Models',
      status: 'planned',
      phase: 'Phase 4',
      description: 'P(fill | offset, features, Δt)',
      progress: 0,
      dependencies: ['LOB Simulator'],
    },
    {
      name: 'OMS (Order Management)',
      status: 'planned',
      phase: 'Phase 4',
      description: 'Idempotent order state machine',
      progress: 0,
      dependencies: ['IBKR Live Feed'],
    },
    {
      name: 'Risk Gate',
      status: 'planned',
      phase: 'Phase 4',
      description: 'Pre-trade checks, kill-switch, limits',
      progress: 0,
      dependencies: ['OMS (Order Management)'],
    },
    {
      name: 'Market Sentiment Engine',
      status: 'planned',
      phase: 'Phase 9',
      description: 'Alt-data ingestion, NLP pipeline, entity linking',
      progress: 0,
      dependencies: ['EventLog (Parquet)'],
    },
    {
      name: 'Reinforcement Learning',
      status: 'planned',
      phase: 'Phase 9',
      description: 'Constrained RL for quote optimization',
      progress: 0,
      dependencies: ['Mark-out Models', 'Fill-hazard Models', 'LOB Simulator'],
    },
  ];

  // Calculate overall progress
  const overallProgress = Math.round(
    phases.reduce((sum, phase) => sum + phase.progress, 0) / phases.length
  );

  const completedPhases = phases.filter(p => p.status === 'complete').length;
  const inProgressPhases = phases.filter(p => p.status === 'in-progress').length;

  // Status colors with proper typing
  const getStatusColor = (status: ComponentStatus | PhaseStatus): string => {
    switch (status) {
      case 'online':
      case 'complete':
        return '#00FF41'; // Matrix green
      case 'in-progress':
        return '#FFD700'; // Gold
      case 'planned':
        return theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
      case 'blocked':
        return '#FF0033'; // Matrix red
      default:
        return theme === 'dark' ? '#ffffff' : '#000000';
    }
  };

  return (
    <>
      <Sidebar />
      <div
        className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono"
        style={{ paddingLeft: `${sidebarWidth}px` }}
      >
        {/* Header */}
        <header className="border-b border-black/10 dark:border-white/10 bg-white dark:bg-black sticky top-0 z-10">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-4">
                <h1 className="text-xl font-bold tracking-tight">DEVELOPMENT</h1>
                <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wider">
                  Nexus Platform Roadmap & Status
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs">
                <div className="text-right">
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-1">
                    Overall Progress
                  </div>
                  <div className="text-lg font-bold tabular-nums">
                    {overallProgress}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-1">
                    Phases Complete
                  </div>
                  <div className="text-lg font-bold tabular-nums">
                    {completedPhases} / {phases.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-8 space-y-6">
          {/* Progress Overview */}
          <div
            className="backdrop-blur-md border p-6"
            style={{
              backgroundColor: theme === 'dark'
                ? 'rgba(0, 0, 0, 0.75)'
                : 'rgba(255, 255, 255, 0.75)',
              borderColor: theme === 'dark'
                ? 'rgba(255, 255, 255, 0.15)'
                : 'rgba(0, 0, 0, 0.15)',
              boxShadow: theme === 'dark'
                ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
              borderRadius: '6px',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Platform Progress
              </h2>
              <span className="text-xs text-black/60 dark:text-white/60 font-mono">
                {currentTime.toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Overall Development Progress</span>
                <span className="font-bold tabular-nums">{overallProgress}%</span>
              </div>
              <div className="h-3 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${overallProgress}%`,
                    background: `linear-gradient(90deg, #00FF41 0%, #00CC33 100%)`,
                    boxShadow: '0 0 10px rgba(0, 255, 65, 0.5)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Phase Timeline */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Phase Timeline</h2>
            <div className="grid grid-cols-5 gap-3">
              {phases.map((phase) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  theme={theme}
                  onClick={() => setSelectedPhase(selectedPhase === phase.id ? null : phase.id)}
                  isSelected={selectedPhase === phase.id}
                  getStatusColor={getStatusColor}
                />
              ))}
            </div>
          </div>

          {/* Selected Phase Details */}
          {selectedPhase && (
            <PhaseDetails
              phase={phases.find(p => p.id === selectedPhase)!}
              theme={theme}
              getStatusColor={getStatusColor}
            />
          )}

          {/* Component Status Grid */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Core Components</h2>
            <div className="grid grid-cols-3 gap-4">
              {components.map((component) => (
                <ComponentCard
                  key={component.name}
                  component={component}
                  theme={theme}
                  getStatusColor={getStatusColor}
                />
              ))}
            </div>
          </div>

          {/* Current Focus */}
          <CurrentFocus theme={theme} />
        </div>
      </div>
    </>
  );
}

// Phase Card Component
function PhaseCard({ phase, theme, onClick, isSelected, getStatusColor }: {
  phase: Phase;
  theme: string;
  onClick: () => void;
  isSelected: boolean;
  getStatusColor: (status: ComponentStatus | PhaseStatus) => string;
}) {
  return (
    <div
      onClick={onClick}
      className={`backdrop-blur-md border p-4 cursor-pointer transition-all duration-200 hover:scale-105 ${
        isSelected ? 'ring-2 ring-offset-2' : ''
      }`}
      style={{
        backgroundColor: theme === 'dark'
          ? 'rgba(0, 0, 0, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider">
          Phase {phase.number}
        </span>
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: getStatusColor(phase.status),
            boxShadow: phase.status === 'complete' ? '0 0 8px rgba(0, 255, 65, 0.6)' : 
                       phase.status === 'in-progress' ? '0 0 8px rgba(255, 215, 0, 0.6)' : 'none',
          }}
        />
      </div>
      <h3 className="text-sm font-bold mb-2">{phase.name}</h3>
      <div className="space-y-2">
        <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${phase.progress}%`,
              backgroundColor: getStatusColor(phase.status),
            }}
          />
        </div>
        <div className="text-[10px] text-black/60 dark:text-white/60 font-mono tabular-nums">
          {phase.progress}% Complete
        </div>
      </div>
    </div>
  );
}

// Phase Details Component
function PhaseDetails({ phase, theme, getStatusColor }: {
  phase: Phase;
  theme: string;
  getStatusColor: (status: ComponentStatus | PhaseStatus) => string;
}) {
  return (
    <div
      className="backdrop-blur-md border p-6"
      style={{
        backgroundColor: theme === 'dark'
          ? 'rgba(0, 0, 0, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold mb-1">Phase {phase.number}: {phase.name}</h2>
          <p className="text-xs text-black/60 dark:text-white/60">{phase.description}</p>
        </div>
        <div
          className="px-3 py-1 rounded text-xs font-bold uppercase tracking-wide"
          style={{
            backgroundColor: `${getStatusColor(phase.status)}20`,
            color: getStatusColor(phase.status),
          }}
        >
          {phase.status}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Deliverables</h3>
          <ul className="space-y-2 text-xs">
            {phase.deliverables.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-black/40 dark:text-white/40">▹</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Exit Criteria</h3>
          <ul className="space-y-2 text-xs">
            {phase.exitCriteria.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-black/40 dark:text-white/40">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(phase.startDate || phase.completionDate) && (
        <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10 flex gap-6 text-xs">
          {phase.startDate && (
            <div>
              <span className="text-black/40 dark:text-white/40 uppercase tracking-wide">Start: </span>
              <span className="font-mono">{new Date(phase.startDate).toLocaleDateString()}</span>
            </div>
          )}
          {phase.completionDate && (
            <div>
              <span className="text-black/40 dark:text-white/40 uppercase tracking-wide">Complete: </span>
              <span className="font-mono">{new Date(phase.completionDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Component Card
function ComponentCard({ component, theme, getStatusColor }: {
  component: Component;
  theme: string;
  getStatusColor: (status: ComponentStatus | PhaseStatus) => string;
}) {
  return (
    <div
      className="backdrop-blur-md border p-4"
      style={{
        backgroundColor: theme === 'dark'
          ? 'rgba(0, 0, 0, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider">
          {component.phase}
        </span>
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: getStatusColor(component.status),
            boxShadow: component.status === 'online' ? '0 0 8px rgba(0, 255, 65, 0.6)' : 
                       component.status === 'in-progress' ? '0 0 8px rgba(255, 215, 0, 0.6)' : 'none',
          }}
        />
      </div>
      <h3 className="text-sm font-bold mb-1">{component.name}</h3>
      <p className="text-xs text-black/60 dark:text-white/60 mb-3">{component.description}</p>
      
      <div className="space-y-2">
        <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${component.progress}%`,
              backgroundColor: getStatusColor(component.status),
            }}
          />
        </div>
        <div className="flex justify-between text-[10px]">
          <span
            className="uppercase tracking-wide font-bold"
            style={{ color: getStatusColor(component.status) }}
          >
            {component.status}
          </span>
          <span className="text-black/60 dark:text-white/60 font-mono tabular-nums">
            {component.progress}%
          </span>
        </div>
      </div>

      {component.dependencies && component.dependencies.length > 0 && (
        <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
          <div className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wide mb-1">
            Dependencies
          </div>
          <div className="flex flex-wrap gap-1">
            {component.dependencies.map((dep, idx) => (
              <span
                key={idx}
                className="text-[9px] px-2 py-0.5 rounded bg-black/10 dark:bg-white/10"
              >
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Current Focus Component
function CurrentFocus({ theme }: { theme: string }) {
  return (
    <div
      className="backdrop-blur-md border p-6"
      style={{
        backgroundColor: theme === 'dark'
          ? 'rgba(0, 0, 0, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Current Focus</h2>
      <div className="grid grid-cols-2 gap-6 text-xs">
        <div>
          <h3 className="text-sm font-bold mb-3" style={{ color: '#FFD700' }}>
            In Progress
          </h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span style={{ color: '#FFD700' }}>▸</span>
              <span>Completing L1 OrderBook invariant tests</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: '#FFD700' }}>▸</span>
              <span>Finalizing zero-loss capture (24hr test)</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: '#FFD700' }}>▸</span>
              <span>Observatory UI live symbol tiles</span>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold mb-3">Next Up</h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-black/40 dark:text-white/40">▹</span>
              <span>L2 OrderBook top-5 depth implementation</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black/40 dark:text-white/40">▹</span>
              <span>Feature kernel design (microprice, OFI)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black/40 dark:text-white/40">▹</span>
              <span>Simulator architecture RFC</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}


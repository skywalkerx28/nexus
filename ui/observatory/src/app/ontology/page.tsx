"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { ontologyApiUrl } from "@/lib/ontology-config";

interface OntologyStats {
  active_entities: number;
  merged_entities: number;
  active_identifiers: number;
  total_aliases: number;
  active_attributes: number;
  active_edges: number;
  unresolved_quarantine: number;
  entity_types_used: number;
  edges: {
    by_type: Array<{
      rel_type: string;
      total_count: number;
      active_count: number;
      avg_confidence: number;
    }>;
    total_active: number;
    total: number;
    historical: number;
  };
  cache?: {
    total_keys: number;
    hits: number;
    misses: number;
    hit_rate: number;
    memory_used: string;
  };
}

interface Entity {
  syn_id: string;
  type: string;
  canonical_name: string;
  status: string;
  relevance?: number;
}

export default function OntologyDashboard() {
  const { theme } = useTheme();
  const { sidebarWidth } = useSidebar();
  const [stats, setStats] = useState<OntologyStats | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const res = await fetch(ontologyApiUrl("/stats"));
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(
        ontologyApiUrl(`/search?q=${encodeURIComponent(searchQuery)}&limit=20`)
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error("Search error:", err);
      setSearchResults([]);
    }
  };

  if (loading) {
    return (
      <>
        <Sidebar />
        <div 
          className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono"
          style={{ paddingLeft: `${sidebarWidth}px` }}
        >
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="text-sm text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                Loading Ontology
              </div>
              <div className="text-xs text-black/60 dark:text-white/60">
                Querying entity registry...
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error || !stats) {
    return (
      <>
        <Sidebar />
        <div 
          className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono"
          style={{ paddingLeft: `${sidebarWidth}px` }}
        >
          <div className="p-8">
            <div className="text-center text-[#FF0033]">
              ERROR: {error || "Failed to load stats"}
            </div>
          </div>
        </div>
      </>
    );
  }

  const healthScore =
    stats.unresolved_quarantine === 0 &&
    stats.active_entities > 0 &&
    stats.active_edges > 0
      ? 100
      : stats.unresolved_quarantine > 10
      ? 60
      : 85;

  const healthColor = healthScore >= 90 ? '#00FF00' : healthScore >= 70 ? '#FFAA00' : '#FF0033';

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
                <h1 className="text-xl font-bold tracking-tight">ONTOLOGY</h1>
                <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wider">
                  Entity Registry & Knowledge Graph
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs">
                {stats.unresolved_quarantine > 0 && (
                  <Link
                    href="/ontology/quarantine"
                    className="px-3 py-1 uppercase tracking-wide text-[#FF0033] hover:bg-[#FF0033]/10 transition-colors"
                  >
                    Quarantine ({stats.unresolved_quarantine})
                  </Link>
                )}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: healthColor,
                      boxShadow: `0 0 8px ${healthColor}`,
                    }}
                  />
                  <span className="font-bold uppercase tracking-wide" style={{ color: healthColor }}>
                    {healthScore}% Health
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-8 space-y-6">
          {/* Search */}
          <div
            className="backdrop-blur-md border"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
              borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
              boxShadow: theme === 'dark'
                ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
              borderRadius: '6px',
            }}
          >
            <div className="p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search entities by name..."
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded px-4 py-2 text-sm focus:outline-none focus:border-black/30 dark:focus:border-white/30"
                />
                <button
                  onClick={handleSearch}
                  className="px-6 py-2 bg-black/10 dark:bg-white/10 rounded text-sm uppercase tracking-wide hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                >
                  Search
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {searchResults.map((entity) => (
                    <Link
                      key={entity.syn_id}
                      href={`/ontology/${entity.syn_id}`}
                      className="block border border-black/10 dark:border-white/10 rounded p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold">{entity.canonical_name}</div>
                          <div className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide">
                            {entity.type} | {entity.syn_id}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-4 gap-4">
            <div
              className="backdrop-blur-md border p-4"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
                borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                boxShadow: theme === 'dark'
                  ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                  : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                borderRadius: '6px',
              }}
            >
              <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Entities</div>
              <div className="text-3xl font-bold tabular-nums">{stats.active_entities}</div>
              <div className="text-xs text-black/60 dark:text-white/60 mt-1">{stats.entity_types_used} types</div>
            </div>

            <div
              className="backdrop-blur-md border p-4"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
                borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                boxShadow: theme === 'dark'
                  ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                  : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                borderRadius: '6px',
              }}
            >
              <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Edges</div>
              <div className="text-3xl font-bold tabular-nums">{stats.active_edges}</div>
              <div className="text-xs text-black/60 dark:text-white/60 mt-1">{stats.edges.historical} historical</div>
            </div>

            <div
              className="backdrop-blur-md border p-4"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
                borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                boxShadow: theme === 'dark'
                  ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                  : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                borderRadius: '6px',
              }}
            >
              <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Identifiers</div>
              <div className="text-3xl font-bold tabular-nums">{stats.active_identifiers}</div>
              <div className="text-xs text-black/60 dark:text-white/60 mt-1">{stats.total_aliases} aliases</div>
            </div>

            <div
              className="backdrop-blur-md border p-4"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
                borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                boxShadow: theme === 'dark'
                  ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                  : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                borderRadius: '6px',
              }}
            >
              <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Quarantine</div>
              <div className={`text-3xl font-bold tabular-nums ${stats.unresolved_quarantine > 0 ? 'text-[#FF0033]' : ''}`}>
                {stats.unresolved_quarantine}
              </div>
              <div className="text-xs text-black/60 dark:text-white/60 mt-1">unresolved</div>
            </div>
          </div>

          {/* Edges by Type */}
          <div
            className="backdrop-blur-md border"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
              borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
              boxShadow: theme === 'dark'
                ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
              borderRadius: '6px',
            }}
          >
            <div className="p-4 border-b border-black/10 dark:border-white/10">
              <h2 className="text-sm font-bold uppercase tracking-wider">Edges by Type</h2>
            </div>
            <div className="p-4 space-y-3">
              {stats.edges.by_type.map((edge) => (
                <div
                  key={edge.rel_type}
                  className="p-3 rounded bg-black/5 dark:bg-white/5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold uppercase tracking-wide text-sm">{edge.rel_type}</div>
                    <div className="text-xs text-black/60 dark:text-white/60">
                      {edge.active_count} / {edge.total_count}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-black dark:bg-white h-full"
                        style={{
                          width: `${(edge.active_count / stats.edges.total_active) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs tabular-nums font-bold">
                      {(edge.avg_confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cache Performance */}
          {stats.cache && stats.cache.total_keys > 0 && (
            <div
              className="backdrop-blur-md border"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
                borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                boxShadow: theme === 'dark'
                  ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                  : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                borderRadius: '6px',
              }}
            >
              <div className="p-4 border-b border-black/10 dark:border-white/10">
                <h2 className="text-sm font-bold uppercase tracking-wider">Cache Performance</h2>
              </div>
              <div className="p-4 grid grid-cols-4 gap-4">
                <div>
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Hit Rate</div>
                  <div className="text-2xl font-bold tabular-nums">
                    {(stats.cache.hit_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Keys</div>
                  <div className="text-2xl font-bold tabular-nums">{stats.cache.total_keys}</div>
                </div>
                <div>
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Hits / Misses</div>
                  <div className="text-2xl font-bold tabular-nums">
                    {stats.cache.hits} / {stats.cache.misses}
                  </div>
                </div>
                <div>
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide text-xs mb-2">Memory</div>
                  <div className="text-2xl font-bold tabular-nums">{stats.cache.memory_used}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { ontologyApiUrl } from "@/lib/ontology-config";

interface QuarantineItem {
  id: number;
  raw_identifier: string;
  scheme: string | null;
  context: any;
  reason: string;
  ingested_at: string;
  resolved_syn_id?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

interface Candidate {
  syn_id: string;
  canonical_name: string;
  entity_type: string;
  matched_via: string;
  confidence: number;
}

export default function QuarantinePage() {
  const { theme } = useTheme();
  const { sidebarWidth } = useSidebar();
  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<QuarantineItem | null>(null);
  const [resolveEmail, setResolveEmail] = useState("user@nexus.com");

  useEffect(() => {
    fetchQuarantine();
  }, []);

  const fetchQuarantine = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        ontologyApiUrl("/quarantine?resolved=false&limit=100")
      );
      if (!res.ok) throw new Error("Failed to fetch quarantine");
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quarantine");
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (quarantineId: number, synId: string) => {
    try {
      const res = await fetch(
        ontologyApiUrl(`/quarantine/${quarantineId}/resolve`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            syn_id: synId,
            resolved_by: resolveEmail,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to resolve");

      setSelectedItem(null);
      fetchQuarantine();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve");
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
                Loading Quarantine
              </div>
              <div className="text-xs text-black/60 dark:text-white/60">
                Fetching unresolved entities...
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const alertColor = total > 10 ? '#FF0033' : total > 0 ? '#FFAA00' : '#00FF00';

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
                <Link
                  href="/ontology"
                  className="text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
                >
                  <span className="text-xl">←</span>
                </Link>
                <h1 className="text-xl font-bold tracking-tight">QUARANTINE</h1>
                <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wider">
                  Manual Entity Resolution
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: alertColor,
                    boxShadow: `0 0 8px ${alertColor}`,
                  }}
                />
                <span className="font-bold uppercase tracking-wide text-xs tabular-nums" style={{ color: alertColor }}>
                  {total} Unresolved
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-8 space-y-6">
          {/* Status Message */}
          {total === 0 ? (
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
              <div className="p-12 text-center">
                <div className="text-[#00FF00] text-2xl mb-2">✓</div>
                <div className="text-sm uppercase tracking-wider">All Clear</div>
                <div className="text-xs text-black/60 dark:text-white/60 mt-2">
                  No entities in quarantine
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Alert Banner */}
              {total > 10 && (
                <div
                  className="backdrop-blur-md border p-4"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
                    borderColor: '#FF0033',
                    boxShadow: theme === 'dark'
                      ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                      : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                    borderRadius: '6px',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[#FF0033]">⚠</span>
                    <span className="text-sm uppercase tracking-wide">
                      High quarantine queue: {total} items need manual resolution
                    </span>
                  </div>
                </div>
              )}

              {/* Quarantine Items */}
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
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
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xl font-bold">{item.raw_identifier}</span>
                            {item.scheme && (
                              <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide px-2 py-1 rounded bg-black/5 dark:bg-white/5">
                                {item.scheme}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-black/60 dark:text-white/60 mb-2">
                            {item.reason}
                          </div>
                          <div className="text-xs text-black/40 dark:text-white/40 tabular-nums">
                            {new Date(item.ingested_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="px-4 py-2 bg-black/10 dark:bg-white/10 rounded text-sm uppercase tracking-wide hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                        >
                          Resolve
                        </button>
                      </div>

                      {/* Candidates */}
                      {item.context?.candidates && item.context.candidates.length > 0 && (
                        <div className="pt-4 border-t border-black/10 dark:border-white/10">
                          <div className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide mb-3">
                            Candidates:
                          </div>
                          <div className="space-y-2">
                            {item.context.candidates.map((candidate: Candidate, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 rounded bg-black/5 dark:bg-white/5"
                              >
                                <div className="flex items-center gap-3">
                                  <Link
                                    href={`/ontology/${candidate.syn_id}`}
                                    className="hover:underline font-bold"
                                  >
                                    {candidate.canonical_name}
                                  </Link>
                                  <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide">
                                    [{candidate.entity_type}] via {candidate.matched_via}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-bold tabular-nums">
                                    {(candidate.confidence * 100).toFixed(0)}%
                                  </span>
                                  <button
                                    onClick={() => handleResolve(item.id, candidate.syn_id)}
                                    className="px-3 py-1 bg-black/10 dark:bg-white/10 rounded text-xs uppercase tracking-wide hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                                  >
                                    Use
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Manual Resolution Modal */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div
              className="border max-w-2xl w-full"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                borderRadius: '6px',
              }}
            >
              <div className="p-6">
                <h3 className="text-xl font-bold uppercase tracking-wide mb-6">
                  Manual Resolution
                </h3>
                
                <div className="mb-4">
                  <div className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
                    Raw Identifier:
                  </div>
                  <div className="font-bold text-lg">{selectedItem.raw_identifier}</div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
                    Entity ID (syn_id):
                  </label>
                  <input
                    type="text"
                    placeholder="CO_01HQ..."
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded px-4 py-2 focus:outline-none focus:border-black/40 dark:focus:border-white/40"
                    id="manual-syn-id"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-xs text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
                    Your Email:
                  </label>
                  <input
                    type="email"
                    value={resolveEmail}
                    onChange={(e) => setResolveEmail(e.target.value)}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/20 dark:border-white/20 rounded px-4 py-2 focus:outline-none focus:border-black/40 dark:focus:border-white/40"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const input = document.getElementById("manual-syn-id") as HTMLInputElement;
                      if (input?.value) {
                        handleResolve(selectedItem.id, input.value);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-black/10 dark:bg-white/10 rounded uppercase tracking-wide hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="px-4 py-2 bg-black/5 dark:bg-white/5 rounded uppercase tracking-wide hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

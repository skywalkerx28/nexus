"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { ontologyApiUrl } from "@/lib/ontology-config";

interface Entity {
  syn_id: string;
  type: string;
  canonical_name: string;
  status: string;
  replaces_syn_id: string[];
  created_at: string;
  updated_at: string;
  identifiers?: Array<{
    scheme: string;
    value: string;
    valid_from: string;
    valid_to: string | null;
  }>;
  aliases?: Array<{
    alias: string;
    lang: string | null;
    source: string | null;
    confidence: number;
  }>;
}

interface Edge {
  src_syn_id: string;
  dst_syn_id: string;
  rel_type: string;
  attrs: any;
  source: string;
  evidence: string | null;
  confidence: number;
  valid_from: string;
  valid_to: string | null;
  observed_at: string;
  related_syn_id: string;
  related_name: string;
  related_type: string;
}

interface EdgesResponse {
  syn_id: string;
  direction: string;
  count: number;
  edges: Edge[];
}

export default function EntityDetailPage() {
  const params = useParams();
  const syn_id = params.syn_id as string;
  const { theme } = useTheme();
  const { sidebarWidth } = useSidebar();

  const [entity, setEntity] = useState<Entity | null>(null);
  const [outgoingEdges, setOutgoingEdges] = useState<EdgesResponse | null>(null);
  const [incomingEdges, setIncomingEdges] = useState<EdgesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"outgoing" | "incoming">("outgoing");

  useEffect(() => {
    if (!syn_id) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const entityRes = await fetch(
          ontologyApiUrl(`/entities/${syn_id}?include_identifiers=true&include_aliases=true`)
        );
        if (!entityRes.ok) throw new Error("Entity not found");
        const entityData = await entityRes.json();
        setEntity(entityData);

        const outRes = await fetch(
          ontologyApiUrl(`/entities/${syn_id}/edges?direction=out&limit=50`)
        );
        if (outRes.ok) {
          const outData = await outRes.json();
          setOutgoingEdges(outData);
        }

        const inRes = await fetch(
          ontologyApiUrl(`/entities/${syn_id}/edges?direction=in&limit=50`)
        );
        if (inRes.ok) {
          const inData = await inRes.json();
          setIncomingEdges(inData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load entity");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [syn_id]);

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
                Loading Entity
              </div>
              <div className="text-xs text-black/60 dark:text-white/60">
                Fetching {syn_id}...
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error || !entity) {
    return (
      <>
        <Sidebar />
        <div 
          className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono"
          style={{ paddingLeft: `${sidebarWidth}px` }}
        >
          <div className="p-8">
            <Link
              href="/ontology"
              className="inline-flex items-center gap-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors mb-4"
            >
              <span>←</span>
              <span className="uppercase tracking-wide text-xs">Back to Ontology</span>
            </Link>
            <div className="text-center text-[#FF0033] mt-8">
              ERROR: {error || "Entity not found"}
            </div>
          </div>
        </div>
      </>
    );
  }

  const statusColor = entity.status === 'ACTIVE' ? '#00FF00' : '#FFAA00';

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
                <h1 className="text-xl font-bold tracking-tight">{entity.canonical_name}</h1>
                <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wider">
                  {entity.type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: statusColor,
                    boxShadow: `0 0 8px ${statusColor}`,
                  }}
                />
                <span className="font-bold uppercase tracking-wide text-xs" style={{ color: statusColor }}>
                  {entity.status}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-8 space-y-6">
          {/* Entity Info */}
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
            <div className="p-4 grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Entity ID</div>
                <div className="font-bold">{entity.syn_id}</div>
              </div>
              <div>
                <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Created</div>
                <div className="tabular-nums">{new Date(entity.created_at).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Updated</div>
                <div className="tabular-nums">{new Date(entity.updated_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          {/* Identifiers */}
          {entity.identifiers && entity.identifiers.length > 0 && (
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
                <h2 className="text-sm font-bold uppercase tracking-wider">Identifiers</h2>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                {entity.identifiers.map((id, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded bg-black/5 dark:bg-white/5"
                  >
                    <div className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide mb-1">
                      {id.scheme}
                    </div>
                    <div className="font-bold">{id.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Relationships */}
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
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveTab("outgoing")}
                  className={`text-sm uppercase tracking-wider transition-colors ${
                    activeTab === "outgoing"
                      ? "font-bold text-black dark:text-white"
                      : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                  }`}
                >
                  Outgoing ({outgoingEdges?.count || 0})
                </button>
                <span className="text-black/20 dark:text-white/20">|</span>
                <button
                  onClick={() => setActiveTab("incoming")}
                  className={`text-sm uppercase tracking-wider transition-colors ${
                    activeTab === "incoming"
                      ? "font-bold text-black dark:text-white"
                      : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                  }`}
                >
                  Incoming ({incomingEdges?.count || 0})
                </button>
              </div>
            </div>

            <div className="p-4">
              {activeTab === "outgoing" && (
                <div className="space-y-2">
                  {outgoingEdges?.edges.map((edge, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold uppercase tracking-wide text-sm">{edge.rel_type}</span>
                        <span className="text-black/40 dark:text-white/40">→</span>
                        <Link
                          href={`/ontology/${edge.related_syn_id}`}
                          className="hover:underline"
                        >
                          {edge.related_name}
                        </Link>
                        <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide">
                          [{edge.related_type}]
                        </span>
                      </div>
                      <div className="text-xs text-black/60 dark:text-white/60">
                        {edge.source} | {(edge.confidence * 100).toFixed(0)}% confidence
                      </div>
                    </div>
                  ))}
                  {outgoingEdges?.count === 0 && (
                    <div className="text-center text-black/40 dark:text-white/40 py-8 text-sm">
                      No outgoing relationships
                    </div>
                  )}
                </div>
              )}

              {activeTab === "incoming" && (
                <div className="space-y-2">
                  {incomingEdges?.edges.map((edge, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Link
                          href={`/ontology/${edge.related_syn_id}`}
                          className="hover:underline"
                        >
                          {edge.related_name}
                        </Link>
                        <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wide">
                          [{edge.related_type}]
                        </span>
                        <span className="text-black/40 dark:text-white/40">→</span>
                        <span className="font-bold uppercase tracking-wide text-sm">{edge.rel_type}</span>
                      </div>
                      <div className="text-xs text-black/60 dark:text-white/60">
                        {edge.source} | {(edge.confidence * 100).toFixed(0)}% confidence
                      </div>
                    </div>
                  ))}
                  {incomingEdges?.count === 0 && (
                    <div className="text-center text-black/40 dark:text-white/40 py-8 text-sm">
                      No incoming relationships
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

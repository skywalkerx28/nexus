/**
 * Ontology API configuration
 * 
 * Centralizes API base URL for easy environment configuration.
 */

export const ONTOLOGY_API_BASE = 
  process.env.NEXT_PUBLIC_ONTOLOGY_API_BASE || 'http://localhost:8001';

/**
 * Build full API URL from path
 */
export function ontologyApiUrl(path: string): string {
  return `${ONTOLOGY_API_BASE}${path}`;
}


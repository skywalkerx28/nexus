"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';

/**
 * Sidebar Navigation - Pure minimal design
 * 
 * Features:
 * - Left-side placement
 * - Collapse/expand with arrow toggle
 * - Pure black & white with dark/light mode support
 * - 5 main sections: Home, Positions, World, Pulse, Development
 */

interface NavItem {
  label: string;
  path: string;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Home',
    path: '/dashboard',
    description: 'Mission control',
  },
  {
    label: 'Positions',
    path: '/positions',
    description: 'Live positions & P&L',
  },
  {
    label: 'World',
    path: '/world',
    description: 'Global markets overview',
  },
  {
    label: 'Pulse',
    path: '/pulse',
    description: 'System health & metrics',
  },
  {
    label: 'Development',
    path: '/development',
    description: 'Build & deployment status',
  },
];

// Icon components for each section (pure, minimal)
const Icons = {
  Home: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  Positions: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  World: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Pulse: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Development: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
};

export function Sidebar() {
  const { isExpanded, toggleSidebar } = useSidebar();
  const pathname = usePathname();

  return (
    <div
      className={`fixed left-0 top-0 h-screen bg-white dark:bg-black border-r border-black/10 dark:border-white/10 transition-all duration-300 ease-in-out z-50 flex flex-col ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
    >
      {/* Navigation items - Always visible */}
      <nav className="flex-1 overflow-y-auto">
        <div className={`${isExpanded ? 'p-6' : 'p-3'} space-y-1`}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname?.startsWith(item.path + '/');
            const IconComponent = Icons[item.label as keyof typeof Icons];
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`block group ${
                  isActive ? 'opacity-100' : 'opacity-40 hover:opacity-100'
                } transition-opacity duration-200`}
                title={!isExpanded ? `${item.label} - ${item.description}` : undefined}
              >
                {isExpanded ? (
                  // Expanded state: Full labels
                  <div className="py-3 px-4 border-l-2 border-transparent hover:border-black dark:hover:border-white transition-colors">
                    <div className="text-sm font-bold tracking-wide uppercase text-black dark:text-white">
                      {item.label}
                    </div>
                    <div className="text-[10px] text-black/40 dark:text-white/40 mt-0.5 tracking-wide uppercase">
                      {item.description}
                    </div>
                  </div>
                ) : (
                  // Collapsed state: Icons only
                  <div className="py-4 px-3 flex items-center justify-center text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded">
                    <IconComponent />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Collapse/Expand toggle at bottom */}
      <div className="border-t border-black/10 dark:border-white/10 p-3 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors py-2"
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${
              isExpanded ? 'rotate-180' : 'rotate-0'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}


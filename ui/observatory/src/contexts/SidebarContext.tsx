"use client";

import { createContext, useContext, useState, ReactNode } from 'react';

/**
 * Sidebar Context - Manage sidebar expanded/collapsed state
 * Allows components to respond to sidebar state changes
 */

interface SidebarContextType {
  isExpanded: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number; // Actual width in pixels
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleSidebar = () => {
    setIsExpanded(prev => !prev);
  };

  const sidebarWidth = isExpanded ? 256 : 64; // 16rem = 256px, 4rem = 64px

  return (
    <SidebarContext.Provider value={{ isExpanded, toggleSidebar, sidebarWidth }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}


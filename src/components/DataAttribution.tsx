import React from 'react';
import { ExternalLink } from 'lucide-react';

interface DataAttributionProps {
  sources: ('tba')[];
  variant?: 'full' | 'compact' | 'inline';
  className?: string;
}

export const DataAttribution: React.FC<DataAttributionProps> = ({ 
  sources, 
  variant = 'compact',
  className = '' 
}) => {
  const hideTba = String(import.meta.env.VITE_HIDE_TBA_LINKS || '').toLowerCase() === 'true';
  const showTBA = sources.includes('tba') && !hideTba;

  if (variant === 'full') {
    return (
      <div className={`space-y-2 text-xs text-muted-foreground ${className}`}>
        {showTBA && (
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <a 
              href="https://thebluealliance.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline flex items-center gap-1"
            >
              The Blue Alliance
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'inline') {
    const attributions = [];
    if (showTBA) {
      attributions.push(
        <a 
          key="tba"
          href="https://thebluealliance.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
        >
          The Blue Alliance
        </a>
      );
    }
    // Nexus links removed per policy

    return (
      <span className={`text-xs text-muted-foreground ${className}`}>
        Data from {attributions.reduce((prev, curr, index) => {
          if (prev === null) return [curr];
          return [...prev, index === attributions.length - 1 ? ' and ' : ', ', curr];
        }, null as React.ReactNode[] | null)}
      </span>
    );
  }

  // Compact variant (default)
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${className}`}>
      {showTBA && (
        <a 
          href="https://thebluealliance.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline flex items-center gap-1"
          title="Powered by The Blue Alliance"
        >
          <span className="hidden sm:inline">Powered by </span>The Blue Alliance
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {/* Nexus links removed per policy */}
    </div>
  );
};

// Tutorial GIF Component
// This shows how you can integrate actual GIF files into the tutorials
// Designed for offline-first experience with graceful degradation

import { useState, useEffect, useRef } from 'react';
import { BookOpen, WifiOff } from 'lucide-react';

interface TutorialGifProps {
  src: string;
  alt: string;
  caption?: string;
  lazyLoad?: boolean; // Load only when scrolled into view
  fallbackText?: string; // Custom fallback text when offline
}

export const TutorialGif = ({ 
  src, 
  alt, 
  caption, 
  lazyLoad = true,
  fallbackText 
}: TutorialGifProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(!lazyLoad);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazyLoad || shouldLoad) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [lazyLoad, shouldLoad]);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(false);
  };

  // Don't try to load if offline (unless already cached)
  const showPlaceholder = !shouldLoad || (!isLoaded && (hasError || !isOnline));
  
  return (
    <div ref={containerRef} className="tutorial-gif-container">
      {showPlaceholder && (
        <div className="bg-muted rounded-lg p-6 mb-2">
          <div className="text-muted-foreground text-sm space-y-2 text-center">
            <div className="w-16 h-16 mx-auto bg-muted-foreground/20 rounded-lg flex items-center justify-center mb-4">
              {!isOnline ? (
                <WifiOff className="w-8 h-8 text-muted-foreground/40" />
              ) : hasError ? (
                <BookOpen className="w-8 h-8 text-muted-foreground/40" />
              ) : (
                <BookOpen className="w-8 h-8 text-muted-foreground/40" />
              )}
            </div>
            <p className="font-medium">
              {!isOnline ? 'Offline Mode' : hasError ? 'Tutorial Visual' : 'Tutorial GIF'}: {alt}
            </p>
            {!isOnline ? (
              <p className="text-xs text-muted-foreground/70">
                Tutorial visuals will load when back online
              </p>
            ) : hasError ? (
              <p className="text-xs text-muted-foreground/70">
                {fallbackText || 'Follow the numbered steps below for guidance'}
              </p>
            ) : !shouldLoad ? (
              <p className="text-xs text-muted-foreground/70 animate-pulse">
                Loading tutorial...
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/70">
                Visual demonstration will appear here when available
              </p>
            )}
          </div>
        </div>
      )}
      
      {shouldLoad && isOnline && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`w-full rounded-lg border shadow-sm transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0 absolute'
          }`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
        />
      )}
      
      {caption && (isLoaded || showPlaceholder) && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          {caption}
        </p>
      )}
    </div>
  );
};

// Example usage in your tutorials:
// <TutorialGif 
//   src="/assets/tutorials/game-start-demo.gif" 
//   alt="Game Start Setup Demo"
//   caption="Setting up a new match with team and alliance selection"
//   fallbackText="Use the numbered steps below to set up your match"
// /> 
//   alt="Game Start Setup Demo"
//   caption="Setting up a new match with team and alliance selection"
// />

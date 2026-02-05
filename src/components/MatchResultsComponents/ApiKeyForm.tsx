import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/animate-ui/radix/checkbox';
import { Eye, EyeOff, Shield, Wifi, WifiOff } from 'lucide-react';

interface ApiKeyFormProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  nexusApiKey?: string;
  setNexusApiKey?: (key: string) => void;
  rememberForSession: boolean;
  setRememberForSession: (remember: boolean) => void;
  className?: string;
}

const ApiKeyForm: React.FC<ApiKeyFormProps> = ({
  apiKey,
  setApiKey,
  nexusApiKey = '',
  setNexusApiKey,
  rememberForSession,
  setRememberForSession,
  className = ""
}) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showNexusApiKey, setShowNexusApiKey] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const apiInputRef = useRef<HTMLInputElement | null>(null);
  const nexusApiInputRef = useRef<HTMLInputElement | null>(null);

  // Online status detection
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

  // Load API keys from sessionStorage on component mount
  useEffect(() => {
    const sessionApiKey = sessionStorage.getItem("tbaApiKey");
    const sessionNexusApiKey = sessionStorage.getItem("nexusApiKey");
    
    if (sessionApiKey) {
      setApiKey(sessionApiKey);
    }
    if (sessionNexusApiKey && setNexusApiKey) {
      setNexusApiKey(sessionNexusApiKey);
    }
    
    if (sessionApiKey || sessionNexusApiKey) {
      setRememberForSession(true);
    }
  }, [setApiKey, setNexusApiKey, setRememberForSession]);

  // Save/remove API keys from sessionStorage when remember preference changes
  useEffect(() => {
    if (rememberForSession) {
      if (apiKey) {
        sessionStorage.setItem("tbaApiKey", apiKey);
      }
      if (nexusApiKey && setNexusApiKey) {
        sessionStorage.setItem("nexusApiKey", nexusApiKey);
      }
    } else {
      sessionStorage.removeItem("tbaApiKey");
      sessionStorage.removeItem("nexusApiKey");
    }
  }, [rememberForSession, apiKey, nexusApiKey, setNexusApiKey]);

  useEffect(() => {
    // Check for autofilled values after a short delay
    const timeout = setTimeout(() => {
      if (apiInputRef.current) {
        const val = apiInputRef.current.value;
        if (val && val !== apiKey) {
          setApiKey(val);
        }
      }
      
      if (nexusApiInputRef.current && setNexusApiKey) {
        const nexusVal = nexusApiInputRef.current.value;
        if (nexusVal && nexusVal !== nexusApiKey) {
          setNexusApiKey(nexusVal);
        }
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiKey, nexusApiKey, setApiKey, setNexusApiKey]);

  return (
    <Card className={`w-full ${className} h-full`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>API Configuration</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter your API keys for TBA and Nexus data access
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <span className={`text-xs font-medium ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          <Label htmlFor="apiKey">TBA API Key</Label>
          <div className="relative pb-1">
            <Input
              ref={apiInputRef}
              id="apiKey"
              name="tba-api-key"
              type={showApiKey ? "text" : "password"}
              placeholder="Enter your Blue Alliance API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Get your API key from <a href="https://www.thebluealliance.com/account" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">The Blue Alliance</a>
          </p>
        </div>

        {/* Nexus API Key - Optional */}
        {setNexusApiKey && (
          <div className="space-y-2">
            <Label htmlFor="nexusApiKey">Nexus API Key (Optional)</Label>
            <div className="relative pb-1">
              <Input
                ref={nexusApiInputRef}
                id="nexusApiKey"
                name="nexus-api-key"
                type={showNexusApiKey ? "text" : "password"}
                placeholder="Enter your Nexus API key for pit data"
                value={nexusApiKey}
                onChange={(e) => setNexusApiKey(e.target.value)}
                className="w-full pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowNexusApiKey(!showNexusApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                aria-label={showNexusApiKey ? "Hide Nexus API key" : "Show Nexus API key"}
              >
                {showNexusApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from <a href="https://frc.nexus/api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">frc.nexus/api</a> for pit addresses and maps
            </p>
          </div>
        )}
          
        {/* Session storage option */}
        <div className="flex items-center space-x-3 mt-2 pb-2 p-3 -ml-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <Checkbox
            id="rememberSession"
            checked={rememberForSession}
            onCheckedChange={(checked) => setRememberForSession(checked === true)}
            className="shrink-0"
          />
          <label htmlFor="rememberSession" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
            Remember for this session only
          </label>
        </div>
        
        {/* Security notice */}
        <div className="flex items-start space-x-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
          <Shield className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            API keys are never stored permanently for security. Use your browser's password manager for convenient access.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ApiKeyForm;

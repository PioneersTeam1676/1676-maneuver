import { Button } from "@/components/ui/button";
import { Minimize2, ChevronLeft, ChevronRight } from "lucide-react";

interface Stage {
  id: string;
  label: string;
}

interface FieldCanvasHeaderProps {
  currentStage: Stage;
  hideControls: boolean;
  onStageSwitch: (direction: 'prev' | 'next') => void;
  onToggleFullscreen: () => void;
}

export const FieldCanvasHeader = ({
  currentStage,
  hideControls,
  onStageSwitch,
  onToggleFullscreen
}: FieldCanvasHeaderProps) => {
  return (
    <div className="flex-shrink-0 p-3 md:p-4 border-b bg-background">
      <div className="grid grid-cols-3 items-center">
        {/* Left side - Title */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg md:text-xl font-bold truncate">
            Field Strategy
          </h2>
          
          {/* Phase name when controls are hidden on any screen size */}
          {hideControls && (
            <div className="text-sm font-medium bg-primary/10 px-3 py-1 rounded-full">
              {currentStage?.label}
            </div>
          )}
        </div>
        
        {/* Center - Phase controls on medium+ screens when controls are visible */}
        <div className="hidden md:flex items-center justify-center gap-2">
          {!hideControls && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStageSwitch('prev')}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden lg:inline">Previous</span>
              </Button>
              
              <div className="text-sm font-medium bg-primary/10 px-3 py-1 rounded-full">
                {currentStage?.label}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStageSwitch('next')}
                className="flex items-center gap-1"
              >
                <span className="hidden lg:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        
        {/* Right side - Exit button */}
        <div className="flex items-center justify-end">
          <Button onClick={onToggleFullscreen} variant="outline" size="sm">
            <Minimize2 className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Exit Fullscreen</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

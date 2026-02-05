import { Button } from "@/components/ui/button";
// import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { GenericSelector } from "@/components/ui/generic-selector";
import { X } from "lucide-react";

type AggregationType = "average" | "median" | "max" | "75th";

interface StrategyHeaderProps {
  filteredTeamCount: number;
  totalTeamCount: number;
  activeFilterCount: number;
  selectedEvent: string;
  onEventChange: (event: string) => void;
  availableEvents: string[];
  aggregationType: AggregationType;
  onAggregationTypeChange: (type: AggregationType) => void;
  onClearAllFilters: () => void;
  isSettingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  chartType: "bar" | "scatter" | "box" | "stacked";
  onChartTypeChange: (type: "bar" | "scatter" | "box" | "stacked") => void;
}

export const StrategyHeader = ({
  filteredTeamCount,
  totalTeamCount,
  activeFilterCount,
  selectedEvent,
  onEventChange,
  availableEvents,
  aggregationType,
  onAggregationTypeChange,
  onClearAllFilters,
  // isSettingsOpen,
  // onSettingsOpenChange,
  chartType,
  // onChartTypeChange,
}: StrategyHeaderProps) => {
  const handleAggregationTypeChange = (value: string) => {
    onAggregationTypeChange(value as AggregationType);
  };

  // const handleChartTypeChange = (value: string) => {
  //   onChartTypeChange(value as "bar" | "scatter");
  // };

  return (
    <div className="flex flex-col md:flex-row justify-between">
      <div>
        <h1 className="text-2xl font-bold pb-2">Strategy Overview</h1>
        <p className="text-muted-foreground pb-8 md:pb-0">
          Team performance analysis with {filteredTeamCount} teams
          {activeFilterCount > 0 && (
            <span className="ml-2">
              (filtered from {totalTeamCount})
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClearAllFilters}
                className="ml-2 h-auto p-1 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            </span>
          )}
        </p>
      </div>
      
      <div className="flex gap-2 pb-4 items-center">
        {/* Event Filter */}
        <GenericSelector
          label="Select Event"
          value={selectedEvent}
          availableOptions={["all", ...availableEvents]}
          onValueChange={onEventChange}
          placeholder="All Events"
          displayFormat={(val) => val}
          className="w-48"
        />

        {/* Aggregation Type */}
        <div className="relative">
          <GenericSelector
            label="Select Aggregation Type"
            value={aggregationType}
            availableOptions={["average", "median", "max", "75th"]}
            onValueChange={chartType === "box" ? () => {} : handleAggregationTypeChange}
            placeholder="Aggregation type"
            displayFormat={(val) => {
              switch (val) {
                case "average": return "Average";
                case "median": return "Median";
                case "max": return "Max";
                case "75th": return "75th %";
                default: return val;
              }
            }}
            className={`w-32 ${chartType === "box" ? "opacity-50 pointer-events-none" : ""}`}
          />
        </div>

        {/* Settings */}
        {/* <Sheet open={isSettingsOpen} onOpenChange={onSettingsOpenChange}>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex h-10 w-10 items-center justify-center">
              <Settings className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-96 px-4">
            <SheetHeader>
              <SheetTitle>Chart Settings</SheetTitle>
              <SheetDescription>
                Configure chart display options and preferences
              </SheetDescription>
            </SheetHeader>
            
            <div className="space-y-6 mt-6 px-4">
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Chart Preferences
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Default Chart Type</label>
                    <GenericSelector
                      label="Select Chart Type"
                      value={chartType}
                      availableOptions={["bar", "scatter"]}
                      onValueChange={handleChartTypeChange}
                      placeholder="Chart type"
                      displayFormat={(val) => val === "bar" ? "Bar Chart" : "Scatter Plot"}
                      className="w-32"
                    />
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet> */}
      </div>
    </div>
  );
};

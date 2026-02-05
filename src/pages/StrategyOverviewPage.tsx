import { useState, useEffect, useMemo } from "react";
import { loadScoutingData } from "@/lib/scoutingDataUtils";
import type { ScoutingDataWithId } from "@/lib/scoutingDataUtils";
import { StrategyHeader, StrategyChart, TeamStatsTableEnhanced } from "@/components/StrategyComponents";
import { useTeamStatistics, useChartData } from "@/hooks";
import { analytics } from '@/lib/analytics';

type AggregationType = "average" | "median" | "max" | "75th";
type FilterOperator = ">" | ">=" | "<" | "<=" | "=" | "!=";

interface ColumnFilter {
  operator: FilterOperator;
  value: number;
}

interface ColumnConfig {
  key: string;
  label: string;
  category: string;
  visible: boolean;
  numeric: boolean;
  percentage?: boolean; // New property for percentage-based columns
}

const StrategyOverviewPage = () => {
  const [scoutingData, setScoutingData] = useState<ScoutingDataWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [aggregationType, setAggregationType] = useState<AggregationType>("average");
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [chartMetric, setChartMetric] = useState<string>("totalPoints");
  const [chartType, setChartType] = useState<"bar" | "scatter" | "box" | "stacked">("bar");
  const [scatterXMetric, setScatterXMetric] = useState<string>("totalCoral");
  const [scatterYMetric, setScatterYMetric] = useState<string>("totalAlgae");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({});

  // Default column configuration
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>([
    // Team Info
    { key: "teamNumber", label: "Team", category: "Team Info", visible: true, numeric: false },
    { key: "eventName", label: "Event", category: "Team Info", visible: true, numeric: false },
    { key: "matchCount", label: "Matches", category: "Team Info", visible: true, numeric: true },
    
    // Auto Scoring
    { key: "autoCoralPlaceL1Count", label: "Auto L1", category: "Auto Coral", visible: true, numeric: true },
    { key: "autoCoralPlaceL2Count", label: "Auto L2", category: "Auto Coral", visible: true, numeric: true },
    { key: "autoCoralPlaceL3Count", label: "Auto L3", category: "Auto Coral", visible: true, numeric: true },
    { key: "autoCoralPlaceL4Count", label: "Auto L4", category: "Auto Coral", visible: true, numeric: true },
    { key: "autoCoralPlaceDropMissCount", label: "Auto Drops", category: "Auto Coral", visible: false, numeric: true },
    
    // Auto Pickup
    { key: "autoCoralPickPreloadCount", label: "Auto Preload", category: "Auto Pickup", visible: false, numeric: true },
    { key: "autoCoralPickStationCount", label: "Auto Station", category: "Auto Pickup", visible: false, numeric: true },
    
    // Auto Algae
    { key: "autoAlgaePlaceNetShot", label: "Auto Net", category: "Auto Algae", visible: true, numeric: true },
    { key: "autoAlgaePlaceProcessor", label: "Auto Processor", category: "Auto Algae", visible: false, numeric: true },
    { key: "autoPassedStartLine", label: "Auto Line", category: "Auto Other", visible: false, numeric: false },
    
    // Teleop Coral
    { key: "teleopCoralPlaceL1Count", label: "Teleop L1", category: "Teleop Coral", visible: true, numeric: true },
    { key: "teleopCoralPlaceL2Count", label: "Teleop L2", category: "Teleop Coral", visible: true, numeric: true },
    { key: "teleopCoralPlaceL3Count", label: "Teleop L3", category: "Teleop Coral", visible: true, numeric: true },
    { key: "teleopCoralPlaceL4Count", label: "Teleop L4", category: "Teleop Coral", visible: true, numeric: true },
    { key: "teleopCoralPlaceDropMissCount", label: "Teleop Drops", category: "Teleop Coral", visible: false, numeric: true },
    
    // Teleop Pickup
    { key: "teleopCoralPickStationCount", label: "Teleop Station", category: "Teleop Pickup", visible: false, numeric: true },
    { key: "teleopCoralPickCarpetCount", label: "Teleop Carpet", category: "Teleop Pickup", visible: false, numeric: true },
    
    // Teleop Algae
    { key: "teleopAlgaePlaceNetShot", label: "Teleop Net", category: "Teleop Algae", visible: true, numeric: true },
    { key: "teleopAlgaePlaceProcessor", label: "Teleop Processor", category: "Teleop Algae", visible: false, numeric: true },
    { key: "teleopAlgaePickReefCount", label: "Teleop Reef", category: "Teleop Algae", visible: false, numeric: true },
    
    // Endgame
    { key: "shallowClimbAttempted", label: "Shallow Climb", category: "Endgame", visible: true, numeric: false },
    { key: "deepClimbAttempted", label: "Deep Climb", category: "Endgame", visible: true, numeric: false },
    { key: "parkAttempted", label: "Park", category: "Endgame", visible: false, numeric: false },
    { key: "climbFailed", label: "Climb Failed", category: "Endgame", visible: false, numeric: false },
    
    // Issues
    { key: "playedDefense", label: "Defense", category: "Issues", visible: false, numeric: false },
    { key: "brokeDown", label: "Broke Down", category: "Issues", visible: false, numeric: false },
    
    // Aggregate Columns
    { key: "totalPieces", label: "Total Pieces", category: "Aggregates", visible: true, numeric: true },
    { key: "totalCoral", label: "Total Coral", category: "Aggregates", visible: true, numeric: true },
    { key: "totalAlgae", label: "Total Algae", category: "Aggregates", visible: true, numeric: true },
    { key: "totalPoints", label: "Total Points", category: "Aggregates", visible: true, numeric: true },
    { key: "autoPoints", label: "Auto Points", category: "Aggregates", visible: false, numeric: true },
    { key: "teleopPoints", label: "Teleop Points", category: "Aggregates", visible: false, numeric: true },
    { key: "endgamePoints", label: "Endgame Points", category: "Aggregates", visible: false, numeric: true },
  ]);

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const data = await loadScoutingData();
        setScoutingData(data.entries);
        
        // Track strategy page usage
        analytics.trackPageNavigation('strategy_overview');
      } catch (error) {
        console.error("Error loading scouting data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Load saved settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem("strategyOverviewSettings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        
        // For columnConfig, we need to merge with default config to ensure new columns are included
        if (parsed.columnConfig) {
          const defaultConfig = [
            // Team Info
            { key: "teamNumber", label: "Team", category: "Team Info", visible: true, numeric: false },
            { key: "eventName", label: "Event", category: "Team Info", visible: true, numeric: false },
            { key: "matchCount", label: "Matches", category: "Team Info", visible: true, numeric: true },
            
            // Auto Scoring
            { key: "autoCoralPlaceL1Count", label: "Auto L1", category: "Auto Coral", visible: true, numeric: true },
            { key: "autoCoralPlaceL2Count", label: "Auto L2", category: "Auto Coral", visible: true, numeric: true },
            { key: "autoCoralPlaceL3Count", label: "Auto L3", category: "Auto Coral", visible: true, numeric: true },
            { key: "autoCoralPlaceL4Count", label: "Auto L4", category: "Auto Coral", visible: true, numeric: true },
            { key: "autoCoralPlaceDropMissCount", label: "Auto Drops", category: "Auto Coral", visible: false, numeric: true },
            
            // Auto Pickup
            { key: "autoCoralPickPreloadCount", label: "Auto Preload", category: "Auto Pickup", visible: false, numeric: true },
            { key: "autoCoralPickStationCount", label: "Auto Station", category: "Auto Pickup", visible: false, numeric: true },
            
            // Auto Algae
            { key: "autoAlgaePlaceNetShot", label: "Auto Net", category: "Auto Algae", visible: true, numeric: true },
            { key: "autoAlgaePlaceProcessor", label: "Auto Processor", category: "Auto Algae", visible: false, numeric: true },
            { key: "autoPassedStartLine", label: "Auto Line", category: "Auto Other", visible: false, numeric: false, percentage: true },
            
            // Teleop Coral
            { key: "teleopCoralPlaceL1Count", label: "Teleop L1", category: "Teleop Coral", visible: true, numeric: true },
            { key: "teleopCoralPlaceL2Count", label: "Teleop L2", category: "Teleop Coral", visible: true, numeric: true },
            { key: "teleopCoralPlaceL3Count", label: "Teleop L3", category: "Teleop Coral", visible: true, numeric: true },
            { key: "teleopCoralPlaceL4Count", label: "Teleop L4", category: "Teleop Coral", visible: true, numeric: true },
            { key: "teleopCoralPlaceDropMissCount", label: "Teleop Drops", category: "Teleop Coral", visible: false, numeric: true },
            
            // Teleop Pickup
            { key: "teleopCoralPickStationCount", label: "Teleop Station", category: "Teleop Pickup", visible: false, numeric: true },
            { key: "teleopCoralPickCarpetCount", label: "Teleop Carpet", category: "Teleop Pickup", visible: false, numeric: true },
            
            // Teleop Algae
            { key: "teleopAlgaePlaceNetShot", label: "Teleop Net", category: "Teleop Algae", visible: true, numeric: true },
            { key: "teleopAlgaePlaceProcessor", label: "Teleop Processor", category: "Teleop Algae", visible: false, numeric: true },
            { key: "teleopAlgaePickReefCount", label: "Teleop Reef", category: "Teleop Algae", visible: false, numeric: true },
            
            // Endgame
            { key: "shallowClimbAttempted", label: "Shallow Climb", category: "Endgame", visible: true, numeric: false, percentage: true },
            { key: "deepClimbAttempted", label: "Deep Climb", category: "Endgame", visible: true, numeric: false, percentage: true },
            { key: "parkAttempted", label: "Park", category: "Endgame", visible: false, numeric: false, percentage: true },
            { key: "climbFailed", label: "Climb Failed", category: "Endgame", visible: false, numeric: false, percentage: true },
            
            // Issues
            { key: "playedDefense", label: "Defense", category: "Other", visible: false, numeric: false, percentage: true },
            { key: "brokeDown", label: "Broke Down", category: "Other", visible: false, numeric: false, percentage: true },
            
            // Aggregate Columns
            { key: "totalPieces", label: "Total Pieces", category: "Aggregates", visible: true, numeric: true },
            { key: "totalCoral", label: "Total Coral", category: "Aggregates", visible: true, numeric: true },
            { key: "totalAlgae", label: "Total Algae", category: "Aggregates", visible: true, numeric: true },
            { key: "totalPoints", label: "Total Points", category: "Aggregates", visible: true, numeric: true },
            { key: "autoPoints", label: "Auto Points", category: "Aggregates", visible: false, numeric: true },
            { key: "teleopPoints", label: "Teleop Points", category: "Aggregates", visible: false, numeric: true },
            { key: "endgamePoints", label: "Endgame Points", category: "Aggregates", visible: false, numeric: true },
          ];
          
          // Merge saved config with default config, preserving saved visibility settings
          const mergedConfig = defaultConfig.map(defaultCol => {
            const savedCol = parsed.columnConfig.find((col: ColumnConfig) => col.key === defaultCol.key);
            return savedCol ? { ...defaultCol, visible: savedCol.visible } : defaultCol;
          });
          
          setColumnConfig(mergedConfig);
        }
        
        if (parsed.aggregationType) setAggregationType(parsed.aggregationType);
        if (parsed.selectedEvent) setSelectedEvent(parsed.selectedEvent);
        if (parsed.chartMetric) setChartMetric(parsed.chartMetric);
        if (parsed.chartType) setChartType(parsed.chartType);
        if (parsed.scatterXMetric) setScatterXMetric(parsed.scatterXMetric);
        if (parsed.scatterYMetric) setScatterYMetric(parsed.scatterYMetric);
        if (parsed.columnFilters) setColumnFilters(parsed.columnFilters);
      } catch (error) {
        console.error("Error loading saved settings:", error);
      }
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    const settings = {
      columnConfig,
      aggregationType,
      selectedEvent,
      chartMetric,
      chartType,
      scatterXMetric,
      scatterYMetric,
      columnFilters,
    };
    localStorage.setItem("strategyOverviewSettings", JSON.stringify(settings));
  }, [columnConfig, aggregationType, selectedEvent, chartMetric, chartType, scatterXMetric, scatterYMetric, columnFilters]);

  // Get unique events from data
  const availableEvents = useMemo(() => {
    const events = new Set<string>();
    scoutingData.forEach(entry => {
      if (entry.data.eventName) {
        events.add(entry.data.eventName as string);
      }
    });
    return Array.from(events).sort();
  }, [scoutingData]);

  // Filter data by event
  const filteredData = useMemo(() => {
    if (selectedEvent === "all") return scoutingData;
    return scoutingData.filter(entry => entry.data.eventName === selectedEvent);
  }, [scoutingData, selectedEvent]);

  // Use custom hooks for team statistics and chart data
  const { teamStats, filteredTeamStats } = useTeamStatistics(
    filteredData,
    columnConfig,
    aggregationType,
    columnFilters
  );

  const { chartData, chartConfig } = useChartData(
    filteredTeamStats,
    chartType,
    chartMetric,
    scatterXMetric,
    scatterYMetric,
    columnConfig
  );

  // Toggle column visibility
  const toggleColumn = (key: string) => {
    setColumnConfig(prev => 
      prev.map(col => 
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  // Set column filter
  const setColumnFilter = (columnKey: string, operator: FilterOperator, value: number) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: { operator, value }
    }));
  };

  // Remove column filter
  const removeColumnFilter = (columnKey: string) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnKey];
      return newFilters;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setColumnFilters({});
  };

  // Quick column presets
  const applyColumnPreset = (preset: string) => {
    setColumnConfig(prev => prev.map(col => {
      switch (preset) {
        case "essential":
          return { 
            ...col, 
            visible: ["teamNumber", "eventName", "matchCount", "totalPieces", "totalPoints", "autoCoralPlaceL4Count", "teleopCoralPlaceL4Count", "deepClimbAttempted"].includes(col.key)
          };
        case "auto":
          return { 
            ...col, 
            visible: col.category === "Team Info" || col.category.includes("Auto") || col.category === "Aggregates"
          };
        case "teleop":
          return { 
            ...col, 
            visible: col.category === "Team Info" || col.category.includes("Teleop") || col.category === "Aggregates"
          };
        case "endgame":
          return { 
            ...col, 
            visible: col.category === "Team Info" || col.category === "Endgame" || col.category === "Aggregates"
          };
        case "aggregates":
          return { 
            ...col, 
            visible: col.category === "Team Info" || col.category === "Aggregates"
          };
        case "basic":
          return { 
            ...col, 
            visible: ["teamNumber", "eventName", "matchCount"].includes(col.key)
          };
        default:
          return col;
      }
    }));
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-muted-foreground">Loading strategy data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col p-4 md:p-4 space-y-4 md:space-y-8 pb-6">
      {/* Header */}
      <StrategyHeader
        filteredTeamCount={filteredTeamStats.length}
        totalTeamCount={teamStats.length}
        activeFilterCount={Object.keys(columnFilters).length}
        selectedEvent={selectedEvent}
        onEventChange={setSelectedEvent}
        availableEvents={availableEvents}
        aggregationType={aggregationType}
        onAggregationTypeChange={setAggregationType}
        onClearAllFilters={clearAllFilters}
        isSettingsOpen={isSettingsOpen}
        onSettingsOpenChange={setIsSettingsOpen}
        chartType={chartType}
        onChartTypeChange={setChartType}
      />

      {/* Chart Section */}
      <StrategyChart
        chartData={chartData}
        chartType={chartType}
        onChartTypeChange={setChartType}
        chartMetric={chartMetric}
        onChartMetricChange={setChartMetric}
        scatterXMetric={scatterXMetric}
        onScatterXMetricChange={setScatterXMetric}
        scatterYMetric={scatterYMetric}
        onScatterYMetricChange={setScatterYMetric}
        columnConfig={columnConfig}
        chartConfig={chartConfig}
      />

      {/* Data Table */}
      <div className="flex-1 flex flex-col min-h-0">
        <TeamStatsTableEnhanced
          teamStats={teamStats}
          filteredTeamStats={filteredTeamStats}
          columnConfig={columnConfig}
          columnFilters={columnFilters}
          onToggleColumn={toggleColumn}
          onApplyPreset={applyColumnPreset}
          onSetColumnFilter={setColumnFilter}
          onRemoveColumnFilter={removeColumnFilter}
          onClearAllFilters={clearAllFilters}
          isColumnSettingsOpen={isColumnSettingsOpen}
          onColumnSettingsOpenChange={setIsColumnSettingsOpen}
        />
      </div>
    </div>
  );
};

export default StrategyOverviewPage;

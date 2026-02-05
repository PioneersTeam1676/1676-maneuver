import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/animate-ui/radix/tabs";
import { Eye } from "lucide-react";

interface TeamStats {
  teamNumber: string;
  matchesPlayed: number;
  avgAutoCoralTotal: number;
  avgTeleopCoralTotal: number;
  avgTotalCoralTotal: number;
  avgAutoCoralL1: number;
  avgAutoCoralL2: number;
  avgAutoCoralL3: number;
  avgAutoCoralL4: number;
  avgTeleopCoralL1: number;
  avgTeleopCoralL2: number;
  avgTeleopCoralL3: number;
  avgTeleopCoralL4: number;
  avgTotalCoralL1: number;
  avgTotalCoralL2: number;
  avgTotalCoralL3: number;
  avgTotalCoralL4: number;
  avgAutoAlgaeTotal: number;
  avgTeleopAlgaeTotal: number;
  avgTotalAlgaeTotal: number;
  avgAutoAlgaeNet: number;
  avgAutoAlgaeProcessor: number;
  avgTeleopAlgaeNet: number;
  avgTeleopAlgaeProcessor: number;
  climbRate: number;
  breakdownRate: number;
  defenseRate: number;
  mobilityRate: number;
  startPositions: {
    position0: number;
    position1: number;
    position2: number;
    position3: number;
    position4: number;
  };
}

interface TeamStatsButtonProps {
  teamNumber: string;
  teamStats?: TeamStats;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function TeamStatsButton({ teamNumber, teamStats, variant = "outline", size = "sm", className = "" }: TeamStatsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("coral");

  if (!teamStats) {
    return (
      <Button variant={variant} size={size} className={className} disabled>
        <Eye className="w-3 h-3" />
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Eye className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] h-[min(600px,90vh)] flex flex-col p-6">
        <DialogHeader className="flex-shrink-0 px-0">
          <DialogTitle>Team {teamNumber} Detailed Stats</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col" enableSwipe={true}>
            <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
              <TabsTrigger value="coral">Coral</TabsTrigger>
              <TabsTrigger value="algae">Algae</TabsTrigger>
              <TabsTrigger value="climb">Climb</TabsTrigger>
              <TabsTrigger value="start">Start Pos</TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-y-auto px-0">
              <TabsContent value="coral" className="space-y-4 h-full">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">Auto Coral Scoring</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Level 1:</span>
                        <span className="font-bold">{teamStats.avgAutoCoralL1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Level 2:</span>
                        <span className="font-bold">{teamStats.avgAutoCoralL2}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Level 3:</span>
                        <span className="font-bold">{teamStats.avgAutoCoralL3}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Level 4:</span>
                        <span className="font-bold">{teamStats.avgAutoCoralL4}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-blue-600">{teamStats.avgAutoCoralTotal}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Teleop Coral Scoring</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Level 1:</span>
                        <span className="font-bold">{teamStats.avgTeleopCoralL1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Level 2:</span>
                        <span className="font-bold">{teamStats.avgTeleopCoralL2}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Level 3:</span>
                        <span className="font-bold">{teamStats.avgTeleopCoralL3}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Level 4:</span>
                        <span className="font-bold">{teamStats.avgTeleopCoralL4}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-purple-600">{teamStats.avgTeleopCoralTotal}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Combined Totals */}
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="font-semibold mb-3">Combined Totals (Auto + Teleop)</h4>
                  <div className="grid grid-cols-2 gap-4 pb-2">
                    <div className="flex justify-between">
                      <span>Level 1:</span>
                      <span className="font-bold">{teamStats.avgTotalCoralL1}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Level 2:</span>
                      <span className="font-bold">{teamStats.avgTotalCoralL2}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Level 3:</span>
                      <span className="font-bold">{teamStats.avgTotalCoralL3}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Level 4:</span>
                      <span className="font-bold">{teamStats.avgTotalCoralL4}</span>
                    </div>
                  </div>
                  <div className="flex justify-between pt-2 border-t font-semibold">
                    <span>Total Coral:</span>
                    <span className="text-green-600">{teamStats.avgTotalCoralTotal}</span>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="algae" className="space-y-4 h-full">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">Auto Algae Scoring</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Net Shots:</span>
                        <span className="font-bold">{teamStats.avgAutoAlgaeNet}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Processor:</span>
                        <span className="font-bold">{teamStats.avgAutoAlgaeProcessor}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-green-600">{teamStats.avgAutoAlgaeTotal}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Teleop Algae Scoring</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Net Shots:</span>
                        <span className="font-bold">{teamStats.avgTeleopAlgaeNet}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Processor:</span>
                        <span className="font-bold">{teamStats.avgTeleopAlgaeProcessor}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span className="font-semibold">Total:</span>
                        <span className="font-bold text-orange-600">{teamStats.avgTeleopAlgaeTotal}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Combined Algae Total */}
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex justify-between font-semibold">
                    <span>Total Algae (Auto + Teleop):</span>
                    <span className="text-green-600">{teamStats.avgTotalAlgaeTotal}</span>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="climb" className="space-y-4 h-full">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">Performance Rates</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Climb Rate:</span>
                        <span className="font-bold text-purple-600">{teamStats.climbRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mobility Rate:</span>
                        <span className="font-bold text-blue-600">{teamStats.mobilityRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Defense Rate:</span>
                        <span className="font-bold text-gray-600">{teamStats.defenseRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Breakdown Rate:</span>
                        <span className="font-bold text-red-600">{teamStats.breakdownRate}%</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Match Info</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Matches Played:</span>
                        <span className="font-bold text-orange-600">{teamStats.matchesPlayed}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="start" className="space-y-4 h-full">
                <div>
                  <h4 className="font-semibold mb-3">Auto Starting Positions</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {[0, 1, 2, 3, 4].map(pos => (
                      <div key={pos} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded">
                        <div className="text-sm text-muted-foreground">Position {pos}</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {teamStats.startPositions[`position${pos}` as keyof typeof teamStats.startPositions]}%
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Percentage of matches started from each position
                  </p>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
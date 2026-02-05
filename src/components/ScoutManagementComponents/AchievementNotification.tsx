import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Trophy, Star } from 'lucide-react';
import { ACHIEVEMENT_TIERS, type Achievement } from '@/lib/achievementTypes';

interface AchievementNotificationProps {
  achievements: Achievement[];
  onDismiss: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
}

export const AchievementNotification: React.FC<AchievementNotificationProps> = ({
  achievements,
  onDismiss,
  autoHide = true,
  autoHideDelay = 8000
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (achievements.length > 0) {
      setVisible(true);
      
      if (autoHide) {
        const timer = setTimeout(() => {
          setVisible(false);
          setTimeout(onDismiss, 300); // Allow animation to complete
        }, autoHideDelay);
        
        return () => clearTimeout(timer);
      }
    }
  }, [achievements, autoHide, autoHideDelay, onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  if (achievements.length === 0 || !visible) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <Card className={`border-2 border-yellow-300 dark:border-yellow-700 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 shadow-lg transition-all duration-300 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-5 w-5 text-yellow-600" />
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  Achievement{achievements.length > 1 ? 's' : ''} Unlocked!
                </h3>
              </div>
              
              <div className="space-y-3">
                {achievements.map((achievement) => {
                  const tierStyle = ACHIEVEMENT_TIERS[achievement.tier];
                  return (
                    <div key={achievement.id} className="flex items-start gap-3">
                      <div className="text-2xl flex-shrink-0">
                        {achievement.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {achievement.name}
                          </span>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${tierStyle.textColor}`}
                            style={{ 
                              backgroundColor: tierStyle.color + '20',
                              borderColor: tierStyle.color 
                            }}
                          >
                            {achievement.tier.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {achievement.description}
                        </p>
                        <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                          <Star className="h-3 w-3" />
                          <span className="text-xs font-medium">+{achievement.piReward} Pis</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {achievements.length > 1 && (
                <div className="mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                    <Star className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Total: +{achievements.reduce((sum, a) => sum + a.piReward, 0)} Pis
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-gray-500 hover:text-gray-700 h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

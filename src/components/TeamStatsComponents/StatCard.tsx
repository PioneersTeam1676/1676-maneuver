import { Card } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  compareValue?: number;
}

export const StatCard = ({ 
  title, 
  value, 
  subtitle, 
  color = "blue", 
  compareValue 
}: StatCardProps) => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  const diff = compareValue !== undefined ? numValue - compareValue : undefined;
  
  return (
    <Card className="p-4">
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="flex items-center justify-center gap-2">
          <p className={`text-2xl font-bold text-${color}-600`}>{value}</p>
          {diff !== undefined && (
            <div className={`flex items-center text-sm ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {diff > 0 ? '+' : ''}{diff.toFixed(1)}
            </div>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    </Card>
  );
};

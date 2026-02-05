import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChevronDownIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface GenericSelectorProps {
  label: string;
  value: string;
  availableOptions: string[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  displayFormat?: (value: string) => string;
  buttonDisplayFormat?: (value: string) => string;
  className?: string;
}

export const GenericSelector = ({ 
  label, 
  value, 
  availableOptions,
  onValueChange,
  placeholder = "Select option",
  displayFormat = (val) => val,
  buttonDisplayFormat,
  className = ""
}: GenericSelectorProps) => {
  const isMobile = useIsMobile();

  const getDisplayText = (val: string) => {
    if (!val) return placeholder;
    if (val === "none") return buttonDisplayFormat ? buttonDisplayFormat(val) : "None";
    if (val === "all") return "All events";
    return buttonDisplayFormat ? buttonDisplayFormat(val) : displayFormat(val);
  };

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button 
            variant="outline" 
            className={`w-full justify-between h-10 ${className}`}
          >
            <span className="truncate">
              {getDisplayText(value)}
            </span>
            <ChevronDownIcon className="h-4 w-4 opacity-50" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[60vh] pb-8">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4">
            <div className="space-y-2">
              {availableOptions.includes("none") && (
                <SheetClose asChild>
                  <Button 
                    variant={value === "none" ? "default" : "outline"}
                    className="w-full justify-start h-12 px-4"
                    onClick={() => onValueChange("none")}
                  >
                    {displayFormat("none")}
                  </Button>
                </SheetClose>
              )}
              {availableOptions.includes("all") && (
                <SheetClose asChild>
                  <Button 
                    variant={value === "all" ? "default" : "outline"}
                    className="w-full justify-start h-12 px-4"
                    onClick={() => onValueChange("all")}
                  >
                    All events
                  </Button>
                </SheetClose>
              )}
              {availableOptions.filter(option => option !== "all" && option !== "none").map((option) => (
                <SheetClose key={option} asChild>
                  <Button 
                    variant={value === option ? "default" : "outline"}
                    className="w-full justify-start h-12 px-4"
                    onClick={() => onValueChange(option)}
                  >
                    {displayFormat(option)}
                  </Button>
                </SheetClose>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop version
  return (
    <Select 
      value={value || "none"} 
      onValueChange={onValueChange}
    >
      <SelectTrigger className={`h-10 w-full ${className}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {availableOptions.includes("none") && <SelectItem value="none">{displayFormat("none")}</SelectItem>}
        {availableOptions.includes("all") && <SelectItem value="all">All events</SelectItem>}
        {availableOptions.filter(option => option !== "all" && option !== "none").map((option) => (
          <SelectItem key={option} value={option}>
            {displayFormat(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

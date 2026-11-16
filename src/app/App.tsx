import { ThemeProvider } from "@/theme/ThemeProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { Shell } from "./Shell";

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={260} skipDelayDuration={120}>
        <Shell />
      </TooltipProvider>
    </ThemeProvider>
  );
}

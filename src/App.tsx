import './index.css'
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AppProvider } from "@/contexts/AppContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import StravaCallback from "./components/StravaCallback"; // ✅ UNCOMMENTED
import GarminCallback from "./components/GarminCallback";
import Connections from "./components/Connections";
import PlanSelect from "./pages/PlanSelect";
import PlansAdminImport from "./pages/PlansAdminImport";
import PlansCatalogPage from "./pages/PlansCatalog.tsx";
import MobilityPlanBuilderPage from "./pages/PTPlanBuilderPage";
import PlansBuild from "./pages/PlansBuild";
import PlanWizard from "./components/PlanWizard";

const queryClient = new QueryClient();

const App = () => (
<ThemeProvider defaultTheme="light">
<QueryClientProvider client={queryClient}>
<AppProvider>
<TooltipProvider delayDuration={300} disableHoverableContent>
<Toaster />
<Sonner />
<BrowserRouter>
<Routes>
<Route path="/" element={<Index />} />
<Route path="/privacy" element={<Privacy />} />
<Route path="/strava/callback" element={<StravaCallback />} /> {/* ✅ UNCOMMENTED */}
<Route path="/auth/garmin/callback" element={<GarminCallback />} />
<Route path="/connections" element={<Connections />} />
<Route path="/plans/select" element={<PlanSelect />} />
<Route path="/plans/admin" element={<PlansAdminImport />} />
<Route path="/plans/catalog" element={<PlansCatalogPage />} />
<Route path="/plans/build" element={<PlansBuild />} />
<Route path="/plans/pt" element={<MobilityPlanBuilderPage />} />
<Route path="/plans/generate" element={<PlanWizard />} />
<Route path="*" element={<NotFound />} />
</Routes>
</BrowserRouter>
</TooltipProvider>
</AppProvider>
</QueryClientProvider>
</ThemeProvider>
);

export default App;
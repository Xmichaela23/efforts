import './index.css'
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import StravaCallback from "./components/StravaCallback"; // ✅ UNCOMMENTED
import GarminCallback from "./components/GarminCallback";
import Connections from "./components/Connections";
import PlannedWorkoutDemo from "./components/PlannedWorkoutDemo";
import PlanSelect from "./pages/PlanSelect";
import PlansAdminImport from "./pages/PlansAdminImport";
import PlansCatalogPage from "./pages/PlansCatalog.tsx";

const queryClient = new QueryClient();

const App = () => (
<ThemeProvider defaultTheme="light">
<QueryClientProvider client={queryClient}>
<TooltipProvider>
<Toaster />
<Sonner />
<BrowserRouter>
<Routes>
<Route path="/" element={<Index />} />
<Route path="/privacy" element={<Privacy />} />
<Route path="/strava/callback" element={<StravaCallback />} /> {/* ✅ UNCOMMENTED */}
<Route path="/auth/garmin/callback" element={<GarminCallback />} />
<Route path="/connections" element={<Connections />} />
<Route path="/demo" element={<PlannedWorkoutDemo />} />
<Route path="/plans/select" element={<PlanSelect />} />
<Route path="/plans/admin" element={<PlansAdminImport />} />
<Route path="/plans/catalog" element={<PlansCatalogPage />} />
<Route path="*" element={<NotFound />} />
</Routes>
</BrowserRouter>
</TooltipProvider>
</QueryClientProvider>
</ThemeProvider>
);

export default App;
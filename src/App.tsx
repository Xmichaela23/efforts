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
<Route path="*" element={<NotFound />} />
</Routes>
</BrowserRouter>
</TooltipProvider>
</QueryClientProvider>
</ThemeProvider>
);

export default App;
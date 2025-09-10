import { useMediaQuery } from './useMediaQuery';

// Tailwind 'md' = 768px; adjust if your design differs
export const useCompact = () => useMediaQuery('(max-width: 768px)');



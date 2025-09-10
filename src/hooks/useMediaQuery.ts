import { useEffect, useState } from 'react';

export function useMediaQuery(query: string, initial = false) {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : initial);

  const [matches, setMatches] = useState<boolean>(get());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    // set once in case query changed
    setMatches(mql.matches);

    // Safari <14 fallback
    // @ts-ignore
    mql.addEventListener ? mql.addEventListener('change', onChange) : mql.addListener(onChange);
    return () => {
      // @ts-ignore
      mql.removeEventListener ? mql.removeEventListener('change', onChange) : mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}



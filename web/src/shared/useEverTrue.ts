import { useState } from 'react';

/** True from the first render where `value` is true, and stays true after it turns false again. */
export function useEverTrue(value: boolean): boolean {
  const [ever, setEver] = useState(value);
  if (value && !ever) setEver(true);
  return ever || value;
}

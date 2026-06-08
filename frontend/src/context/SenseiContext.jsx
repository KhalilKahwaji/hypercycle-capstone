import { createContext, useContext, useRef, useCallback } from "react";

const Ctx = createContext(null);

export function SenseiProvider({ children }) {
  const listenerRef = useRef(null);
  const reviveRef   = useRef(null);

  const triggerEvent = useCallback((eventKey) => {
    if (listenerRef.current) listenerRef.current(eventKey);
  }, []);

  const triggerRevive = useCallback(() => {
    if (reviveRef.current) reviveRef.current();
  }, []);

  const registerListener = useCallback((fn) => {
    listenerRef.current = fn;
    return () => { if (listenerRef.current === fn) listenerRef.current = null; };
  }, []);

  const registerRevive = useCallback((fn) => {
    reviveRef.current = fn;
    return () => { if (reviveRef.current === fn) reviveRef.current = null; };
  }, []);

  return (
    <Ctx.Provider value={{ triggerEvent, triggerRevive, registerListener, registerRevive }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSensei() {
  const ctx = useContext(Ctx);
  return ctx || { triggerEvent: () => {}, triggerRevive: () => {}, registerListener: () => () => {}, registerRevive: () => () => {} };
}

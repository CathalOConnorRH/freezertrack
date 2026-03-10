import { useState, useEffect } from "react";

export default function useTheme() {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem("theme") || "system";
  });

  const setTheme = (t) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
  };

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const isDark =
        theme === "dark" || (theme === "system" && mq.matches);
      root.classList.toggle("dark", isDark);
    };

    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  return { theme, setTheme };
}
